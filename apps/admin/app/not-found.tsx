import { redirect } from "next/navigation";

/**
 * Global 404 boundary. The Admin Portal sends unknown URLs straight to /login
 * (per requirement — admin/auth are the exceptions that go to login, not a
 * landing page). Relative path → host-agnostic (no hardcoded origin).
 */
export default function NotFound() {
  redirect("/login");
}
