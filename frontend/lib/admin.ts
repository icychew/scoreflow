import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/comp";

/**
 * Server-side admin gate. Throws "FORBIDDEN" if the caller is not in
 * `ADMIN_EMAILS`. Use at the top of any /admin/* server component, server
 * action, or admin-only API route.
 *
 * Returns the session so callers don't need to call auth() again.
 */
export async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    throw new Error("FORBIDDEN");
  }
  return session;
}

/** Generates a human-friendly redemption code, e.g. "PROFRIEND12". */
export function generateCode(prefix: string = "NOTARA"): string {
  // Crockford base32 (no I, L, O, U) for clarity
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  const tail = Array.from(buf, (b) => alphabet[b % alphabet.length]).join("");
  return `${prefix}-${tail}`;
}
