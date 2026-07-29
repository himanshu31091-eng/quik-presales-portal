/**
 * Friendly temporary-password generator.
 *
 * Used for invite emails and forgot-password resets. The plaintext is
 * shown ONCE — emailed to the user and (optionally) returned in the
 * invite-create API response so the inviting admin can display it in
 * their UI before the modal closes.
 *
 * Policy (matches `/api/auth/me/set-password` validation):
 *   - 12 characters
 *   - ≥1 uppercase, ≥1 lowercase, ≥1 digit, ≥1 special
 *
 * Confusable characters excluded so users typing from email don't
 * mis-enter: 0 / O / o / I / l / 1 / |. Specials that break HTML or
 * shell escapes also excluded: \ ' " ` ; < > &.
 *
 * Randomness: `crypto.randomInt` (unbiased — no modulo bias). Fisher-
 * Yates shuffle uses the same source.
 */
import crypto from "node:crypto";

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";        // no I, O
const LOWER = "abcdefghjkmnpqrstuvwxyz";          // no i, l, o
const DIGITS = "23456789";                         // no 0, 1
const SPECIALS = "!@#$%^*()_+-=[]{}.?,~";          // no \ ' " ` ; < > &
const ALL = UPPER + LOWER + DIGITS + SPECIALS;

function pick(pool: string): string {
  return pool[crypto.randomInt(0, pool.length)];
}

function shuffle(arr: string[]): string[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function generateTempPassword(length = 12): string {
  if (length < 4) throw new Error("Temp password length must be ≥4 to satisfy policy");
  const chars: string[] = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SPECIALS)];
  while (chars.length < length) chars.push(pick(ALL));
  return shuffle(chars).join("");
}
