"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Plan = {
  id: string;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  monthlyPriceId: string | null;
  yearlyPriceId: string | null;
  description: string;
  features: readonly string[];
  missing: readonly string[];
  cta: string;
  ctaHref: string | null;
  highlight: boolean;
};

const PLANS: readonly Plan[] = [
  {
    id: "free",
    name: "Free",
    monthlyPrice: 0,
    yearlyPrice: 0,
    monthlyPriceId: null,
    yearlyPriceId: null,
    description: "For casual listening and exploration",
    features: [
      "3 transcriptions / month",
      "PDF sheet music",
      "Up to 3-min audio",
      "All 3 stems",
    ],
    missing: ["MIDI & MusicXML export", "Dashboard & history", "Priority queue"],
    cta: "Start free",
    ctaHref: "/app",
    highlight: false,
  },
  {
    id: "pro",
    name: "Pro",
    monthlyPrice: 12,
    yearlyPrice: 99,
    monthlyPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY ?? null,
    yearlyPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_YEARLY ?? null,
    description: "For students, teachers, and working musicians",
    features: [
      "50 transcriptions / month",
      "PDF + MIDI + MusicXML",
      "Up to 30-min audio",
      "All 3 stems",
      "Dashboard & history",
      "Priority queue",
    ],
    missing: ["API access", "Bulk upload"],
    cta: "Get Pro",
    ctaHref: null,
    highlight: true,
  },
  {
    id: "business",
    name: "Business",
    monthlyPrice: 49,
    yearlyPrice: 399,
    monthlyPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_MONTHLY ?? null,
    yearlyPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_YEARLY ?? null,
    description: "For studios, producers, and teams",
    features: [
      "Unlimited transcriptions",
      "PDF + MIDI + MusicXML",
      "Up to 2-hour audio",
      "All 3 stems + stem selection",
      "Dashboard & history",
      "Priority queue",
      "REST API access",
      "Bulk upload (10 files)",
    ],
    missing: [],
    cta: "Get Business",
    ctaHref: null,
    highlight: false,
  },
];

export default function PricingCards() {
  const [annual, setAnnual] = useState(false);
  const router = useRouter();

  const handleUpgrade = async (priceId: string | null) => {
    if (!priceId) return;
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priceId }),
    });
    const data = (await res.json()) as { url?: string; error?: string };
    if (data.url) {
      router.push(data.url);
    } else if (data.error === "Not authenticated") {
      router.push("/signin");
    }
  };

  return (
    <div>
      {/* Annual toggle */}
      <div className="flex items-center justify-center gap-3 mb-10">
        <span className={`text-sm ${!annual ? "text-white" : "text-[#71717a]"}`}>
          Monthly
        </span>
        <button
          onClick={() => setAnnual(!annual)}
          aria-label={annual ? "Switch to monthly billing" : "Switch to annual billing"}
          className={`relative w-11 h-6 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b] ${
            annual ? "bg-violet-600" : "bg-[#27272a]"
          }`}
        >
          <div
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
              annual ? "translate-x-5" : ""
            }`}
          />
        </button>
        <span className={`text-sm ${annual ? "text-white" : "text-[#71717a]"}`}>
          Annual{" "}
          <span className="text-green-400 text-xs font-medium">save ~31%</span>
        </span>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PLANS.map((plan) => {
          const price = annual ? plan.yearlyPrice : plan.monthlyPrice;
          const priceId = annual ? plan.yearlyPriceId : plan.monthlyPriceId;

          return (
            <div
              key={plan.id}
              className={`rounded-xl p-6 flex flex-col gap-4 ${
                plan.highlight
                  ? "border-2 border-violet-600 bg-[#1a1025]"
                  : "border border-[#27272a] bg-[#111113]"
              }`}
            >
              {plan.highlight && (
                <div className="text-xs font-bold uppercase tracking-widest text-violet-400">
                  Most Popular
                </div>
              )}
              <div>
                <div className="text-sm font-semibold text-[#71717a] uppercase tracking-widest mb-1">
                  {plan.name}
                </div>
                <div className="flex items-end gap-1">
                  <span className="text-4xl font-bold text-white">${price}</span>
                  <span className="text-[#71717a] text-sm mb-1">
                    {plan.monthlyPrice === 0 ? "" : annual ? "/yr" : "/mo"}
                  </span>
                </div>
                {annual && plan.monthlyPrice > 0 && (
                  <div className="text-xs text-[#52525b] mt-0.5">
                    (${Math.round(price / 12)}/mo billed annually)
                  </div>
                )}
                <p className="text-sm text-[#71717a] mt-2">{plan.description}</p>
              </div>

              <div className="h-px bg-[#27272a]" />

              <ul className="flex flex-col gap-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2 text-sm text-[#d4d4d8]">
                    <span className="text-green-400 mt-0.5" aria-hidden="true">✓</span>
                    {f}
                  </li>
                ))}
                {plan.missing.map((f) => (
                  <li key={f} className="flex gap-2 text-sm text-[#52525b]">
                    <span className="mt-0.5" aria-hidden="true">✗</span>
                    {f}
                  </li>
                ))}
              </ul>

              <div className="mt-auto pt-2">
                {plan.ctaHref != null ? (
                  <Link
                    href={plan.ctaHref}
                    className={`block text-center rounded-lg py-2.5 text-sm font-semibold transition-all ${
                      plan.highlight
                        ? "bg-gradient-to-r from-violet-600 to-indigo-700 text-white hover:opacity-90"
                        : "border border-[#3f3f46] text-[#a1a1aa] hover:text-white hover:border-[#52525b]"
                    }`}
                  >
                    {plan.cta}
                  </Link>
                ) : (
                  <button
                    onClick={() => handleUpgrade(priceId)}
                    className={`w-full rounded-lg py-2.5 text-sm font-semibold transition-all ${
                      plan.highlight
                        ? "bg-gradient-to-r from-violet-600 to-indigo-700 text-white hover:opacity-90"
                        : "border border-[#3f3f46] text-[#a1a1aa] hover:text-white hover:border-[#52525b]"
                    }`}
                  >
                    {plan.cta}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
