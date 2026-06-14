/**
 * Shared helpers for Convex functions.
 *
 * Convex queries/mutations are PUBLIC — anyone who knows the deployment URL can
 * call them. The old Supabase layer used a server-only service-role key so only
 * our Next.js server could read/write. To preserve that trust model, every data
 * function takes a `secret` arg and we verify it here against the deployment's
 * CONVEX_SERVER_SECRET env var (set via `npx convex env set`). Only our server
 * knows the secret, so only our server can call these functions.
 */
export function assertSecret(secret: string): void {
  const expected = process.env.CONVEX_SERVER_SECRET;
  if (!expected || secret !== expected) {
    throw new Error("Unauthorized: bad or missing server secret");
  }
}

/** Convert a Convex `_creationTime` (ms epoch float) to an ISO string. */
export function isoFromCreationTime(ms: number): string {
  return new Date(ms).toISOString();
}
