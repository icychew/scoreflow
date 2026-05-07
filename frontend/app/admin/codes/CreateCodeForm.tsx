"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createCode } from "./actions";

export default function CreateCodeForm() {
  const [tier, setTier] = useState<"pro" | "business">("pro");
  const [maxUses, setMaxUses] = useState(1);
  const [expiresInDays, setExpiresInDays] = useState<string>("30");
  const [note, setNote] = useState("");
  const [generated, setGenerated] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        const code = await createCode({
          tier,
          maxUses,
          expiresInDays: expiresInDays ? Number(expiresInDays) : null,
          note,
        });
        setGenerated(code);
        setNote("");
        toast.success("Code created", { description: code });
      } catch (err) {
        toast.error("Could not create code", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
      }
    });
  };

  const copy = async () => {
    if (!generated) return;
    await navigator.clipboard.writeText(generated);
    toast.success("Copied to clipboard");
  };

  return (
    <div className="rounded-xl border border-[#27272a] bg-[#0c0c0e] p-5 sm:p-6">
      <h3 className="text-sm font-semibold text-white mb-4">
        Generate a new code
      </h3>

      {generated ? (
        <div className="rounded-lg border border-violet-500/40 bg-violet-500/10 p-5 text-center">
          <p className="text-xs text-violet-300 mb-2 uppercase tracking-widest">
            Share this code
          </p>
          <p className="font-mono text-2xl font-bold text-white tracking-wider mb-4">
            {generated}
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <button
              type="button"
              onClick={copy}
              className="rounded-md bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0c0e]"
            >
              Copy code
            </button>
            <button
              type="button"
              onClick={() => setGenerated(null)}
              className="rounded-md border border-[#27272a] px-4 py-2 text-xs font-medium text-[#a1a1aa] hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0c0e]"
            >
              Create another
            </button>
          </div>
          <p className="mt-3 text-xs text-[#71717a]">
            Recipient can redeem at <code className="text-violet-300">/redeem</code>
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-[#a1a1aa]">Tier</span>
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value as "pro" | "business")}
              className="rounded-lg border border-[#27272a] bg-[#111113] px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
            >
              <option value="pro">Pro</option>
              <option value="business">Business</option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-[#a1a1aa]">Max uses</span>
            <input
              type="number"
              min={1}
              max={1000}
              value={maxUses}
              onChange={(e) => setMaxUses(Math.max(1, Number(e.target.value)))}
              className="rounded-lg border border-[#27272a] bg-[#111113] px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-[#a1a1aa]">
              Expires in (days, blank = never)
            </span>
            <input
              type="number"
              min={1}
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value)}
              placeholder="30"
              className="rounded-lg border border-[#27272a] bg-[#111113] px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-[#a1a1aa]">Note (optional)</span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. for John's band"
              className="rounded-lg border border-[#27272a] bg-[#111113] px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
            />
          </label>

          <div className="sm:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-gradient-to-r from-violet-600 to-indigo-700 px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0c0e]"
            >
              {pending ? "Generating…" : "Generate code"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
