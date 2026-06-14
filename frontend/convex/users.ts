import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { assertSecret } from "./lib";

const tierValidator = v.union(
  v.literal("free"),
  v.literal("pro"),
  v.literal("business"),
);

/** Ensure a user row exists. Never touches tier (managed elsewhere). */
export const upsertUser = mutation({
  args: { secret: v.string(), userId: v.string(), email: v.string() },
  handler: async (ctx, { secret, userId, email }) => {
    assertSecret(secret);
    const existing = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (existing) {
      if (existing.email !== email) await ctx.db.patch(existing._id, { email });
      return;
    }
    await ctx.db.insert("users", {
      userId,
      email,
      tier: "free",
      tierSource: "default",
    });
  },
});

/** Read tier + tier_source for the comp/allowlist policy in the signIn callback. */
export const getTierSource = query({
  args: { secret: v.string(), userId: v.string() },
  handler: async (ctx, { secret, userId }) => {
    assertSecret(secret);
    const u = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    return u ? { tier: u.tier, tier_source: u.tierSource } : null;
  },
});

/** Resolve a user's current tier (defaults to free). Used by the session callback. */
export const getTier = query({
  args: { secret: v.string(), userId: v.string() },
  handler: async (ctx, { secret, userId }) => {
    assertSecret(secret);
    const u = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    return u ? { tier: u.tier } : null;
  },
});

/** Tier + email for API-key auth. */
export const getTierAndEmail = query({
  args: { secret: v.string(), userId: v.string() },
  handler: async (ctx, { secret, userId }) => {
    assertSecret(secret);
    const u = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    return u ? { tier: u.tier, email: u.email } : null;
  },
});

/** Set tier + tier_source by user id (comp allowlist apply/downgrade, comp code). */
export const setTierBySource = mutation({
  args: {
    secret: v.string(),
    userId: v.string(),
    tier: tierValidator,
    tierSource: v.union(
      v.literal("default"),
      v.literal("comp_email"),
      v.literal("comp_code"),
      v.literal("stripe"),
    ),
  },
  handler: async (ctx, { secret, userId, tier, tierSource }) => {
    assertSecret(secret);
    const u = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (u) await ctx.db.patch(u._id, { tier, tierSource });
  },
});

/** Stripe customer id for a user (checkout / portal). */
export const getStripeCustomerId = query({
  args: { secret: v.string(), userId: v.string() },
  handler: async (ctx, { secret, userId }) => {
    assertSecret(secret);
    const u = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    return u?.stripeCustomerId ?? null;
  },
});

export const setStripeCustomerId = mutation({
  args: { secret: v.string(), userId: v.string(), stripeCustomerId: v.string() },
  handler: async (ctx, { secret, userId, stripeCustomerId }) => {
    assertSecret(secret);
    const u = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (u) await ctx.db.patch(u._id, { stripeCustomerId });
  },
});

/** Stripe webhook → set tier by customer id, tagging tier_source='stripe'. */
export const setTierByStripeCustomer = mutation({
  args: {
    secret: v.string(),
    stripeCustomerId: v.string(),
    tier: tierValidator,
    subscriptionId: v.optional(v.string()),
  },
  handler: async (ctx, { secret, stripeCustomerId, tier, subscriptionId }) => {
    assertSecret(secret);
    const rows = await ctx.db
      .query("users")
      .withIndex("by_stripeCustomer", (q) =>
        q.eq("stripeCustomerId", stripeCustomerId),
      )
      .collect();
    for (const u of rows) {
      await ctx.db.patch(u._id, {
        tier,
        tierSource: "stripe",
        stripeSubscriptionId: subscriptionId,
      });
    }
  },
});
