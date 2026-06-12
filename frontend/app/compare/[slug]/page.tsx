import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { COMPETITORS, getCompetitor } from "@/lib/competitors";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return COMPETITORS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const c = getCompetitor(slug);
  if (!c) return {};
  return {
    title: `SongScore vs ${c.name} — AI Music Transcription Compared`,
    description: `${c.tagline} Feature-by-feature comparison: full-band transcription, difficulty levels, exports, editing, accuracy. Updated ${c.lastReviewed}.`,
    alternates: { canonical: `/compare/${c.slug}` },
  };
}

export default async function ComparePage({ params }: PageProps) {
  const { slug } = await params;
  const c = getCompetitor(slug);
  if (!c) notFound();

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-12 sm:py-16">
      <nav className="text-xs text-[#71717a] mb-6">
        <Link href="/compare" className="hover:text-white transition-colors">
          Compare
        </Link>{" "}
        / SongScore vs {c.name}
      </nav>

      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-4">
        SongScore vs {c.name}
      </h1>
      <p className="text-base text-[#a1a1aa] max-w-2xl mb-2">{c.strengths}</p>
      <p className="text-xs text-[#52525b] mb-10">
        Comparison based on public product pages, last reviewed {c.lastReviewed}.
        Spotted something out of date? Email us and we&apos;ll fix it.
      </p>

      <div className="overflow-x-auto rounded-xl border border-[#27272a]">
        <table className="w-full text-sm">
          <thead className="bg-[#0c0c0e] border-b border-[#27272a]">
            <tr className="text-left text-xs uppercase tracking-widest text-[#71717a]">
              <th className="px-4 py-3 font-medium w-1/3">Feature</th>
              <th className="px-4 py-3 font-medium text-violet-300">SongScore</th>
              <th className="px-4 py-3 font-medium">{c.name}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#27272a]">
            {c.rows.map((row) => (
              <tr key={row.feature} className="bg-[#111113]">
                <td className="px-4 py-3 text-white font-medium">{row.feature}</td>
                <td className="px-4 py-3 text-[#a1a1aa]">{row.songscore}</td>
                <td className="px-4 py-3 text-[#a1a1aa]">{row.competitor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-[#27272a] bg-[#111113] p-6">
          <h2 className="text-base font-semibold text-white mb-2">
            Choose {c.name} if…
          </h2>
          <p className="text-sm text-[#71717a] leading-relaxed">{c.strengths}</p>
        </div>
        <div className="rounded-xl border border-violet-500/40 bg-violet-500/5 p-6">
          <h2 className="text-base font-semibold text-white mb-2">
            Choose SongScore if…
          </h2>
          <p className="text-sm text-[#a1a1aa] leading-relaxed">
            You want the <strong className="text-white">whole song</strong>, not
            one instrument: stem-separated scores for vocals, bass, piano and
            guitar, Easy/Medium/Hard variants for students, a mix player to
            practice along with, and accuracy numbers we publish instead of
            asking you to take on faith.
          </p>
        </div>
      </div>

      <div className="mt-12 text-center">
        <Link
          href="/app"
          className="inline-block rounded-lg bg-gradient-to-r from-violet-600 to-indigo-700 px-8 py-3.5 text-base font-semibold text-white hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]"
        >
          Try SongScore free — 3 songs/month →
        </Link>
      </div>

      {/* ItemList schema helps these pages surface in AI overviews */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: `SongScore vs ${c.name} — AI Music Transcription Compared`,
            about: ["AI music transcription", "audio to sheet music"],
            datePublished: "2026-06-13",
            publisher: { "@type": "Organization", name: "SongScore" },
          }),
        }}
      />
    </div>
  );
}
