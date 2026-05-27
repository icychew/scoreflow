# Notara accuracy benchmark — results

This document is the canonical comparison of **before/after** F1 numbers per
stem type. Update it after running the benchmark with each accuracy upgrade.

## How to run

```bash
# From repo root, with backend venv active:
cd backend
.venv/bin/python -m tests.benchmark.download_datasets             # synthetic samples (offline)
.venv/bin/python -m tests.benchmark.download_datasets --download  # + real public datasets (best-effort)
.venv/bin/python -m tests.benchmark.run_grid_search               # tune per-stem onset/frame thresholds
.venv/bin/python -m tests.benchmark.run_benchmark \
    --samples-dir tests/benchmark/test_samples \
    --output-dir tests/benchmark/results-$(date +%Y%m%d)
```

On Windows PowerShell:

```powershell
cd backend
.\.venv\Scripts\python -m tests.benchmark.download_datasets
.\.venv\Scripts\python -m tests.benchmark.run_grid_search
.\.venv\Scripts\python -m tests.benchmark.run_benchmark `
    --samples-dir tests\benchmark\test_samples `
    --output-dir tests\benchmark\results-$(Get-Date -Format yyyyMMdd)
```

The run produces:

- `tests/benchmark/results-YYYYMMDD/accuracy-benchmark.md` — per-sample table
- `tests/benchmark/results-YYYYMMDD/benchmark_metrics.json` — raw numbers

Copy the headline F1s into the table below.

## Targets (from plan)

| Category | Dataset | Target F1 |
|---|---|---|
| Solo piano | MAPS | ≥ 0.90 |
| Solo voice | MIR-ST500 | ≥ 0.85 |
| Solo guitar | GuitarSet | ≥ 0.80 |
| Bass (post-Demucs) | MUSDB18 — bass | ≥ 0.75 |
| Full-mix lead | MUSDB18 — vocals | ≥ 0.65 |

## Baseline (vanilla Basic Pitch, before improvements)

> **TODO** — fill this in after running on the un-improved pipeline at the
> commit immediately preceding the accuracy work. Use `git checkout` on the
> previous commit, run the benchmark, then come back to master.

| Category | Samples | Precision | Recall | F1 |
|---|---|---|---|---|
| Solo piano | — | — | — | — |
| Solo voice | — | — | — | — |
| Solo guitar | — | — | — | — |
| Bass | — | — | — | — |
| Full-mix lead | — | — | — | — |

## After Stage 2 (beat-aware quantization)

| Category | Samples | F1 | Δ vs baseline |
|---|---|---|---|
| Solo piano | — | — | — |
| Solo voice | — | — | — |
| Solo guitar | — | — | — |
| Bass | — | — | — |
| Full-mix lead | — | — | — |

## After Stage 3 (post-processing cleanup)

| Category | Samples | F1 | Δ vs baseline |
|---|---|---|---|
| Solo piano | — | — | — |
| Solo voice | — | — | — |
| Solo guitar | — | — | — |
| Bass | — | — | — |
| Full-mix lead | — | — | — |

## After Stage 4 (calibrated thresholds)

| Category | Samples | F1 | Δ vs baseline |
|---|---|---|---|
| Solo piano | — | — | — |
| Solo voice | — | — | — |
| Solo guitar | — | — | — |
| Bass | — | — | — |
| Full-mix lead | — | — | — |

## Final (all improvements on, refine default-on)

| Category | Samples | F1 | Δ vs baseline | Target hit? |
|---|---|---|---|---|
| Solo piano | — | — | — | — |
| Solo voice | — | — | — | — |
| Solo guitar | — | — | — | — |
| Bass | — | — | — | — |
| Full-mix lead | — | — | — | — |

## Methodology

Notes are counted as true positives when:

- Pitch matches the reference exactly, AND
- Onset is within ±50 ms of the reference onset

This is the standard MIR evaluation tolerance (Bay et al., ISMIR 2009).

For multi-stem MUSDB18 samples, run with `--stem-aware` to compare each
detected stem against its matching `ground_truth_<stem>.mid` file rather
than lumping all stems against a single reference.

## Updating the public /accuracy page

Once this file has real numbers, copy them into
`frontend/app/accuracy/page.tsx` (the `BENCHMARK_RESULTS` array). The page
auto-renders the F1 against the target with a ✓/below-target badge.
