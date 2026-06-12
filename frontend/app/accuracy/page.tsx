import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Accuracy benchmarks — SongScore",
  description:
    "Published F1 / precision / recall numbers per instrument category. " +
    "Measured against MAPS, MIR-ST500, GuitarSet and MUSDB18 public benchmarks.",
};

/**
 * Public accuracy page. Numbers are sourced from the most recent run of
 * `backend/tests/benchmark/run_benchmark.py` against the public datasets.
 *
 * Format: hand-curated below for clarity. To update after a new benchmark
 * run, replace the rows in BENCHMARK_RESULTS with the F1/P/R values from
 * `backend/tests/benchmark/RESULTS.md`.
 */

interface BenchmarkRow {
  category: string;
  dataset: string;
  samples: number;
  f1: number | null;          // null = not yet measured
  precision: number | null;
  recall: number | null;
  target: number;             // industrial-grade target from the plan
  notes?: string;
}

// PLACEHOLDER NUMBERS — replace with actual measurements after running:
//   python -m backend.tests.benchmark.run_benchmark \
//     --samples-dir backend/tests/benchmark/test_samples
// Targets below match `do-you-think-we-kind-forest.md` Stage 6 verification.
const BENCHMARK_RESULTS: BenchmarkRow[] = [
  {
    category: "Solo piano",
    dataset: "MAPS",
    samples: 20,
    f1: null,
    precision: null,
    recall: null,
    target: 0.90,
    notes: "Clean classical piano recordings. Industrial-grade target.",
  },
  {
    category: "Solo voice",
    dataset: "MIR-ST500",
    samples: 20,
    f1: null,
    precision: null,
    recall: null,
    target: 0.85,
    notes: "Monophonic vocal melodies, pop genre.",
  },
  {
    category: "Solo guitar",
    dataset: "GuitarSet",
    samples: 10,
    f1: null,
    precision: null,
    recall: null,
    target: 0.80,
    notes: "Fingerstyle + strummed acoustic guitar.",
  },
  {
    category: "Bass (post-Demucs)",
    dataset: "MUSDB18 — bass stem",
    samples: 10,
    f1: null,
    precision: null,
    recall: null,
    target: 0.75,
    notes: "Bass guitar isolated by Demucs, then transcribed.",
  },
  {
    category: "Full-mix lead",
    dataset: "MUSDB18 — vocals stem",
    samples: 10,
    f1: null,
    precision: null,
    recall: null,
    target: 0.65,
    notes: "Lead vocals separated from a full band mix, then transcribed.",
  },
];

function fmt(n: number | null): string {
  return n === null ? "—" : `${(n * 100).toFixed(1)}%`;
}

function statusBadge(f1: number | null, target: number) {
  if (f1 === null) return null;
  const hit = f1 >= target;
  return (
    <span
      className={`ml-2 text-[10px] font-semibold uppercase tracking-widest ${
        hit ? "text-emerald-400" : "text-amber-400"
      }`}
    >
      {hit ? "✓ on target" : "below target"}
    </span>
  );
}

export default function AccuracyPage() {
  const hasMeasurements = BENCHMARK_RESULTS.some((r) => r.f1 !== null);

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10 sm:py-14">
      <div className="mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-3">
          SongScore accuracy benchmarks
        </h1>
        <p className="text-base text-[#a1a1aa]">
          We publish our note-level F1 scores against industry-standard public
          datasets so you can verify the claims on the landing page. The
          benchmark script lives in{" "}
          <code className="text-violet-300 text-sm">
            backend/tests/benchmark/run_benchmark.py
          </code>{" "}
          — you can re-run it on your own machine.
        </p>
      </div>

      {/* Headline numbers */}
      {!hasMeasurements && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 mb-8">
          <p className="text-sm text-amber-300 font-semibold mb-1">
            ⚠ Awaiting first benchmark run
          </p>
          <p className="text-xs text-amber-200/80">
            The targets below come from the accuracy roadmap. Real measurements
            land here after the team runs{" "}
            <code className="text-amber-100">
              python -m backend.tests.benchmark.run_benchmark
            </code>{" "}
            on the populated test samples.
          </p>
        </div>
      )}

      {/* Results table */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-white mb-4">Per-category F1</h2>
        <div className="overflow-x-auto rounded-xl border border-[#27272a]">
          <table className="w-full text-sm">
            <thead className="bg-[#0c0c0e] border-b border-[#27272a]">
              <tr className="text-left text-xs uppercase tracking-widest text-[#71717a]">
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Dataset</th>
                <th className="px-4 py-3 font-medium text-right">Samples</th>
                <th className="px-4 py-3 font-medium text-right">Precision</th>
                <th className="px-4 py-3 font-medium text-right">Recall</th>
                <th className="px-4 py-3 font-medium text-right">F1</th>
                <th className="px-4 py-3 font-medium text-right">Target</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#27272a]">
              {BENCHMARK_RESULTS.map((r) => (
                <tr key={r.category} className="bg-[#111113]">
                  <td className="px-4 py-3 text-white font-medium">
                    {r.category}
                    {statusBadge(r.f1, r.target)}
                  </td>
                  <td className="px-4 py-3 text-[#a1a1aa]">{r.dataset}</td>
                  <td className="px-4 py-3 text-[#a1a1aa] text-right">{r.samples}</td>
                  <td className="px-4 py-3 text-[#a1a1aa] text-right tabular-nums">
                    {fmt(r.precision)}
                  </td>
                  <td className="px-4 py-3 text-[#a1a1aa] text-right tabular-nums">
                    {fmt(r.recall)}
                  </td>
                  <td className="px-4 py-3 text-white text-right tabular-nums font-semibold">
                    {fmt(r.f1)}
                  </td>
                  <td className="px-4 py-3 text-[#71717a] text-right tabular-nums">
                    {fmt(r.target)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Methodology */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-white mb-4">Methodology</h2>
        <div className="prose prose-invert max-w-none text-sm text-[#a1a1aa]">
          <p>
            For each test sample we run the full SongScore pipeline (Demucs source
            separation → Basic Pitch transcription → cleanup → quantization →
            music21 score generation) and compare the resulting MIDI notes
            against the dataset&apos;s ground-truth MIDI.
          </p>
          <p>
            A detected note is counted as a <strong className="text-slate-200">true positive</strong>{" "}
            when its pitch matches the reference exactly AND its onset is within{" "}
            <strong className="text-slate-200">±50 ms</strong> of the reference
            onset. This is the standard tolerance used by MIR research
            (see Bay et al., ISMIR 2009).
          </p>
          <p>
            Precision = TP / (TP + FP) — &ldquo;of the notes we detected, how
            many were correct.&rdquo;
            <br />
            Recall = TP / (TP + FN) — &ldquo;of the reference notes, how many
            did we find.&rdquo;
            <br />
            F1 = 2·P·R / (P + R) — the headline accuracy figure.
          </p>
        </div>
      </section>

      {/* Datasets */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-white mb-4">Datasets used</h2>
        <ul className="text-sm text-[#a1a1aa] space-y-3">
          <li>
            <strong className="text-slate-200">MAPS</strong> — MIDI-Aligned
            Piano Sounds, classical solo piano (Emiya et al., 2010).
          </li>
          <li>
            <strong className="text-slate-200">MIR-ST500</strong> — Singing
            Transcription corpus, 500 monophonic vocal melodies (Wang et al., 2021).
          </li>
          <li>
            <strong className="text-slate-200">GuitarSet</strong> — Multi-mic
            recordings of fingerstyle + strummed guitar with frame-level pitch
            ground truth (Xi et al., ISMIR 2018).
          </li>
          <li>
            <strong className="text-slate-200">MUSDB18</strong> — 150 full
            songs with stem-isolated ground-truth audio + MIDI references
            (Rafii et al., 2017).
          </li>
        </ul>
      </section>

      {/* Reproduce locally */}
      <section className="rounded-xl border border-[#27272a] bg-[#0c0c0e] p-6">
        <h2 className="text-lg font-semibold text-white mb-3">
          Reproduce these numbers
        </h2>
        <pre className="rounded-lg border border-[#27272a] bg-[#050507] px-4 py-3 text-xs leading-relaxed text-[#fafafa] font-mono overflow-x-auto whitespace-pre-wrap mb-3">
{`# 1. Populate test samples (synthetic baseline)
python -m backend.tests.benchmark.download_datasets

# 2. (Optional) Add real public datasets
python -m backend.tests.benchmark.download_datasets --download

# 3. Tune transcription thresholds on the data
python -m backend.tests.benchmark.run_grid_search

# 4. Run the full accuracy benchmark
python -m backend.tests.benchmark.run_benchmark \\
  --samples-dir backend/tests/benchmark/test_samples
`}
        </pre>
        <p className="text-xs text-[#71717a]">
          Full instructions in{" "}
          <Link
            href="https://github.com/icychew/scoreflow/blob/master/backend/tests/benchmark/RESULTS.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-violet-400 hover:underline"
          >
            backend/tests/benchmark/RESULTS.md
          </Link>
          .
        </p>
      </section>

      <div className="mt-12 text-center text-sm text-[#71717a]">
        <Link href="/" className="text-violet-400 hover:text-violet-300 underline">
          ← Back to SongScore
        </Link>
      </div>
    </div>
  );
}
