import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getTierLimits, getMonthlyUsage } from "@/lib/usage";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard — Notara",
};

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const [transcriptionsRes, used] = await Promise.all([
    db
      .from("transcriptions")
      .select("id, job_id, filename, status, created_at")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(50),
    getMonthlyUsage(session.user.id),
  ]);

  if (transcriptionsRes.error) {
    console.error("[dashboard] Failed to load transcriptions:", transcriptionsRes.error);
  }
  const transcriptionLoadFailed = Boolean(transcriptionsRes.error);
  const transcriptions = transcriptionsRes.data ?? [];
  const tier = session.user.tier;
  const limits = getTierLimits(tier);
  const remaining =
    limits.monthlyLimit === Infinity
      ? "∞"
      : String(Math.max(0, limits.monthlyLimit - used));

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-[#71717a] mt-1">
            {session.user.email} ·{" "}
            <span className="capitalize text-violet-400">{tier}</span> plan
          </p>
        </div>
        <div className="flex gap-3">
          {tier === "free" && (
            <Link
              href="/pricing"
              className="rounded-lg bg-gradient-to-r from-violet-600 to-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
            >
              Upgrade to Pro
            </Link>
          )}
          {tier !== "free" && (
            <form action="/api/stripe/portal" method="POST">
              <button
                type="submit"
                className="rounded-lg border border-[#27272a] px-4 py-2 text-sm font-medium text-[#a1a1aa] hover:text-white transition-colors"
              >
                Manage billing
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Usage stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="rounded-xl border border-[#27272a] bg-[#111113] p-5">
          <div className="text-xs text-[#71717a] mb-1 uppercase tracking-widest">
            Used this month
          </div>
          <div className="text-3xl font-bold text-white">{used}</div>
          <div className="text-sm text-[#52525b] mt-1">
            of{" "}
            {limits.monthlyLimit === Infinity ? "unlimited" : limits.monthlyLimit}
          </div>
        </div>
        <div className="rounded-xl border border-[#27272a] bg-[#111113] p-5">
          <div className="text-xs text-[#71717a] mb-1 uppercase tracking-widest">
            Remaining
          </div>
          <div className="text-3xl font-bold text-white">{remaining}</div>
          <div className="text-sm text-[#52525b] mt-1">resets 1st of month</div>
        </div>
        <div className="rounded-xl border border-[#27272a] bg-[#111113] p-5">
          <div className="text-xs text-[#71717a] mb-1 uppercase tracking-widest">
            Max audio
          </div>
          <div className="text-3xl font-bold text-white">
            {limits.maxAudioMinutes}
            <span className="text-lg font-normal text-[#52525b]"> min</span>
          </div>
          <div className="text-sm text-[#52525b] mt-1">per transcription</div>
        </div>
      </div>

      {/* Transcription history */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">
          Transcription history
        </h2>
        {transcriptionLoadFailed ? (
          <div className="text-center py-12 text-[#52525b] border border-[#27272a] rounded-xl">
            Could not load transcription history. Please refresh the page.
          </div>
        ) : transcriptions.length === 0 ? (
          <div className="text-center py-16 px-6 border border-[#27272a] rounded-xl bg-[#0c0c0e]">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-violet-900/40 to-indigo-900/40 border border-violet-500/30">
              <svg
                className="h-8 w-8 text-violet-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">
              No transcriptions yet
            </h3>
            <p className="text-sm text-[#71717a] mb-6 max-w-sm mx-auto">
              Upload your first audio file and Notara will turn it into sheet
              music in seconds.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/app"
                className="rounded-lg bg-gradient-to-r from-violet-600 to-indigo-700 px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]"
              >
                Upload your first track →
              </Link>
              <Link
                href="/demo"
                className="rounded-lg border border-[#27272a] bg-[#111113] px-6 py-2.5 text-sm font-medium text-[#a1a1aa] hover:text-white hover:border-[#3f3f46] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]"
              >
                ▶ See a demo first
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {transcriptions.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-lg border border-[#27272a] bg-[#111113] px-4 py-3"
              >
                <div>
                  <div className="text-sm font-medium text-white">
                    {(t.filename as string | null) ?? "Untitled"}
                  </div>
                  <div className="text-xs text-[#52525b] mt-0.5">
                    {t.created_at
                      ? new Date(t.created_at as string).toLocaleDateString(
                          "en-US",
                          { month: "short", day: "numeric", year: "numeric" }
                        )
                      : "—"}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      t.status === "done"
                        ? "bg-green-900/40 text-green-400"
                        : t.status === "failed"
                        ? "bg-red-900/40 text-red-400"
                        : "bg-yellow-900/40 text-yellow-400"
                    }`}
                  >
                    {t.status as string}
                  </span>
                  {t.status === "done" && t.job_id && (
                    <Link
                      href={`/job/${t.job_id as string}`}
                      className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
                    >
                      View →
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
