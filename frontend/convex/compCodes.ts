import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { Doc } from "./_generated/dataModel";
import { assertSecret } from "./lib";

function mapCode(c: Doc<"compCodes">) {
  return {
    code: c.code,
    tier: c.tier,
    max_uses: c.maxUses,
    used_count: c.usedCount,
    expires_at: c.expiresAt != null ? new Date(c.expiresAt).toISOString() : null,
    created_by: c.createdBy,
    note: c.note ?? null,
    created_at: new Date(c._creationTime).toISOString(),
  };
}

export const getByCode = query({
  args: { secret: v.string(), code: v.string() },
  handler: async (ctx, { secret, code }) => {
    assertSecret(secret);
    const c = await ctx.db
      .query("compCodes")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();
    return c ? mapCode(c) : null;
  },
});

export const create = mutation({
  args: {
    secret: v.string(),
    code: v.string(),
    tier: v.union(v.literal("pro"), v.literal("business")),
    maxUses: v.number(),
    expiresAt: v.optional(v.number()),
    createdBy: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { secret, code, tier, maxUses, expiresAt, createdBy, note }) => {
    assertSecret(secret);
    await ctx.db.insert("compCodes", {
      code,
      tier,
      maxUses,
      usedCount: 0,
      expiresAt,
      createdBy,
      note,
    });
  },
});

export const incrementUsedCount = mutation({
  args: { secret: v.string(), code: v.string() },
  handler: async (ctx, { secret, code }) => {
    assertSecret(secret);
    const c = await ctx.db
      .query("compCodes")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();
    if (c) await ctx.db.patch(c._id, { usedCount: c.usedCount + 1 });
  },
});

/** Soft-revoke: set expires_at to now. */
export const setExpiresAt = mutation({
  args: { secret: v.string(), code: v.string(), expiresAt: v.number() },
  handler: async (ctx, { secret, code, expiresAt }) => {
    assertSecret(secret);
    const c = await ctx.db
      .query("compCodes")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();
    if (c) await ctx.db.patch(c._id, { expiresAt });
  },
});

export const list = query({
  args: { secret: v.string(), limit: v.number() },
  handler: async (ctx, { secret, limit }) => {
    assertSecret(secret);
    const rows = await ctx.db.query("compCodes").order("desc").take(limit);
    return rows.map(mapCode);
  },
});

/**
 * Atomically record a redemption. Returns "inserted" on success, "duplicate"
 * if this user already redeemed this code (replaces the Postgres UNIQUE
 * constraint + 23505 handling). Runs in a single mutation = transactional.
 */
export const tryInsertRedemption = mutation({
  args: { secret: v.string(), code: v.string(), userId: v.string() },
  handler: async (ctx, { secret, code, userId }) => {
    assertSecret(secret);
    const existing = await ctx.db
      .query("compCodeRedemptions")
      .withIndex("by_code_user", (q) => q.eq("code", code).eq("userId", userId))
      .first();
    if (existing) return "duplicate" as const;
    await ctx.db.insert("compCodeRedemptions", { code, userId });
    return "inserted" as const;
  },
});
