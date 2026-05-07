import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "API Documentation — Notara",
  description: "Notara REST API reference for the Business plan.",
};

const baseUrl = "https://scoreflow-gamma.vercel.app";

interface Endpoint {
  method: "GET" | "POST" | "DELETE" | "PATCH";
  path: string;
  summary: string;
  body?: string;
  example: string;
  responseExample: string;
}

const ENDPOINTS: Endpoint[] = [
  {
    method: "GET",
    path: "/api/v1/jobs",
    summary: "List your transcriptions (paginated).",
    example: `curl -H "Authorization: Bearer $NOTARA_KEY" \\
  "${baseUrl}/api/v1/jobs?limit=10&offset=0&status=done"`,
    responseExample: `{
  "jobs": [
    {
      "id": "uuid",
      "job_id": "abc123",
      "filename": "song.mp3",
      "title": "My demo track",
      "status": "done",
      "created_at": "2026-05-08T01:23:45.000Z",
      "url": "${baseUrl}/api/v1/jobs/abc123"
    }
  ],
  "pagination": { "limit": 10, "offset": 0, "total": 42 }
}`,
  },
  {
    method: "POST",
    path: "/api/v1/jobs",
    summary: "Submit a new transcription. Body is multipart/form-data.",
    body: "Fields: file (required), quality (standard|high), refine (true|false).",
    example: `curl -X POST -H "Authorization: Bearer $NOTARA_KEY" \\
  -F "file=@song.mp3" \\
  -F "quality=high" \\
  -F "refine=false" \\
  "${baseUrl}/api/v1/jobs"`,
    responseExample: `{
  "job_id": "abc123",
  "status": "processing",
  "url": "${baseUrl}/api/v1/jobs/abc123"
}`,
  },
  {
    method: "GET",
    path: "/api/v1/jobs/{id}",
    summary: "Fetch live status and download URLs for a job.",
    example: `curl -H "Authorization: Bearer $NOTARA_KEY" \\
  "${baseUrl}/api/v1/jobs/abc123"`,
    responseExample: `{
  "job_id": "abc123",
  "status": "done",
  "title": "My demo track",
  "current_stage": "done",
  "stages": [...],
  "total_time_seconds": 47.2,
  "downloads": {
    "vocals": {
      "musicxml": "${baseUrl}/api/v1/jobs/abc123/download/vocals/musicxml",
      "mid": "${baseUrl}/api/v1/jobs/abc123/download/vocals/mid"
    },
    "bass": { ... },
    "other": { ... }
  }
}`,
  },
  {
    method: "GET",
    path: "/api/v1/jobs/{id}/download/{stem}/{fmt}",
    summary:
      "Download a single artifact. Supported formats: musicxml, mid (and pdf when available).",
    example: `curl -H "Authorization: Bearer $NOTARA_KEY" \\
  -o vocals.musicxml \\
  "${baseUrl}/api/v1/jobs/abc123/download/vocals/musicxml"`,
    responseExample: "(binary file body)",
  },
];

export default function ApiDocsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10 sm:py-14">
      <div className="mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">
          Notara API
        </h1>
        <p className="text-base text-[#a1a1aa]">
          REST endpoints for programmatic access. Available on the{" "}
          <Link href="/pricing" className="text-violet-400 hover:underline">
            Business plan
          </Link>
          .
        </p>
      </div>

      {/* Auth section */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-white mb-3">Authentication</h2>
        <p className="text-sm text-[#a1a1aa] mb-4 leading-relaxed">
          Generate a key in your{" "}
          <Link href="/dashboard/keys" className="text-violet-400 hover:underline">
            dashboard
          </Link>
          . Pass it as a Bearer token on every request:
        </p>
        <CodeBlock>{`Authorization: Bearer nta_xxxxxxxxxxxxxxxxxxxxxxxx`}</CodeBlock>
        <p className="text-xs text-[#71717a] mt-3">
          Keys are tied to your account. Revoke a leaked key immediately from
          the dashboard. The plaintext is shown only at creation time.
        </p>
      </section>

      {/* Errors */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-white mb-3">Errors</h2>
        <ul className="text-sm text-[#a1a1aa] space-y-1">
          <li>
            <code className="text-[#fafafa]">401</code> — missing / invalid /
            revoked key
          </li>
          <li>
            <code className="text-[#fafafa]">403</code> — your tier isn&apos;t
            Business
          </li>
          <li>
            <code className="text-[#fafafa]">404</code> — job not yours or
            doesn&apos;t exist
          </li>
          <li>
            <code className="text-[#fafafa]">502</code> — pipeline backend
            unreachable
          </li>
        </ul>
      </section>

      {/* Endpoints */}
      <section>
        <h2 className="text-xl font-semibold text-white mb-5">Endpoints</h2>
        <div className="flex flex-col gap-8">
          {ENDPOINTS.map((ep) => (
            <div key={`${ep.method} ${ep.path}`} className="rounded-xl border border-[#27272a] bg-[#0c0c0e] p-5 sm:p-6">
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <span className={`text-xs font-mono font-bold px-2 py-1 rounded ${methodColor(ep.method)}`}>
                  {ep.method}
                </span>
                <code className="text-sm font-mono text-white break-all">
                  {ep.path}
                </code>
              </div>
              <p className="text-sm text-[#a1a1aa] mb-3">{ep.summary}</p>
              {ep.body && (
                <p className="text-xs text-[#71717a] mb-4">{ep.body}</p>
              )}
              <p className="text-xs uppercase tracking-widest text-[#52525b] mb-1.5">
                Example
              </p>
              <CodeBlock>{ep.example}</CodeBlock>
              <p className="text-xs uppercase tracking-widest text-[#52525b] mt-4 mb-1.5">
                Response
              </p>
              <CodeBlock>{ep.responseExample}</CodeBlock>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-12 text-center text-sm text-[#71717a]">
        <Link
          href="/dashboard/keys"
          className="text-violet-400 hover:text-violet-300 underline"
        >
          Manage your keys →
        </Link>
      </div>
    </div>
  );
}

function methodColor(method: Endpoint["method"]): string {
  switch (method) {
    case "GET":    return "bg-emerald-900/40 text-emerald-300";
    case "POST":   return "bg-violet-900/40 text-violet-300";
    case "DELETE": return "bg-red-900/40 text-red-300";
    case "PATCH":  return "bg-amber-900/40 text-amber-300";
  }
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="rounded-lg border border-[#27272a] bg-[#050507] px-4 py-3 text-xs leading-relaxed text-[#fafafa] font-mono overflow-x-auto whitespace-pre-wrap">
      {children}
    </pre>
  );
}
