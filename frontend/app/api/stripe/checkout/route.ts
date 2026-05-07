import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";

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

  // Get or create Stripe customer
  const { data: user } = await db
    .from("users")
    .select("stripe_customer_id")
    .eq("id", session.user.id)
    .single();

  let customerId = user?.stripe_customer_id as string | undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: session.user.email,
      metadata: { notara_user_id: session.user.id },
    });
    customerId = customer.id;
    await db
      .from("users")
      .update({ stripe_customer_id: customerId })
      .eq("id", session.user.id);
  }

  const checkoutSession = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXTAUTH_URL}/dashboard?upgrade=success`,
    cancel_url: `${process.env.NEXTAUTH_URL}/pricing`,
  });

  return NextResponse.json({ url: checkoutSession.url });
}
