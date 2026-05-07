"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";

export interface DashboardItem {
  id: string;
  job_id: string | null;
  filename: string | null;
  title: string | null;
  status: string;
  created_at: string | null;
}

interface DashboardListProps {
  items: DashboardItem[];
}

export default function DashboardList({ items: initial }: DashboardListProps) {
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return items;
    return items.filter((t) => {
      const display = ((t.title ?? t.filename) ?? "").toLowerCase();
      return display.includes(q);
    });
  }, [items, filter]);

  const handleRename = (id: string, newTitle: string) => {
    setItems((prev) =>
      prev.map((t) => (t.id === id ? { ...t, title: newTitle } : t)),
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Search */}
      <div className="flex items-center gap-2 rounded-lg border border-[#27272a] bg-[#0c0c0e] px-3 py-2">
        <svg
          className="w-4 h-4 text-[#52525b]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35m0 0a7.5 7.5 0 1 0-10.6-10.6 7.5 7.5 0 0 0 10.6 10.6Z" />
        </svg>
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search transcriptions…"
          className="flex-1 bg-transparent text-sm text-white placeholder-[#52525b] focus:outline-none"
        />
        {filter && (
          <button
            type="button"
            onClick={() => setFilter("")}
            aria-label="Clear search"
            className="text-xs text-[#71717a] hover:text-white"
          >
            ×
          </button>
        )}
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="text-center py-8 text-sm text-[#52525b] border border-[#27272a] rounded-xl">
          {filter
            ? `No transcriptions match "${filter}".`
            : "No transcriptions yet."}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((t) => (
            <DashboardRow key={t.id} item={t} onRename={handleRename} />
          ))}
        </div>
      )}
    </div>
  );
}

interface DashboardRowProps {
  item: DashboardItem;
  onRename: (id: string, newTitle: string) => void;
}

function DashboardRow({ item, onRename }: DashboardRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.title ?? item.filename ?? "");
  const [pending, startTransition] = useTransition();

  const display = item.title ?? item.filename ?? "Untitled";

  const submit = () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === display) {
      setEditing(false);
      return;
    }
    if (!item.job_id) {
      toast.error("Cannot rename — missing job id");
      setEditing(false);
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/jobs/${item.job_id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: trimmed }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        onRename(item.id, data.title);
        toast.success("Renamed");
      } catch (err) {
        toast.error("Could not rename", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
      } finally {
        setEditing(false);
      }
    });
  };

  return (
    <div className="flex items-center justify-between rounded-lg border border-[#27272a] bg-[#111113] px-4 py-3">
      <div className="flex-1 min-w-0">
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={submit}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setDraft(display);
                  setEditing(false);
                }
              }}
              autoFocus
              maxLength={120}
              disabled={pending}
              className="flex-1 rounded border border-violet-500/40 bg-[#0c0c0e] px-2 py-1 text-sm text-white focus:outline-none focus:border-violet-500"
            />
          </form>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white truncate">
              {display}
            </span>
            <button
              type="button"
              onClick={() => {
                setDraft(display);
                setEditing(true);
              }}
              aria-label="Rename"
              className="text-[#52525b] hover:text-violet-400 transition-colors flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111113] rounded"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5m-1.414-9.414a2 2 0 1 1 2.828 2.828L11.828 15H9v-2.828l8.586-8.586Z" />
              </svg>
            </button>
          </div>
        )}
        <div className="text-xs text-[#52525b] mt-0.5">
          {item.created_at
            ? new Date(item.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            : "—"}
        </div>
      </div>
      <div className="flex items-center gap-3 ml-3">
        <span
          className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
            item.status === "done"
              ? "bg-green-900/40 text-green-400"
              : item.status === "failed"
                ? "bg-red-900/40 text-red-400"
                : "bg-yellow-900/40 text-yellow-400"
          }`}
        >
          {item.status}
        </span>
        {item.status === "done" && item.job_id && (
          <Link
            href={`/job/${item.job_id}`}
            className="text-xs text-violet-400 hover:text-violet-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111113] rounded px-1"
          >
            View →
          </Link>
        )}
      </div>
    </div>
  );
}
