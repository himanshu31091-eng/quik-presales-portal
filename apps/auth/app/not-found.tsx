import { redirect } from "next/navigation";

/**
 * Global 404 boundary. The Auth host has no landing page, so unknown URLs go
 * straight to /login; its middleware then routes an already-authenticated user
 * on to the launcher. Relative path → host-agnostic (no hardcoded origin).
 */
export default function NotFound() {
  redirect("/login");
}
