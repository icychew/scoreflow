import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * POST /api/redeem  { code: string }
 *
 * Validates a redemption code and grants the associated tier to the caller.
 * - Code must exist, not be expired, have used_count < max_uses
 * - User can only redeem each code once (UNIQUE constraint on redemptions)
 * - Sets users.tier_source = 'comp_code' so future sign-ins don't downgrade
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in to redeem a code." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const code =
    typeof body === "object" && body !== null && "code" in body
      ? String((body as { code: unknown }).code).trim().toUpperCase()
      : "";
  if (!code) {
    return NextResponse.json({ error: "Code is required." }, { status: 400 });
  }

  // Look up code
  const { data: comp, error: lookupErr } = await db
    .from("comp_codes")
    .select("code, tier, max_uses, used_count, expires_at")
    .eq("code", code)
    .maybeSingle();

  if (lookupErr) {
    console.error("[redeem] lookup error:", lookupErr);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
  if (!comp) {
    return NextResponse.json({ error: "Invalid code." }, { status: 404 });
  }

  // Validate
  if (comp.expires_at && new Date(comp.expires_at as string) < new Date()) {
    return NextResponse.json({ error: "This code has expired." }, { status: 410 });
  }
  if ((comp.used_count as number) >= (comp.max_uses as number)) {
    return NextResponse.json(
      { error: "This code has already been fully redeemed." },
      { status: 410 },
    );
  }

  // Insert redemption (UNIQUE constraint prevents double-redeem by same user)
  const { error: redeemErr } = await db
    .from("comp_code_redemptions")
    .insert({ code, user_id: session.user.id });
  if (redeemErr) {
    // Postgres unique violation = 23505
    if ((redeemErr as { code?: string }).code === "23505") {
      return NextResponse.json(
        { error: "You have already redeemed this code." },
        { status: 409 },
      );
    }
    console.error("[redeem] insert error:", redeemErr);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  // Increment used_count and grant tier (only if it's an upgrade)
  await Promise.all([
    db
      .from("comp_codes")
      .update({ used_count: (comp.used_count as number) + 1 })
      .eq("code", code),
    upgradeUserIfBetter(session.user.id, comp.tier as "pro" | "business"),
  ]);

  return NextResponse.json({ success: true, tier: comp.tier });
}

async function upgradeUserIfBetter(userId: string, newTier: "pro" | "business") {
  const rank = { free: 0, pro: 1, business: 2 } as const;
  const { data } = await db
    .from("users")
    .select("tier, tier_source")
    .eq("id", userId)
    .single();
  if (!data) return;

  const current = (data.tier ?? "free") as keyof typeof rank;
  // Only upgrade — never downgrade. If user is paying Stripe Pro, don't
  // downgrade them by redeeming a Pro comp code; only upgrade for Business.
  if (rank[newTier] <= rank[current]) return;

  await db
    .from("users")
    .update({ tier: newTier, tier_source: "comp_code" })
    .eq("id", userId);
}
