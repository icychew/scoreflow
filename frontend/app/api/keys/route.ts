import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { convex, api, CONVEX_SECRET } from "@/lib/convex";
import { generateApiKey } from "@/lib/apiAuth";

const MAX_KEYS_PER_USER = 10;
const MAX_NAME_LEN = 60;

/**
 * GET /api/keys — list the caller's keys (no plaintext, just metadata).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const keys = await convex.query(api.apiKeys.listByUser, {
      secret: CONVEX_SECRET,
      userId: session.user.id,
    });
    return NextResponse.json({ keys });
  } catch (error) {
    console.error("[GET /api/keys]:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * POST /api/keys  { name: string }
 *
 * Generates a new key. The plaintext is returned ONCE in the response.
 * Subsequent calls only see the prefix.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Tier gate — only Business can create keys
  if (session.user.tier !== "business") {
    return NextResponse.json(
      { error: "API keys require the Business plan." },
      { status: 403 },
    );
  }

  // Cap to prevent abuse
  const count = await convex.query(api.apiKeys.countActiveByUser, {
    secret: CONVEX_SECRET,
    userId: session.user.id,
  });
  if (count >= MAX_KEYS_PER_USER) {
    return NextResponse.json(
      { error: `You already have ${MAX_KEYS_PER_USER} active keys; revoke one first.` },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name =
    typeof body === "object" && body !== null && "name" in body
      ? String((body as { name: unknown }).name).trim().slice(0, MAX_NAME_LEN)
      : "";
  if (!name) {
    return NextResponse.json({ error: "Name is required (1-60 chars)." }, { status: 400 });
  }

  const { plaintext, hash, prefix } = generateApiKey();
  let data: { id: string; key_prefix: string; name: string; created_at: string };
  try {
    data = await convex.mutation(api.apiKeys.create, {
      secret: CONVEX_SECRET,
      userId: session.user.id,
      keyHash: hash,
      keyPrefix: prefix,
      name,
    });
  } catch (error) {
    console.error("[POST /api/keys]:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  return NextResponse.json({
    id: data.id,
    name: data.name,
    prefix: data.key_prefix,
    created_at: data.created_at,
    // The plaintext key is shown ONCE — it cannot be retrieved later
    plaintext,
  });
}

/**
 * DELETE /api/keys?id=<keyId> — revoke (soft delete) a key.
 */
export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing ?id=" }, { status: 400 });
  }

  try {
    await convex.mutation(api.apiKeys.revoke, {
      secret: CONVEX_SECRET,
      id,
      userId: session.user.id, // ownership guard enforced server-side
    });
  } catch (error) {
    console.error("[DELETE /api/keys]:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
