import { redirect } from "next/navigation";

/**
 * Global 404 boundary. Instead of dead-ending on Next's bare 404, send the user
 * to this app's landing page ("/"). A signed-in user is forwarded on from the
 * landing page (launcher → /apps); a signed-out user sees the public landing, or
 * is gated to login by middleware on protected paths. Relative path → host-agnostic.
 */
export default function NotFound() {
  redirect("/");
}
