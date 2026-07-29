import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { validationError } from "@/lib/api/responses";

/**
 * GET / PATCH /api/settings/company
 *
 * Per-user theme settings (accent colour + light/dark mode), stored on the
 * shared central `User` model. Consumed by `<ThemeApplier />`, which reads
 * `data.accentColor` on mount and derives the `--accent-*` CSS variables that
 * every `accent-*` Tailwind class in this app resolves against.
 *
 * The route name is fixed by ThemeApplier's default `apiEndpoint`, so it stays
 * `/api/settings/company` in every app even though the data is per-user, not
 * per-company. Response shape must remain `{ success, data }` to stay
 * wire-compatible with the shared component.
 *
 * Mirrors apps/quikscale and apps/quikinfra.
 */

const updateThemeSchema = z.object({
  accentColor: z
    .string()
    .regex(/^#([0-9a-fA-F]{6})$/, "accentColor must be a #RRGGBB hex string")
    .optional(),
  themeMode: z.enum(["light", "dark"]).optional(),
});

export const GET = withOrgAuth(
  async ({ userId }) => {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { accentColor: true, themeMode: true },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: user });
  },
  { fallbackErrorMessage: "Failed to fetch theme settings" },
);

export const PATCH = withOrgAuth(
  async ({ userId }, request) => {
    const parsed = updateThemeSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return validationError(parsed.error);
    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 });
    }

    const updated = await db.user.update({
      where: { id: userId },
      data: parsed.data,
      select: { accentColor: true, themeMode: true },
    });

    return NextResponse.json({ success: true, data: updated });
  },
  { fallbackErrorMessage: "Failed to update theme settings" },
);
