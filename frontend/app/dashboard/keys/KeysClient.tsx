"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

interface KeyRow {
  id: string;
  key_prefix: string;
  name: string;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

interface KeysClientProps {
  initialKeys: KeyRow[];
}

export default function KeysClient({ initialKeys }: KeysClientProps) {
  const [keys, setKeys] = useState(initialKeys);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const [justCreated, setJustCreated] = useState<{ name: string; plaintext: string } | null>(null);

  const createKey = () => {
    if (!name.trim()) {
      toast.error("Give the key a name");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        setJustCreated({ name: data.name, plaintext: data.plaintext });
        setKeys((prev) => [
          {
            id: data.id,
            key_prefix: data.prefix,
            name: data.name,
            last_used_at: null,
            created_at: data.created_at,
            revoked_at: null,
          },
          ...prev,
        ]);
        setName("");
      } catch (err) {
        toast.error("Could not create key", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
      }
    });
  };

  const revokeKey = (id: string) => {
    if (!confirm("Revoke this key? Any apps using it will stop working.")) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/keys?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        setKeys((prev) =>
          prev.map((k) =>
            k.id === id ? { ...k, revoked_at: new Date().toISOString() } : k,
          ),
        );
        toast.success("Key revoked");
      } catch (err) {
        toast.error("Could not revoke", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
      }
    });
  };

  const copyKey = async (key: string) => {
    await navigator.clipboard.writeText(key);
    toast.success("Copied to clipboard");
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Just-created key (shown once) */}
      {justCreated && (
        <div className="rounded-xl border border-violet-500/40 bg-violet-500/10 p-5">
          <div className="flex items-start gap-3 mb-3">
            <span className="text-xl">🔑</span>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-white">
                Your new key — copy it now
              </h3>
              <p className="text-xs text-[#a1a1aa] mt-1">
                This is the only time we&apos;ll show the full key.
                If you lose it, you&apos;ll need to create a new one.
              </p>
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setJustCreated(null)}
              className="text-[#71717a] hover:text-white text-lg leading-none"
            >
              ×
            </button>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-[#27272a] bg-[#111113] px-3 py-2">
            <input
              type="text"
              readOnly
              value={justCreated.plaintext}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 bg-transparent text-sm text-white font-mono truncate focus:outline-none"
            />
            <button
              type="button"
              onClick={() => copyKey(justCreated.plaintext)}
              className="rounded-md bg-violet-600 px-3 py-1 text-xs font-semibold text-white hover:bg-violet-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-violet-500/10"
            >
              Copy
            </button>
          </div>
        </div>
      )}

      {/* Create form */}
      <div className="rounded-xl border border-[#27272a] bg-[#0c0c0e] p-5">
        <h3 className="text-sm font-semibold text-white mb-3">Create a new key</h3>
        <div className="flex gap-3 flex-wrap">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. My production server"
            maxLength={60}
            className="flex-1 min-w-[200px] rounded-lg border border-[#27272a] bg-[#111113] px-3 py-2 text-sm text-white placeholder-[#52525b] focus:outline-none focus:border-violet-500"
          />
          <button
            type="button"
            onClick={createKey}
            disabled={pending || !name.trim()}
            className="rounded-lg bg-gradient-to-r from-violet-600 to-indigo-700 px-5 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0c0e]"
          >
            {pending ? "Creating…" : "Generate key"}
          </button>
        </div>
      </div>

      {/* Existing keys */}
      <div>
        <h3 className="text-sm font-semibold text-white mb-3">
          Your keys ({keys.filter((k) => !k.revoked_at).length} active)
        </h3>
        {keys.length === 0 ? (
          <div className="text-center py-8 text-sm text-[#52525b] border border-[#27272a] rounded-xl">
            No keys yet. Create one above.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#27272a]">
            <table className="w-full text-sm">
              <thead className="bg-[#0c0c0e] border-b border-[#27272a]">
                <tr className="text-left text-xs uppercase tracking-widest text-[#71717a]">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Key</th>
                  <th className="px-4 py-3 font-medium">Last used</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#27272a]">
                {keys.map((k) => (
                  <tr key={k.id} className={`bg-[#111113] ${k.revoked_at ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3 text-white">{k.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-[#a1a1aa]">
                      {k.key_prefix}…
                    </td>
                    <td className="px-4 py-3 text-xs text-[#a1a1aa]">
                      {k.last_used_at
                        ? new Date(k.last_used_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "Never"}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#a1a1aa]">
                      {new Date(k.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {k.revoked_at ? (
                        <span className="text-xs text-[#52525b]">revoked</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => revokeKey(k.id)}
                          disabled={pending}
                          className="rounded-md border border-red-800 px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-red-900/30 transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111113]"
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
