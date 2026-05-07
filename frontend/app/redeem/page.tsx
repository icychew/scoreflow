"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";

export default function RedeemPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ tier: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        // 401 means not signed in
        if (res.status === 401) {
          toast.error("Sign in required", {
            description: "Sign in with Google first, then return to redeem.",
          });
          router.push("/signin");
          return;
        }
        toast.error("Could not redeem code", {
          description: data.error || `HTTP ${res.status}`,
        });
        return;
      }
      setSuccess({ tier: data.tier });
      toast.success(`Welcome to ${String(data.tier).toUpperCase()}`, {
        description: "Your account has been upgraded.",
      });
    } catch (err) {
      toast.error("Network error", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="mx-auto max-w-md py-20 px-6 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-700">
          <svg
            className="h-8 w-8 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">
          Code redeemed
        </h1>
        <p className="text-[#a1a1aa] mb-6">
          You now have <span className="font-semibold text-violet-300 capitalize">{success.tier}</span>{" "}
          access. Enjoy!
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/app"
            className="rounded-lg bg-gradient-to-r from-violet-600 to-indigo-700 px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]"
          >
            Start transcribing →
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg border border-[#27272a] bg-[#111113] px-6 py-2.5 text-sm font-medium text-[#a1a1aa] hover:text-white hover:border-[#3f3f46] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]"
          >
            View dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md py-16 px-6">
      <div className="text-center mb-8">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-900/40 to-indigo-900/40 border border-violet-500/30">
          <span className="text-2xl">🎁</span>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Redeem a code</h1>
        <p className="text-sm text-[#a1a1aa]">
          Enter your invite code to unlock Pro or Business features.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="NOTARA-XXXXXXXX"
          autoComplete="off"
          autoFocus
          spellCheck={false}
          className="rounded-lg border border-[#27272a] bg-[#111113] px-4 py-3 text-base font-mono text-white placeholder-[#52525b] tracking-wider uppercase text-center focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
        />
        <button
          type="submit"
          disabled={submitting || !code.trim()}
          className="rounded-lg bg-gradient-to-r from-violet-600 to-indigo-700 px-4 py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]"
        >
          {submitting ? "Redeeming…" : "Redeem"}
        </button>
      </form>

      <p className="text-center text-xs text-[#52525b] mt-6">
        Don&apos;t have a code?{" "}
        <Link href="/pricing" className="text-violet-400 hover:underline">
          See pricing
        </Link>
      </p>
    </div>
  );
}
