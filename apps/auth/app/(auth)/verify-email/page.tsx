"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function VerifyEmailPage() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<"pending" | "ok" | "fail">("pending");

  useEffect(() => {
    if (!token) {
      setState("fail");
      return;
    }
    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((r) => setState(r.ok ? "ok" : "fail"))
      .catch(() => setState("fail"));
  }, [token]);

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 text-center">
      <h1 className="text-2xl font-semibold">Verify email</h1>
      {state === "pending" && <p className="mt-4 text-sm text-gray-600">Verifying your email...</p>}
      {state === "ok" && (
        <div className="mt-6 rounded-lg bg-green-50 border border-green-200 px-3 py-3 text-sm text-green-800">
          Email verified. You can now sign in.
        </div>
      )}
      {state === "fail" && (
        <div className="mt-6 rounded-lg bg-red-50 border border-red-200 px-3 py-3 text-sm text-red-700">
          This link is invalid or has expired.
        </div>
      )}
      <p className="mt-6 text-sm">
        <Link href="/login" className="text-indigo-600 hover:underline">Go to sign in</Link>
      </p>
    </div>
  );
}
