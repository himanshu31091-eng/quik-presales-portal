"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

export default function SignupPage() {
  const router = useRouter();
  const params = useSearchParams();
  const invite = params.get("invite");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ firstName, lastName, email, password, invite }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Could not create account.");
      return;
    }
    router.push(`/login?signed_up=1`);
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-semibold">Create your account</h1>
        <p className="text-sm text-gray-500 mt-1">
          {invite ? "Complete your invite to join QuikIT." : "Start using QuikIT in minutes."}
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">First name</span>
            <input required value={firstName} onChange={(e) => setFirstName(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Last name</span>
            <input required value={lastName} onChange={(e) => setLastName(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Email</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" autoComplete="email" />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Password</span>
          <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" autoComplete="new-password" />
          <span className="text-xs text-gray-500 mt-1 block">Minimum 8 characters.</span>
        </label>

        <button type="submit" disabled={submitting} className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
          {submitting ? "Creating..." : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-600">
        Already have an account? <Link href="/login" className="text-indigo-600 hover:underline">Sign in</Link>
      </p>
    </div>
  );
}
