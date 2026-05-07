import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/comp";
import CreateCodeForm from "./CreateCodeForm";
import RevokeButton from "./RevokeButton";

export const metadata = { title: "Admin · Comp Codes — Notara" };

interface CompCodeRow {
  code: string;
  tier: string;
  max_uses: number;
  used_count: number;
  expires_at: string | null;
  note: string | null;
  created_at: string;
}

export default async function AdminCodesPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/signin");
  if (!isAdmin(session.user.email)) {
    return (
      <div className="mx-auto max-w-md py-20 px-6 text-center">
        <div className="mb-4 text-4xl">🔒</div>
        <h1 className="text-xl font-semibold text-white mb-2">Forbidden</h1>
        <p className="text-sm text-[#71717a]">
          This page is restricted to administrators.
        </p>
      </div>
    );
  }

  const { data: codes } = await db
    .from("comp_codes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  const list = (codes ?? []) as CompCodeRow[];

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10">
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Comp Codes</h1>
          <p className="text-sm text-[#71717a] mt-1">
            Generate redemption codes that grant Pro or Business tier without
            payment.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="text-sm text-[#a1a1aa] hover:text-white transition-colors"
        >
          ← Back to dashboard
        </Link>
      </div>

      <CreateCodeForm />

      <h2 className="text-lg font-semibold text-white mt-10 mb-4">
        Recent codes ({list.length})
      </h2>

      {list.length === 0 ? (
        <div className="text-center py-12 text-[#52525b] border border-[#27272a] rounded-xl">
          No codes generated yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#27272a]">
          <table className="w-full text-sm">
            <thead className="bg-[#0c0c0e] border-b border-[#27272a]">
              <tr className="text-left text-xs uppercase tracking-widest text-[#71717a]">
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Tier</th>
                <th className="px-4 py-3 font-medium">Used</th>
                <th className="px-4 py-3 font-medium">Expires</th>
                <th className="px-4 py-3 font-medium">Note</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#27272a]">
              {list.map((c) => {
                const expired = c.expires_at && new Date(c.expires_at) < new Date();
                const used = c.used_count >= c.max_uses;
                return (
                  <tr key={c.code} className="bg-[#111113]">
                    <td className="px-4 py-3 font-mono text-xs text-white">
                      {c.code}
                    </td>
                    <td className="px-4 py-3">
                      <span className="capitalize text-violet-300">{c.tier}</span>
                    </td>
                    <td className="px-4 py-3 text-[#a1a1aa]">
                      {c.used_count} / {c.max_uses}
                    </td>
                    <td className="px-4 py-3 text-[#a1a1aa]">
                      {c.expires_at ? (
                        <span className={expired ? "text-red-400" : ""}>
                          {new Date(c.expires_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                          {expired && " (expired)"}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#71717a] text-xs max-w-xs truncate">
                      {c.note || "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!expired && !used && <RevokeButton code={c.code} />}
                      {(expired || used) && (
                        <span className="text-xs text-[#52525b]">
                          {used ? "fully used" : "revoked"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-6 text-xs text-[#52525b]">
        Tip: also see <code className="text-[#a1a1aa]">COMP_PRO_EMAILS</code> /{" "}
        <code className="text-[#a1a1aa]">COMP_BUSINESS_EMAILS</code> /{" "}
        <code className="text-[#a1a1aa]">ADMIN_EMAILS</code> env vars in Vercel
        for instant comp by email.
      </p>
    </div>
  );
}
