/**
 * Calling signaling event handlers for the Socket.IO gateway.
 *
 * CRITICAL INVARIANTS:
 * 1. Gateway is WRITE-FREE — never touches the database. All QcCall writes
 *    go through calling.service.ts + /api/calls.
 * 2. Every handler verifies the sender is a participant of the call (via
 *    persisted QcCall participant list) before relaying.
 * 3. Targets are resolved server-side from persisted QcCall — client never
 *    names a raw socket to forward to.
 * 4. One-active-call-per-user is enforced server-side in calling.service.ts.
 *
 * Phase 0 hardening:
 *  - §2.1: ringing timeouts are Redis-backed (see ringing.ts) instead of an
 *    in-process Map, so accept-on-instance-B clears a ring started on A and the
 *    per-instance sweeper fires timeouts exactly once.
 *  - §2.2: the verified participant set is cached socket-locally after the first
 *    strict DB verify; offer/answer/ice-candidate reuse it. Invalidated on
 *    call:end / call:cancel.
 */
import { db } from "@quikit/database";
import type { Server as IOServer, Socket } from "socket.io";
import { logger } from "./logger";
import { clearRinging, setRinging, type RingingRedis } from "./ringing";
import { userRoom } from "./rooms";


// ============================================================================
// Types
// ============================================================================


interface CallAuth {
  participantIds: string[];
  initiatorId: string;
}

interface CallingSocket extends Socket {
  data: {
    userId: string;
    orgId: string;
    /** §2.2 socket-local cache of verified call participants, keyed by callId. */
    callAuth?: Record<string, CallAuth>;
  };
}

export interface CallingDeps {
  /** Redis client backing the multi-instance ringing state (§2.1). */
  ringingRedis: RingingRedis;
}

// ============================================================================
// §2.2 — socket-local participant cache
// ============================================================================

function cacheFor(socket: CallingSocket): Record<string, CallAuth> {
  if (!socket.data.callAuth) socket.data.callAuth = {};
  return socket.data.callAuth;
}

/**
 * Resolve (and cache) the verified participant set for a call. First call does
 * the strict DB verify (call exists, in-org, sender is a participant); later
 * calls for the same callId on the same socket hit the cache. Returns null when
 * the sender is not authorized — callers must reject on null.
 */
async function resolveCallAuth(
  socket: CallingSocket,
  callId: string,
  orgId: string,
  userId: string,
): Promise<CallAuth | null> {
  const cache = cacheFor(socket);
  const cached = cache[callId];
  if (cached) {
    return cached.participantIds.includes(userId) ? cached : null;
  }
  const call = await db.qcCall.findUnique({
    where: { id: callId },
    include: { participants: true },
  });
  if (!call || call.orgId !== orgId) return null;
  if (!call.participants.some((p) => p.userId === userId)) return null;
  const auth: CallAuth = {
    participantIds: call.participants.map((p) => p.userId),
    initiatorId: call.initiatorId,
  };
  cache[callId] = auth;
  return auth;
}

function invalidateCallAuth(socket: CallingSocket, callId: string): void {
  if (socket.data.callAuth) delete socket.data.callAuth[callId];
}

// ============================================================================
// Registration
// ============================================================================

/**
 * Register calling signaling handlers on an already-authenticated socket.
 * Call this inside the `io.on("connection")` block in gateway.ts, AFTER the
 * handshake auth has pinned userId/orgId to socket.data.
 */
export function registerCallingHandlers(
  io: IOServer,
  socket: CallingSocket,
  deps: CallingDeps,
): void {
  const { userId, orgId } = socket.data;
  const { ringingRedis } = deps;

  // --- call:invite ---
  // Client sends { callId, targetUserId }. Gateway:
  // 1. Looks up QcCall, verifies sender is initiator
  // 2. Verifies target is a participant
  // 3. Checks target's user room for connected sockets
  // 4. Relays call:ringing to target's user room
  // 5. If zero sockets → emit call:unavailable to sender
  // 6. Registers a Redis-backed ringing record (§2.1) — the sweeper fires the
  //    timeout, so it survives even if this instance dies.
  socket.on(
    "call:invite",
    async (
      payload: { callId: string; targetUserId: string },
      ack?: (r: { ok: boolean }) => void,
    ) => {
      try {
        const { callId, targetUserId } = payload ?? {};
        if (typeof callId !== "string" || typeof targetUserId !== "string") {
          ack?.({ ok: false });
          return;
        }

        // Look up the call (strict — also seeds the §2.2 cache below).
        const call = await db.qcCall.findUnique({
          where: { id: callId },
          include: { participants: true },
        });
        if (!call || call.orgId !== orgId) {
          socket.emit("error", { event: "call:invite", message: "Call not found" });
          ack?.({ ok: false });
          return;
        }

        // Verify sender is the initiator
        if (call.initiatorId !== userId) {
          socket.emit("error", {
            event: "call:invite",
            message: "Only the initiator can send invites",
          });
          ack?.({ ok: false });
          return;
        }

        // Verify target is a participant
        const isParticipant = call.participants.some((p) => p.userId === targetUserId);
        if (!isParticipant) {
          socket.emit("error", { event: "call:invite", message: "Target is not a participant" });
          ack?.({ ok: false });
          return;
        }

        // Seed the §2.2 cache for subsequent offer/answer/ice on this socket.
        cacheFor(socket)[callId] = {
          participantIds: call.participants.map((p) => p.userId),
          initiatorId: call.initiatorId,
        };

        // Check if target has connected sockets in their user room
        const targetRoom = userRoom(orgId, targetUserId);
        const targetSockets = await io.in(targetRoom).fetchSockets();

        if (targetSockets.length === 0) {
          // Offline: immediate unavailable response
          socket.emit("call:unavailable", { callId, userId: targetUserId });
          ack?.({ ok: true });
          return;
        }

        // Ring all of target's tabs
        const ringPayload = {
          callId,
          channelId: call.channelId,
          type: call.type,
          initiatorId: call.initiatorId,
        };
        io.to(targetRoom).emit("call:ringing", ringPayload);

        // §2.1: register the ringing record in Redis. Any instance can clear it
        // (accept/reject/cancel/end), and the per-instance sweeper claims it
        // atomically once expired and emits call:timed_out.
        await setRinging(ringingRedis, {
          callId,
          initiatorId: call.initiatorId,
          targetUserId,
          channelId: call.channelId,
          orgId,
        });

        ack?.({ ok: true });
      } catch (e) {
        logger.error({ error: e, socketId: socket.id }, "call:invite handler error");
        ack?.({ ok: false });
      }
    },
  );

  // --- call:accepted ---
  // Callee notifies the gateway that the call was accepted, so the ringing
  // record is cleared. The actual accept is persisted via HTTP PATCH.
  socket.on(
    "call:accepted",
    async (payload: { callId: string }, ack?: (r: { ok: boolean }) => void) => {
      try {
        const { callId } = payload ?? {};
        if (typeof callId !== "string") {
          ack?.({ ok: false });
          return;
        }
        await clearRinging(ringingRedis, callId);
        logger.info({ callId, userId }, "call accepted — cleared ringing record");
        ack?.({ ok: true });
      } catch (e) {
        logger.error({ error: e, socketId: socket.id }, "call:accepted handler error");
        ack?.({ ok: false });
      }
    },
  );

  // --- call:ready ---
  // Relay readiness signal from callee to other participants (write-free).
  socket.on(
    "call:ready",
    async (payload: { callId: string }, ack?: (r: { ok: boolean }) => void) => {
      try {
        const { callId } = payload ?? {};
        if (typeof callId !== "string") {
          ack?.({ ok: false });
          return;
        }
        const auth = await resolveCallAuth(socket, callId, orgId, userId);
        if (!auth) {
          ack?.({ ok: false });
          return;
        }
        for (const pUserId of auth.participantIds) {
          if (pUserId === userId) continue;
          io.to(userRoom(orgId, pUserId)).emit("call:ready", { callId, fromUserId: userId });
        }
        ack?.({ ok: true });
      } catch (e) {
        logger.error({ error: e, socketId: socket.id }, "call:ready handler error");
        ack?.({ ok: false });
      }
    },
  );

  // --- call:offer ---
  // Relay WebRTC offer to the call's participants (excluding sender)
  socket.on(
    "call:offer",
    async (
      payload: { callId: string; sdp?: string; offer?: RTCSessionDescriptionInit },
      ack?: (r: { ok: boolean }) => void,
    ) => {
      try {
        const { callId, sdp, offer } = payload ?? {};
        const sdpData = sdp ?? JSON.stringify(offer);
        if (typeof callId !== "string" || !sdpData) {
          ack?.({ ok: false });
          return;
        }
        const auth = await resolveCallAuth(socket, callId, orgId, userId);
        if (!auth) {
          ack?.({ ok: false });
          return;
        }
        for (const pUserId of auth.participantIds) {
          if (pUserId === userId) continue;
          io.to(userRoom(orgId, pUserId)).emit("call:offer", {
            callId,
            sdp: sdpData,
            fromUserId: userId,
          });
        }
        ack?.({ ok: true });
      } catch (e) {
        logger.error({ error: e, socketId: socket.id }, "call:offer handler error");
        ack?.({ ok: false });
      }
    },
  );

  // --- call:answer ---
  // Relay WebRTC answer to the call's initiator
  socket.on(
    "call:answer",
    async (
      payload: { callId: string; sdp?: string; answer?: RTCSessionDescriptionInit },
      ack?: (r: { ok: boolean }) => void,
    ) => {
      try {
        const { callId, sdp, answer } = payload ?? {};
        const sdpData = sdp ?? JSON.stringify(answer);
        if (typeof callId !== "string" || !sdpData) {
          ack?.({ ok: false });
          return;
        }
        const auth = await resolveCallAuth(socket, callId, orgId, userId);
        if (!auth) {
          ack?.({ ok: false });
          return;
        }
        io.to(userRoom(orgId, auth.initiatorId)).emit("call:answer", {
          callId,
          sdp: sdpData,
          fromUserId: userId,
        });
        ack?.({ ok: true });
      } catch (e) {
        logger.error({ error: e, socketId: socket.id }, "call:answer handler error");
        ack?.({ ok: false });
      }
    },
  );

  // --- call:ice-candidate ---
  // Relay ICE candidate to all other participants
  socket.on(
    "call:ice-candidate",
    async (
      payload: {
        callId: string;
        candidate?: string | RTCIceCandidateInit;
        sdpMid?: string;
        sdpMLineIndex?: number;
      },
      ack?: (r: { ok: boolean }) => void,
    ) => {
      try {
        const { callId, candidate: rawCandidate, sdpMid, sdpMLineIndex } = payload ?? {};
        if (typeof callId !== "string" || rawCandidate == null) {
          ack?.({ ok: false });
          return;
        }

        // Normalize: accept either a JSON string or an object
        const candidateStr =
          typeof rawCandidate === "string" ? rawCandidate : JSON.stringify(rawCandidate);
        const mid = sdpMid ?? (typeof rawCandidate === "object" ? rawCandidate.sdpMid : undefined);
        const mLineIndex =
          sdpMLineIndex ??
          (typeof rawCandidate === "object" ? rawCandidate.sdpMLineIndex : undefined);

        const auth = await resolveCallAuth(socket, callId, orgId, userId);
        if (!auth) {
          ack?.({ ok: false });
          return;
        }

        for (const pUserId of auth.participantIds) {
          if (pUserId === userId) continue;
          io.to(userRoom(orgId, pUserId)).emit("call:ice-candidate", {
            callId,
            candidate: candidateStr,
            sdpMid: mid,
            sdpMLineIndex: mLineIndex,
            fromUserId: userId,
          });
        }
        ack?.({ ok: true });
      } catch (e) {
        logger.error({ error: e, socketId: socket.id }, "call:ice-candidate handler error");
        ack?.({ ok: false });
      }
    },
  );

  // --- call:reject ---
  // Relay rejection to the initiator. Client then calls PATCH /api/calls/:id to persist.
  socket.on(
    "call:reject",
    async (payload: { callId: string }, ack?: (r: { ok: boolean }) => void) => {
      try {
        const { callId } = payload ?? {};
        if (typeof callId !== "string") {
          ack?.({ ok: false });
          return;
        }
        const auth = await resolveCallAuth(socket, callId, orgId, userId);
        if (!auth) {
          ack?.({ ok: false });
          return;
        }
        await clearRinging(ringingRedis, callId);
        io.to(userRoom(orgId, auth.initiatorId)).emit("call:rejected", {
          callId,
          fromUserId: userId,
        });
        ack?.({ ok: true });
      } catch (e) {
        logger.error({ error: e, socketId: socket.id }, "call:reject handler error");
        ack?.({ ok: false });
      }
    },
  );

  // --- call:cancel ---
  // Relay cancellation to all participants. Client then calls PATCH /api/calls/:id.
  socket.on(
    "call:cancel",
    async (payload: { callId: string }, ack?: (r: { ok: boolean }) => void) => {
      try {
        const { callId } = payload ?? {};
        if (typeof callId !== "string") {
          ack?.({ ok: false });
          return;
        }
        const auth = await resolveCallAuth(socket, callId, orgId, userId);
        // Only the initiator can cancel.
        if (!auth || auth.initiatorId !== userId) {
          ack?.({ ok: false });
          return;
        }
        await clearRinging(ringingRedis, callId);
        for (const pUserId of auth.participantIds) {
          if (pUserId === userId) continue;
          io.to(userRoom(orgId, pUserId)).emit("call:cancelled", { callId });
        }
        invalidateCallAuth(socket, callId); // §2.2 — call is over
        ack?.({ ok: true });
      } catch (e) {
        logger.error({ error: e, socketId: socket.id }, "call:cancel handler error");
        ack?.({ ok: false });
      }
    },
  );

  // --- call:end ---
  // Relay end to all participants. Client then calls PATCH /api/calls/:id to persist.
  socket.on("call:end", async (payload: { callId: string }, ack?: (r: { ok: boolean }) => void) => {
    try {
      const { callId } = payload ?? {};
      if (typeof callId !== "string") {
        ack?.({ ok: false });
        return;
      }
      const auth = await resolveCallAuth(socket, callId, orgId, userId);
      if (!auth) {
        ack?.({ ok: false });
        return;
      }
      await clearRinging(ringingRedis, callId);
      for (const pUserId of auth.participantIds) {
        if (pUserId === userId) continue;
        io.to(userRoom(orgId, pUserId)).emit("call:ended", { callId, fromUserId: userId });
      }
      invalidateCallAuth(socket, callId); // §2.2 — call is over
      ack?.({ ok: true });
    } catch (e) {
      logger.error({ error: e, socketId: socket.id }, "call:end handler error");
      ack?.({ ok: false });
    }
  });
}
