import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Convex schema — migrated from the Supabase Postgres tables.
 *
 * Storage uses camelCase + optional (omitted) fields; the query/mutation
 * functions map back to the snake_case shapes the Next.js call-sites expect,
 * so rewiring stays minimal. Postgres `created_at` is replaced by Convex's
 * built-in `_creationTime` (ms epoch), exposed as an ISO string by the
 * functions. The Postgres row `id` is replaced by the Convex `_id`.
 */
export default defineSchema({
  users: defineTable({
    userId: v.string(), // NextAuth user id (was users.id)
    email: v.string(),
    tier: v.union(v.literal("free"), v.literal("pro"), v.literal("business")),
    tierSource: v.union(
      v.literal("default"),
      v.literal("comp_email"),
      v.literal("comp_code"),
      v.literal("stripe"),
    ),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
  })
    .index("by_userId", ["userId"])
    .index("by_email", ["email"])
    .index("by_stripeCustomer", ["stripeCustomerId"]),

  transcriptions: defineTable({
    userId: v.optional(v.string()),
    sessionToken: v.optional(v.string()),
    jobId: v.string(),
    filename: v.optional(v.string()),
    title: v.optional(v.string()),
    status: v.union(
      v.literal("processing"),
      v.literal("done"),
      v.literal("failed"),
    ),
  })
    .index("by_jobId", ["jobId"])
    .index("by_user", ["userId"])
    .index("by_session", ["sessionToken"]),

  transcriptionShares: defineTable({
    token: v.string(),
    jobId: v.string(),
    transcriptionId: v.string(),
    createdBy: v.optional(v.string()),
    expiresAt: v.optional(v.number()), // ms epoch
    viewCount: v.number(),
  }).index("by_token", ["token"]),

  compCodes: defineTable({
    code: v.string(),
    tier: v.union(v.literal("pro"), v.literal("business")),
    maxUses: v.number(),
    usedCount: v.number(),
    expiresAt: v.optional(v.number()), // ms epoch
    createdBy: v.string(),
    note: v.optional(v.string()),
  }).index("by_code", ["code"]),

  compCodeRedemptions: defineTable({
    code: v.string(),
    userId: v.string(),
  }).index("by_code_user", ["code", "userId"]),

  apiKeys: defineTable({
    userId: v.string(),
    keyHash: v.string(),
    keyPrefix: v.string(),
    name: v.string(),
    lastUsedAt: v.optional(v.number()), // ms epoch
    revokedAt: v.optional(v.number()), // ms epoch
  })
    .index("by_keyHash", ["keyHash"])
    .index("by_user", ["userId"]),
});
