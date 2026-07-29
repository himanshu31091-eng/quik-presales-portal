import { NextResponse } from "next/server";
import type { ZodError } from "zod";

/**
 * Response envelope helpers. Every route in this app returns
 * `{ success: true, data }` or `{ success: false, error }` — the platform
 * contract from CLAUDE.md.
 */

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function created<T>(data: T) {
  return NextResponse.json({ success: true, data }, { status: 201 });
}

export function fail(status: number, error: string) {
  return NextResponse.json({ success: false, error }, { status });
}

export function notFound(what = "Resource") {
  return fail(404, `${what} not found`);
}

/** 400 from a Zod parse failure, with every issue joined into one message. */
export function validationError(error: ZodError) {
  return fail(400, error.issues.map((i) => i.message).join(", "));
}

/**
 * JSON-safe view of a Prisma row: BigInt → decimal string, Date → ISO string.
 *
 * `JSON.stringify` throws on BigInt, and money is stored as BigInt paise
 * throughout this app, so every response that can carry a money column runs
 * through here.
 */
export function serialize<T>(value: T): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, serialize(v)]),
    );
  }
  return value;
}

/** `ok()` with BigInt/Date normalisation applied first. */
export function okSerialized<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data: serialize(data) }, { status });
}

export function createdSerialized<T>(data: T) {
  return okSerialized(data, 201);
}
