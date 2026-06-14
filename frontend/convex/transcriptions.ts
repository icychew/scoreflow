import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { assertSecret } from "./lib";

const statusValidator = v.union(
  v.literal("processing"),
  v.literal("done"),
  v.literal("failed"),
);

/** Map a stored doc to the snake_case shape the Next.js call-sites expect. */
function mapTrans(doc: Doc<"transcriptions">) {
  return {
    id: doc._id as string,
    job_id: doc.jobId,
    user_id: doc.userId ?? null,
    session_token: doc.sessionToken ?? null,
    filename: doc.filename ?? null,
    title: doc.title ?? null,
    status: doc.status,
    created_at: new Date(doc._creationTime).toISOString(),
  };
}

export const record = mutation({
  args: {
    secret: v.string(),
    userId: v.optional(v.string()),
    sessionToken: v.optional(v.string()),
    jobId: v.string(),
    filename: v.optional(v.string()),
  },
  handler: async (ctx, { secret, userId, sessionToken, jobId, filename }) => {
    assertSecret(secret);
    await ctx.db.insert("transcriptions", {
      userId,
      sessionToken,
      jobId,
      filename,
      status: "processing",
    });
  },
});

export const updateStatusByJobId = mutation({
  args: { secret: v.string(), jobId: v.string(), status: statusValidator },
  handler: async (ctx, { secret, jobId, status }) => {
    assertSecret(secret);
    const rows = await ctx.db
      .query("transcriptions")
      .withIndex("by_jobId", (q) => q.eq("jobId", jobId))
      .collect();
    for (const r of rows) await ctx.db.patch(r._id, { status });
  },
});

export const monthlyUsageByUser = query({
  args: { secret: v.string(), userId: v.string(), since: v.number() },
  handler: async (ctx, { secret, userId, since }) => {
    assertSecret(secret);
    const rows = await ctx.db
      .query("transcriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.gte(q.field("_creationTime"), since))
      .collect();
    return rows.length;
  },
});

export const monthlyUsageBySession = query({
  args: { secret: v.string(), sessionToken: v.string(), since: v.number() },
  handler: async (ctx, { secret, sessionToken, since }) => {
    assertSecret(secret);
    const rows = await ctx.db
      .query("transcriptions")
      .withIndex("by_session", (q) => q.eq("sessionToken", sessionToken))
      .filter((q) => q.gte(q.field("_creationTime"), since))
      .collect();
    return rows.length;
  },
});

/** Dashboard history — newest first, capped. */
export const listByUser = query({
  args: { secret: v.string(), userId: v.string(), limit: v.number() },
  handler: async (ctx, { secret, userId, limit }) => {
    assertSecret(secret);
    const rows = await ctx.db
      .query("transcriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
    return rows.map(mapTrans);
  },
});

/** v1 API paginated list with optional status filter. */
export const listByUserPaged = query({
  args: {
    secret: v.string(),
    userId: v.string(),
    limit: v.number(),
    offset: v.number(),
    status: v.optional(v.string()),
  },
  handler: async (ctx, { secret, userId, limit, offset, status }) => {
    assertSecret(secret);
    let rows = await ctx.db
      .query("transcriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
    if (status) rows = rows.filter((r) => r.status === status);
    const total = rows.length;
    const page = rows.slice(offset, offset + limit).map(mapTrans);
    return { jobs: page, total };
  },
});

export const getByJobId = query({
  args: { secret: v.string(), jobId: v.string() },
  handler: async (ctx, { secret, jobId }) => {
    assertSecret(secret);
    const doc = await ctx.db
      .query("transcriptions")
      .withIndex("by_jobId", (q) => q.eq("jobId", jobId))
      .first();
    return doc ? mapTrans(doc) : null;
  },
});

export const getById = query({
  args: { secret: v.string(), id: v.string() },
  handler: async (ctx, { secret, id }) => {
    assertSecret(secret);
    const doc = await ctx.db.get(id as Id<"transcriptions">);
    return doc ? mapTrans(doc) : null;
  },
});

export const updateTitleById = mutation({
  args: { secret: v.string(), id: v.string(), title: v.string() },
  handler: async (ctx, { secret, id, title }) => {
    assertSecret(secret);
    await ctx.db.patch(id as Id<"transcriptions">, { title });
  },
});
