"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { revokeCode } from "./actions";

export default function RevokeButton({ code }: { code: string }) {
  const [pending, startTransition] = useTransition();

  const handleClick = () => {
    if (!confirm(`Revoke code ${code}? It will stop working immediately.`)) return;
    startTransition(async () => {
      try {
        await revokeCode(code);
        toast.success("Code revoked");
      } catch (err) {
        toast.error("Could not revoke", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="rounded-md border border-red-800 px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-red-900/30 transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111113]"
    >
      {pending ? "…" : "Revoke"}
    </button>
  );
}
