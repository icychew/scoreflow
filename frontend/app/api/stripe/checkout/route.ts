import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { convex, api, CONVEX_SECRET } from "@/lib/convex";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json() as { priceId?: string };
  const { priceId } = body;
  if (!priceId) {
    return NextResponse.json({ error: "Missing priceId" }, { status: 400 });
  }

  const allowedPriceIds = [
    process.env.STRIPE_PRICE_PRO_MONTHLY,
    process.env.STRIPE_PRICE_PRO_YEARLY,
    process.env.STRIPE_PRICE_BUSINESS_MONTHLY,
    process.env.STRIPE_PRICE_BUSINESS_YEARLY,
  ].filter((id): id is string => Boolean(id));

  if (!allowedPriceIds.includes(priceId)) {
    return NextResponse.json({ error: "Invalid priceId" }, { status: 400 });
  }

  try {
    // Get or create Stripe customer
    let customerId =
      (await convex.query(api.users.getStripeCustomerId, {
        secret: CONVEX_SECRET,
        userId: session.user.id,
      })) ?? undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: session.user.email,
        metadata: { songscore_user_id: session.user.id },
      });
      customerId = customer.id;
      await convex.mutation(api.users.setStripeCustomerId, {
        secret: CONVEX_SECRET,
        userId: session.user.id,
        stripeCustomerId: customerId,
      });
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.NEXTAUTH_URL?.trim()}/dashboard?upgrade=success`,
      cancel_url: `${process.env.NEXTAUTH_URL?.trim()}/pricing`,
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
