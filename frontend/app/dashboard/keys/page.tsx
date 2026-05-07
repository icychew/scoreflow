import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import Link from "next/link";
import KeysClient from "./KeysClient";

export const metadata = { title: "API Keys — Notara" };

interface KeyRow {
  id: string;
  key_prefix: string;
  name: string;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

export default async function KeysPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const isBusiness = session.user.tier === "business";

  let keys: KeyRow[] = [];
  if (isBusiness) {
    const { data } = await db
      .from("api_keys")
      .select("id, key_prefix, name, last_used_at, created_at, revoked_at")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });
    keys = (data ?? []) as KeyRow[];
  }

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10">
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">API Keys</h1>
          <p className="text-sm text-[#71717a] mt-1">
            Programmatic access to Notara — Business plan only.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="text-sm text-[#a1a1aa] hover:text-white transition-colors"
        >
          ← Back to dashboard
        </Link>
      </div>

      {!isBusiness ? (
        <div className="rounded-xl border border-[#27272a] bg-[#0c0c0e] p-8 text-center">
          <div className="mb-4 text-3xl">🔒</div>
          <h2 className="text-lg font-semibold text-white mb-2">
            Business plan required
          </h2>
          <p className="text-sm text-[#a1a1aa] mb-6 max-w-sm mx-auto">
            API keys let you upload audio and fetch results from your own
            servers. Available on the Business plan ($49/mo).
          </p>
          <Link
            href="/pricing"
            className="inline-block rounded-lg bg-gradient-to-r from-violet-600 to-indigo-700 px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]"
          >
            Upgrade to Business →
          </Link>
        </div>
      ) : (
        <>
          <KeysClient initialKeys={keys} />

          <div className="mt-8 rounded-xl border border-[#27272a] bg-[#0c0c0e] p-5">
            <p className="text-sm text-[#a1a1aa]">
              Read the{" "}
              <Link href="/docs" className="text-violet-400 hover:underline">
                API documentation
              </Link>{" "}
              for endpoint details and curl examples.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
