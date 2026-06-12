/**
 * Competitor comparison data for the /compare SEO pages.
 *
 * HONESTY RULE: every claim about a competitor must reflect their public
 * product pages as of the `lastReviewed` date. When unsure, mark the cell
 * "—" (unknown) rather than guessing. Keep rows factual and feature-based;
 * no pricing claims beyond what their public pages state in broad terms.
 */

export interface FeatureRow {
  feature: string;
  songscore: string;
  competitor: string;
}

export interface Competitor {
  slug: string;
  name: string;
  tagline: string;
  /** One-sentence fair summary of what they're good at. */
  strengths: string;
  lastReviewed: string;
  rows: FeatureRow[];
}

const SHARED_SONGSCORE = {
  fullBand: "✅ Full-band: AI stem separation → separate score per instrument",
  difficulty: "✅ Easy / Medium / Hard variants of every score",
  editor: "✅ Click-to-edit notes in the browser",
  mixPlayer: "✅ DAW-style mix player (mute/solo each stem) + synced cursor",
  benchmarks: "✅ Published accuracy benchmarks + open methodology",
  exports: "✅ PDF, MIDI, MusicXML",
  api: "✅ REST API (Business plan)",
  free: "✅ Free tier — 3 transcriptions/month, no card",
};

export const COMPETITORS: Competitor[] = [
  {
    slug: "klangio",
    name: "Klangio",
    tagline: "SongScore vs Klangio — which AI music transcription tool fits you?",
    strengths:
      "Klangio offers polished single-instrument apps (Piano2Notes, Guitar2Tabs, Sing2Notes) and supports YouTube input and Guitar Pro export.",
    lastReviewed: "June 2026",
    rows: [
      { feature: "Full-band transcription (every instrument from one mix)", songscore: SHARED_SONGSCORE.fullBand, competitor: "Partial — instrument-specific apps transcribe one instrument at a time" },
      { feature: "Difficulty levels per score", songscore: SHARED_SONGSCORE.difficulty, competitor: "—" },
      { feature: "In-browser note editing", songscore: SHARED_SONGSCORE.editor, competitor: "Basic editing in their score viewer" },
      { feature: "Per-stem mix player with mute/solo", songscore: SHARED_SONGSCORE.mixPlayer, competitor: "—" },
      { feature: "Published accuracy benchmarks", songscore: SHARED_SONGSCORE.benchmarks, competitor: "—" },
      { feature: "Export formats", songscore: SHARED_SONGSCORE.exports, competitor: "PDF, MIDI, MusicXML, Guitar Pro" },
      { feature: "Guitar tablature output", songscore: "🔜 On the roadmap", competitor: "✅ Guitar2Tabs" },
      { feature: "YouTube link input", songscore: "🔜 On the roadmap", competitor: "✅" },
      { feature: "API access", songscore: SHARED_SONGSCORE.api, competitor: "✅ Music transcription API" },
      { feature: "Free tier", songscore: SHARED_SONGSCORE.free, competitor: "Free trial transcriptions" },
    ],
  },
  {
    slug: "songscription",
    name: "Songscription",
    tagline: "SongScore vs Songscription — full-band AI transcription compared",
    strengths:
      "Songscription transcribes audio or YouTube links into editable sheet music in the browser, with a free tier and a clean editor.",
    lastReviewed: "June 2026",
    rows: [
      { feature: "Full-band transcription (every instrument from one mix)", songscore: SHARED_SONGSCORE.fullBand, competitor: "Piano-first; other instruments limited" },
      { feature: "Difficulty levels per score", songscore: SHARED_SONGSCORE.difficulty, competitor: "—" },
      { feature: "In-browser note editing", songscore: SHARED_SONGSCORE.editor, competitor: "✅ Browser score editor" },
      { feature: "Per-stem mix player with mute/solo", songscore: SHARED_SONGSCORE.mixPlayer, competitor: "—" },
      { feature: "Published accuracy benchmarks", songscore: SHARED_SONGSCORE.benchmarks, competitor: "—" },
      { feature: "Export formats", songscore: SHARED_SONGSCORE.exports, competitor: "Sheet music, MIDI, tabs" },
      { feature: "YouTube link input", songscore: "🔜 On the roadmap", competitor: "✅" },
      { feature: "API access", songscore: SHARED_SONGSCORE.api, competitor: "—" },
      { feature: "Free tier", songscore: SHARED_SONGSCORE.free, competitor: "✅ Free tier" },
    ],
  },
  {
    slug: "melody-scanner",
    name: "Melody Scanner",
    tagline: "SongScore vs Melody Scanner — AI sheet music tools compared",
    strengths:
      "Melody Scanner imports YouTube videos or MP3s, generates sheet music per instrument, and has a mature in-browser editor.",
    lastReviewed: "June 2026",
    rows: [
      { feature: "Full-band transcription (every instrument from one mix)", songscore: SHARED_SONGSCORE.fullBand, competitor: "Partial — per-instrument modes, piano-focused" },
      { feature: "Difficulty levels per score", songscore: SHARED_SONGSCORE.difficulty, competitor: "—" },
      { feature: "In-browser note editing", songscore: SHARED_SONGSCORE.editor, competitor: "✅ Editor included" },
      { feature: "Per-stem mix player with mute/solo", songscore: SHARED_SONGSCORE.mixPlayer, competitor: "—" },
      { feature: "Published accuracy benchmarks", songscore: SHARED_SONGSCORE.benchmarks, competitor: "—" },
      { feature: "Export formats", songscore: SHARED_SONGSCORE.exports, competitor: "PDF, MusicXML, MIDI" },
      { feature: "YouTube link input", songscore: "🔜 On the roadmap", competitor: "✅" },
      { feature: "API access", songscore: SHARED_SONGSCORE.api, competitor: "—" },
      { feature: "Free tier", songscore: SHARED_SONGSCORE.free, competitor: "✅ Free tier" },
    ],
  },
];

export function getCompetitor(slug: string): Competitor | undefined {
  return COMPETITORS.find((c) => c.slug === slug);
}
