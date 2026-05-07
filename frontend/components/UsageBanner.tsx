import Link from "next/link";
import { getTierLimits } from "@/lib/usage";
import type { Tier } from "@/lib/usage";

interface UsageBannerProps {
  used: number;
  tier: Tier;
}

export default function UsageBanner({ used, tier }: UsageBannerProps) {
  if (tier !== "free") return null;
  const limit = getTierLimits("free").monthlyLimit; // 3
  const remaining = limit - used;

  return (
    <div className="mb-6 flex items-center justify-between rounded-lg border border-[#27272a] bg-[#111113] px-4 py-3 text-sm">
      <span className="text-[#a1a1aa]">
        <span className="text-white font-medium">{remaining} of {limit}</span>{" "}
        free transcriptions remaining this month
      </span>
      <Link
        href="/pricing"
        className="text-violet-400 hover:text-violet-300 font-medium transition-colors"
      >
        Upgrade →
      </Link>
    </div>
  );
}
