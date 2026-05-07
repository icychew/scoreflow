import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";

/**
 * API key format: nta_<24 random base64url chars>
 * - "nta_" prefix is a Notara identifier (helps users recognise / search)
 * - The first 8 chars (prefix) are stored in plaintext for display
 * - The full key is hashed (SHA-256) before storage
 */
const KEY_PREFIX = "nta_";
const RANDOM_BYTES = 18; // 18 bytes → 24 base64url chars

export type Tier = "free" | "pro" | "business";

export interface ApiKeyAuth {
  userId: string;
  tier: Tier;
  keyId: string;
  email: string | null;
}

/** Generate a fresh API key. Returns plaintext + hash + display prefix. */
export function generateApiKey(): {
  plaintext: string;
  hash: string;
  prefix: string;
} {
  const random = randomBytes(RANDOM_BYTES).toString("base64url");
  const plaintext = `${KEY_PREFIX}${random}`;
  const hash = hashKey(plaintext);
  const prefix = plaintext.slice(0, 8); // "nta_abcd"
  return { plaintext, hash, prefix };
}

/** SHA-256 hash of an API key, used for DB lookup. Stable & one-way. */
export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Authenticate a request via the `Authorization: Bearer <key>` header.
 * Returns the resolved user + tier on success, or a tagged failure.
 *
 * Updates last_used_at on hit (best-effort, non-blocking).
 */
export async function authenticateApiRequest(
  req: Request,
): Promise<
  | { ok: true; auth: ApiKeyAuth }
  | { ok: false; status: 401 | 403; error: string }
> {
  const header = req.headers.get("authorization");
  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    return {
      ok: false,
      status: 401,
      error: "Missing Authorization: Bearer <key> header.",
    };
  }
  const plaintext = header.slice(7).trim();
  if (!plaintext.startsWith(KEY_PREFIX)) {
    return { ok: false, status: 401, error: "Invalid API key format." };
  }

  const hash = hashKey(plaintext);

  const { data: keyRow, error: keyErr } = await db
    .from("api_keys")
    .select("id, user_id, revoked_at")
    .eq("key_hash", hash)
    .maybeSingle();
  if (keyErr) {
    console.error("[apiAuth] key lookup failed:", keyErr);
    return { ok: false, status: 401, error: "Authentication error." };
  }
  if (!keyRow || keyRow.revoked_at) {
    return { ok: false, status: 401, error: "Invalid or revoked API key." };
  }

  // Resolve user tier — only `business` is allowed to use the v1 API.
  const { data: userRow, error: userErr } = await db
    .from("users")
    .select("tier, email")
    .eq("id", keyRow.user_id)
    .single();
  if (userErr || !userRow) {
    return { ok: false, status: 401, error: "User not found." };
  }

  const tier = (userRow.tier ?? "free") as Tier;
  if (tier !== "business") {
    return {
      ok: false,
      status: 403,
      error: `API access requires the Business plan (your tier: ${tier}).`,
    };
  }

  // Best-effort last_used_at update; don't await
  db.from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", keyRow.id)
    .then((res: { error: { message: string } | null }) => {
      if (res.error) console.error("[apiAuth] last_used_at:", res.error);
    });

  return {
    ok: true,
    auth: {
      userId: keyRow.user_id,
      tier,
      keyId: keyRow.id,
      email: (userRow.email ?? null) as string | null,
    },
  };
}
