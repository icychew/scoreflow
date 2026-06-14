import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { convex, api, CONVEX_SECRET } from "@/lib/convex";

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
  let comp;
  try {
    comp = await convex.query(api.compCodes.getByCode, {
      secret: CONVEX_SECRET,
      code,
    });
  } catch (lookupErr) {
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
  let redeemResult: "inserted" | "duplicate";
  try {
    redeemResult = await convex.mutation(api.compCodes.tryInsertRedemption, {
      secret: CONVEX_SECRET,
      code,
      userId: session.user.id,
    });
  } catch (redeemErr) {
    console.error("[redeem] insert error:", redeemErr);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
  if (redeemResult === "duplicate") {
    return NextResponse.json(
      { error: "You have already redeemed this code." },
      { status: 409 },
    );
  }

  // Increment used_count and grant tier (only if it's an upgrade)
  await Promise.all([
    convex.mutation(api.compCodes.incrementUsedCount, {
      secret: CONVEX_SECRET,
      code,
    }),
    upgradeUserIfBetter(session.user.id, comp.tier as "pro" | "business"),
  ]);

  return NextResponse.json({ success: true, tier: comp.tier });
}

async function upgradeUserIfBetter(userId: string, newTier: "pro" | "business") {
  const rank = { free: 0, pro: 1, business: 2 } as const;
  const data = await convex.query(api.users.getTierSource, {
    secret: CONVEX_SECRET,
    userId,
  });
  if (!data) return;

  const current = (data.tier ?? "free") as keyof typeof rank;
  // Only upgrade — never downgrade. If user is paying Stripe Pro, don't
  // downgrade them by redeeming a Pro comp code; only upgrade for Business.
  if (rank[newTier] <= rank[current]) return;

  await convex.mutation(api.users.setTierBySource, {
    secret: CONVEX_SECRET,
    userId,
    tier: newTier,
    tierSource: "comp_code",
  });
}
