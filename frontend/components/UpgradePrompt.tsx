import Link from "next/link";

export default function UpgradePrompt() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 rounded-xl border border-[#27272a] bg-[#111113] p-12 text-center">
      <div className="text-4xl" aria-hidden="true">🎼</div>
      <div>
        <h2 className="text-xl font-bold text-white mb-2">
          You&apos;ve used all 3 free transcriptions this month
        </h2>
        <p className="text-[#71717a] text-sm max-w-sm">
          Upgrade to Pro for 50 transcriptions per month, plus MIDI and MusicXML export.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          href="/pricing"
          className="rounded-lg bg-gradient-to-r from-violet-600 to-indigo-700 px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
        >
          Upgrade to Pro — $12/mo
        </Link>
        <Link
          href="/signin"
          className="rounded-lg border border-[#27272a] px-6 py-2.5 text-sm font-medium text-[#a1a1aa] hover:text-white hover:border-[#3f3f46] transition-all"
        >
          Sign in to a different account
        </Link>
      </div>
    </div>
  );
}
