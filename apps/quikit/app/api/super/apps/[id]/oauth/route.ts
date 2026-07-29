import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withSuperAdminAuth } from "@/lib/withSuperAdminAuth";
import { logAudit } from "@/lib/auditLog";
import bcrypt from "bcryptjs";
import crypto from "crypto";

/**
 * POST /api/super/apps/[id]/oauth — Create an OAuth client for an app
 */
export const POST = withSuperAdminAuth<{ id: string }>(async (auth, request: NextRequest, { params }) => {
  try {
    const { id } = params;

    const app = await db.app.findUnique({ where: { id } });
    if (!app) {
      return NextResponse.json(
        { success: false, error: "App not found" },
        { status: 404 },
      );
    }

    // Check if OAuth client already exists for this app
    const existingClient = await db.oAuthClient.findUnique({ where: { appId: id } });
    if (existingClient) {
      return NextResponse.json(
        { success: false, error: "OAuth client already exists for this app" },
        { status: 409 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const redirectUris: string[] = body.redirectUris || [];

    // Generate client credentials
    const clientId = app.slug;
    const plainSecret = crypto.randomBytes(32).toString("base64url");
    const hashedSecret = await bcrypt.hash(plainSecret, 12);

    const oauthClient = await db.oAuthClient.create({
      data: {
        appId: id,
        clientId,
        clientSecret: hashedSecret,
        redirectUris,
        scopes: ["openid", "profile", "email", "tenant"],
        grantTypes: ["authorization_code", "refresh_token"],
      },
    });

    logAudit({
      action: "create",
      entityType: "oauth_client",
      entityId: oauthClient.id,
      actorId: auth.userId,
      newValues: JSON.stringify({ clientId, appId: id }),
    });

    // Return the plain secret only this one time
    return NextResponse.json(
      {
        success: true,
        data: {
          clientId,
          clientSecret: plainSecret,
          redirectUris,
          scopes: oauthClient.scopes,
        },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});

/**
 * PATCH /api/super/apps/[id]/oauth — Rotate the OAuth client secret
 */
export const PATCH = withSuperAdminAuth<{ id: string }>(async (auth, _request: NextRequest, { params }) => {
  try {
    const { id } = params;

    const oauthClient = await db.oAuthClient.findUnique({ where: { appId: id } });
    if (!oauthClient) {
      return NextResponse.json(
        { success: false, error: "OAuth client not found for this app" },
        { status: 404 },
      );
    }

    const plainSecret = crypto.randomBytes(32).toString("base64url");
    const hashedSecret = await bcrypt.hash(plainSecret, 12);

    await db.oAuthClient.update({
      where: { appId: id },
      data: { clientSecret: hashedSecret },
    });

    logAudit({
      action: "rotate_secret",
      entityType: "oauth_client",
      entityId: oauthClient.id,
      actorId: auth.userId,
    });

    return NextResponse.json({
      success: true,
      data: {
        clientId: oauthClient.clientId,
        clientSecret: plainSecret,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});

/**
 * DELETE /api/super/apps/[id]/oauth — Remove the OAuth client
 */
export const DELETE = withSuperAdminAuth<{ id: string }>(async (auth, _request: NextRequest, { params }) => {
  try {
    const { id } = params;

    const oauthClient = await db.oAuthClient.findUnique({ where: { appId: id } });
    if (!oauthClient) {
      return NextResponse.json(
        { success: false, error: "OAuth client not found for this app" },
        { status: 404 },
      );
    }

    await db.oAuthClient.delete({ where: { appId: id } });

    logAudit({
      action: "delete",
      entityType: "oauth_client",
      entityId: oauthClient.id,
      actorId: auth.userId,
    });

    return NextResponse.json({ success: true, message: "OAuth client removed" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
