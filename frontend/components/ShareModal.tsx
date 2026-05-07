"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

interface ShareModalProps {
  jobId: string;
  open: boolean;
  onClose: () => void;
}

export default function ShareModal({ jobId, open, onClose }: ShareModalProps) {
  const [creating, setCreating] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset state on close + create on open
  useEffect(() => {
    if (!open) {
      setShareUrl(null);
      setExpiresAt(null);
      setError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setCreating(true);
      setError(null);
      try {
        const res = await fetch("/api/share", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        if (cancelled) return;
        const url = `${window.location.origin}/share/${data.token}`;
        setShareUrl(url);
        setExpiresAt(data.expiresAt);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not create share link");
      } finally {
        if (!cancelled) setCreating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, jobId]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const copy = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    toast.success("Link copied");
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm cursor-default"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Share score"
        className="relative w-full max-w-md rounded-2xl border border-[#27272a] bg-[#0c0c0e] p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Share this score</h2>
            <p className="text-xs text-[#71717a] mt-0.5">
              Anyone with the link can view it — no sign-in required.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="text-[#71717a] hover:text-white text-xl leading-none"
          >
            ×
          </button>
        </div>

        {creating && (
          <div className="flex items-center gap-3 py-4">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
            <span className="text-sm text-slate-400">Creating share link…</span>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-800 bg-red-950/30 p-3 text-sm text-red-400">
            ⚠ {error}
          </div>
        )}

        {shareUrl && (
          <>
            <div className="flex items-center gap-2 rounded-lg border border-[#27272a] bg-[#111113] px-3 py-2 mb-3">
              <input
                type="text"
                readOnly
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 bg-transparent text-sm text-white font-mono truncate focus:outline-none"
              />
              <button
                type="button"
                onClick={copy}
                className="rounded-md bg-violet-600 px-3 py-1 text-xs font-semibold text-white hover:bg-violet-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0c0e]"
              >
                Copy
              </button>
            </div>

            {expiresAt && (
              <p className="text-xs text-[#52525b]">
                Expires{" "}
                {new Date(expiresAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
