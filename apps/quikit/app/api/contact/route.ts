import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Marketing contact form. Forwards to the Google Apps Script webhook
 * (GOOGLE_SCRIPT_URL). Per the integration decision, when the webhook
 * isn't configured we degrade GRACEFULLY (200 + a friendly fallback)
 * instead of a scary 500, so the marketing page can show an
 * "email us instead" message rather than appearing broken.
 */
export async function POST(req: NextRequest) {
  let body: {
    name?: string;
    email?: string;
    phone?: string;
    tools?: string[];
    message?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request." },
      { status: 400 },
    );
  }

  const { name, email, phone, tools, message } = body;
  if (!name || !email) {
    return NextResponse.json(
      { success: false, error: "Name and email are required." },
      { status: 400 },
    );
  }

  const webhook = process.env.GOOGLE_SCRIPT_URL;
  if (!webhook) {
    // Not yet configured — graceful fallback (no 500).
    return NextResponse.json({
      success: false,
      fallback: true,
      error:
        "Our contact form isn't live yet. Please email us at hello@quikit.ai and we'll get right back to you.",
    });
  }

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        phone: phone ?? "",
        tools: tools ?? [],
        message,
        submittedAt: new Date().toISOString(),
      }),
      redirect: "follow",
    });
    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: "Couldn't submit. Please try again." },
        { status: 502 },
      );
    }
  } catch {
    return NextResponse.json(
      { success: false, error: "Couldn't submit. Please try again." },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true });
}
