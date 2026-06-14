import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

/**
 * Server-side Convex client. Replaces the Supabase service-role `db` client.
 *
 * Convex functions are public, so we gate every call with a shared secret
 * (CONVEX_SERVER_SECRET) that only our server knows — pass `CONVEX_SECRET` as
 * the `secret` arg on every query/mutation. This mirrors the old service-role
 * trust model (only our backend can read/write).
 */
const url = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
if (!url) throw new Error("Missing NEXT_PUBLIC_CONVEX_URL");

export const CONVEX_SECRET = process.env.CONVEX_SERVER_SECRET?.trim() ?? "";

export const convex = new ConvexHttpClient(url);
export { api };
