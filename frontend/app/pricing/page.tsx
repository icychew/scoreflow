import type { Metadata } from "next";
import Link from "next/link";
import PricingCards from "@/components/PricingCards";

export const metadata: Metadata = {
  title: "Notara Pricing — Free, Pro & Business Plans",
  description:
    "Start free with 3 transcriptions per month. Upgrade to Pro for 50/month with MIDI and MusicXML. Business gets unlimited transcriptions and API access.",
};

const FAQ = [
  {
    q: "What counts as one transcription?",
    a: "Each audio file you upload and process counts as one transcription, regardless of length (within your plan's audio limit).",
  },
  {
    q: "What formats do I get?",
    a: "Free users get PDF sheet music. Pro and Business users also get MIDI (for DAWs) and MusicXML (for notation software like MuseScore, Sibelius, or Finale).",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes — cancel any time from your dashboard. Your plan stays active until the end of the billing period.",
  },
  {
    q: "Does usage reset every month?",
    a: "Yes, on the 1st of each calendar month (UTC). Unused transcriptions do not roll over.",
  },
  {
    q: "What is the Business API?",
    a: "Business subscribers get a REST API key to integrate Notara's transcription pipeline into their own tools and workflows. Documentation is available in the dashboard.",
  },
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <div className="text-center mb-14">
        <h1 className="text-4xl font-bold text-white mb-4">
          Simple, transparent pricing
        </h1>
        <p className="text-lg text-[#71717a] max-w-xl mx-auto">
          Start free. Upgrade when you need more. No hidden fees, no surprises.
        </p>
      </div>

      <PricingCards />

      {/* Redeem CTA */}
      <p className="text-center text-sm text-[#71717a] mt-8">
        Have an invite code?{" "}
        <Link href="/redeem" className="text-violet-400 hover:text-violet-300 underline">
          Redeem it →
        </Link>
      </p>

      {/* FAQ */}
      <div className="mt-20">
        <h2 className="text-2xl font-bold text-white text-center mb-10">
          Frequently asked questions
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {FAQ.map(({ q, a }) => (
            <div key={q} className="p-5 rounded-xl border border-[#27272a] bg-[#111113]">
              <div className="text-sm font-semibold text-white mb-2">{q}</div>
              <div className="text-sm text-[#71717a] leading-relaxed">{a}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
