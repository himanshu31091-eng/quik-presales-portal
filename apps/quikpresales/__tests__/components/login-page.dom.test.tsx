// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const signIn = vi.fn();
const replace = vi.fn();
const sessionState: { status: string } = { status: "unauthenticated" };

vi.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => signIn(...args),
  useSession: () => ({ status: sessionState.status, data: null }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

import LoginPage from "@/app/login/page";

/** Stub the provider list NextAuth would return. */
function providers(value: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(value), { status: 200 })),
  );
}

beforeEach(() => {
  signIn.mockReset();
  replace.mockReset();
  sessionState.status = "unauthenticated";
  vi.unstubAllGlobals();
});

describe("login page provider detection", () => {
  it("redirects into SSO when the quikit provider exists", async () => {
    providers({ quikit: { id: "quikit", type: "oauth" } });

    render(<LoginPage />);

    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith("quikit", { callbackUrl: "/dashboard" }),
    );
    // No password form in SSO mode — SSO stays the supported flow.
    expect(screen.queryByLabelText(/password/i)).toBeNull();
  });

  it("renders the password form when only credentials are configured", async () => {
    // Regression: the page used to call signIn("quikit") unconditionally. With
    // the OIDC env unset, lib/auth.ts builds a CredentialsProvider instead, so
    // that provider does not exist and the page looped forever — the app could
    // not be signed into at all without the launcher running.
    providers({ credentials: { id: "credentials", type: "credentials" } });

    render(<LoginPage />);

    await waitFor(() => expect(screen.getByLabelText(/email/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalledWith("quikit", expect.anything());
  });

  it("falls back to the form when the provider list cannot be fetched", async () => {
    // Looping on a redirect that cannot succeed is worse than offering the form.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    render(<LoginPage />);

    await waitFor(() => expect(screen.getByLabelText(/email/i)).toBeInTheDocument());
    expect(signIn).not.toHaveBeenCalled();
  });

  it("sends an authenticated visitor straight to the dashboard", async () => {
    sessionState.status = "authenticated";
    providers({ credentials: { id: "credentials", type: "credentials" } });

    render(<LoginPage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
    expect(signIn).not.toHaveBeenCalled();
  });
});
