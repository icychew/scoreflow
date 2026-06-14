import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { assertSecret } from "./lib";

function mapKey(k: Doc<"apiKeys">) {
  return {
    id: k._id as string,
    key_prefix: k.keyPrefix,
    name: k.name,
    last_used_at: k.lastUsedAt != null ? new Date(k.lastUsedAt).toISOString() : null,
    revoked_at: k.revokedAt != null ? new Date(k.revokedAt).toISOString() : null,
    created_at: new Date(k._creationTime).toISOString(),
  };
}

/** Look up a key by its SHA-256 hash (API auth). */
export const lookupByHash = query({
  args: { secret: v.string(), keyHash: v.string() },
  handler: async (ctx, { secret, keyHash }) => {
    assertSecret(secret);
    const k = await ctx.db
      .query("apiKeys")
      .withIndex("by_keyHash", (q) => q.eq("keyHash", keyHash))
      .first();
    if (!k) return null;
    return {
      id: k._id as string,
      user_id: k.userId,
      revoked_at: k.revokedAt != null ? new Date(k.revokedAt).toISOString() : null,
    };
  },
});

export const touchLastUsed = mutation({
  args: { secret: v.string(), id: v.string() },
  handler: async (ctx, { secret, id }) => {
    assertSecret(secret);
    await ctx.db.patch(id as Id<"apiKeys">, { lastUsedAt: Date.now() });
  },
});

export const listByUser = query({
  args: { secret: v.string(), userId: v.string() },
  handler: async (ctx, { secret, userId }) => {
    assertSecret(secret);
    const rows = await ctx.db
      .query("apiKeys")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
    return rows.map(mapKey);
  },
});

export const countActiveByUser = query({
  args: { secret: v.string(), userId: v.string() },
  handler: async (ctx, { secret, userId }) => {
    assertSecret(secret);
    const rows = await ctx.db
      .query("apiKeys")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows.filter((k) => k.revokedAt == null).length;
  },
});

export const create = mutation({
  args: {
    secret: v.string(),
    userId: v.string(),
    keyHash: v.string(),
    keyPrefix: v.string(),
    name: v.string(),
  },
  handler: async (ctx, { secret, userId, keyHash, keyPrefix, name }) => {
    assertSecret(secret);
    const id = await ctx.db.insert("apiKeys", {
      userId,
      keyHash,
      keyPrefix,
      name,
    });
    const k = await ctx.db.get(id);
    return {
      id: id as string,
      key_prefix: keyPrefix,
      name,
      created_at: new Date(k!._creationTime).toISOString(),
    };
  },
});

/** Soft-revoke with ownership guard. */
export const revoke = mutation({
  args: { secret: v.string(), id: v.string(), userId: v.string() },
  handler: async (ctx, { secret, id, userId }) => {
    assertSecret(secret);
    const k = await ctx.db.get(id as Id<"apiKeys">);
    if (k && k.userId === userId) {
      await ctx.db.patch(id as Id<"apiKeys">, { revokedAt: Date.now() });
    }
  },
});
