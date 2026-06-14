import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { assertSecret } from "./lib";

export const create = mutation({
  args: {
    secret: v.string(),
    token: v.string(),
    jobId: v.string(),
    transcriptionId: v.string(),
    createdBy: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, { secret, token, jobId, transcriptionId, createdBy, expiresAt }) => {
    assertSecret(secret);
    await ctx.db.insert("transcriptionShares", {
      token,
      jobId,
      transcriptionId,
      createdBy,
      expiresAt,
      viewCount: 0,
    });
  },
});

export const getByToken = query({
  args: { secret: v.string(), token: v.string() },
  handler: async (ctx, { secret, token }) => {
    assertSecret(secret);
    const s = await ctx.db
      .query("transcriptionShares")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (!s) return null;
    return {
      token: s.token,
      job_id: s.jobId,
      transcription_id: s.transcriptionId,
      created_by: s.createdBy ?? null,
      expires_at: s.expiresAt != null ? new Date(s.expiresAt).toISOString() : null,
      view_count: s.viewCount,
    };
  },
});

export const incrementViewCount = mutation({
  args: { secret: v.string(), token: v.string() },
  handler: async (ctx, { secret, token }) => {
    assertSecret(secret);
    const s = await ctx.db
      .query("transcriptionShares")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (s) await ctx.db.patch(s._id, { viewCount: s.viewCount + 1 });
  },
});
