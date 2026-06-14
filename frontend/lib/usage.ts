import { convex, api, CONVEX_SECRET } from "@/lib/convex";

export type Tier = "free" | "pro" | "business";

interface TierLimits {
  monthlyLimit: number;   // Infinity for unlimited
  maxAudioMinutes: number;
  formats: string[];
}

export function getTierLimits(tier: Tier): TierLimits {
  switch (tier) {
    case "pro":
      return { monthlyLimit: 50, maxAudioMinutes: 30, formats: ["pdf", "midi", "musicxml"] };
    case "business":
      return { monthlyLimit: Infinity, maxAudioMinutes: 120, formats: ["pdf", "midi", "musicxml"] };
    default: // free
      return { monthlyLimit: 3, maxAudioMinutes: 3, formats: ["pdf"] };
  }
}

/** Pure sync check — use when you already have the count from DB */
export function canTranscribeSync(tier: Tier, usedThisMonth: number): boolean {
  const limits = getTierLimits(tier);
  return usedThisMonth < limits.monthlyLimit;
}

/** Get monthly usage count for a logged-in user */
export async function getMonthlyUsage(userId: string): Promise<number> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  return await convex.query(api.transcriptions.monthlyUsageByUser, {
    secret: CONVEX_SECRET,
    userId,
    since: monthStart.getTime(),
  });
}

/** Get monthly usage count for an anonymous session token */
export async function getAnonymousUsage(sessionToken: string): Promise<number> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  return await convex.query(api.transcriptions.monthlyUsageBySession, {
    secret: CONVEX_SECRET,
    sessionToken,
    since: monthStart.getTime(),
  });
}

/** Record a new transcription in the DB */
export async function recordTranscription({
  userId,
  sessionToken,
  jobId,
  filename,
}: {
  userId?: string;
  sessionToken?: string;
  jobId: string;
  filename: string;
}): Promise<void> {
  await convex.mutation(api.transcriptions.record, {
    secret: CONVEX_SECRET,
    userId,
    sessionToken,
    jobId,
    filename,
  });
}

/** Update transcription status after job completes */
export async function updateTranscriptionStatus(
  jobId: string,
  status: "done" | "failed"
): Promise<void> {
  await convex.mutation(api.transcriptions.updateStatusByJobId, {
    secret: CONVEX_SECRET,
    jobId,
    status,
  });
}
