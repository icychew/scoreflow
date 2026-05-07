import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import type Stripe from "stripe";

async function setUserTier(
  customerId: string,
  tier: "free" | "pro" | "business",
  subscriptionId?: string
) {
  const { error } = await db
    .from("users")
    .update({
      tier,
      stripe_subscription_id: subscriptionId ?? null,
    })
    .eq("stripe_customer_id", customerId);

  if (error) {
    throw error;
  }
}

function priceIdToTier(priceId: string): "pro" | "business" {
  const proIds = [
    process.env.STRIPE_PRICE_PRO_MONTHLY,
    process.env.STRIPE_PRICE_PRO_YEARLY,
  ];
  return proIds.includes(priceId) ? "pro" : "business";
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const cs = event.data.object as Stripe.Checkout.Session;
      if (cs.mode !== "subscription" || !cs.subscription) break;
      if (typeof cs.customer !== "string") break;
      const subscription = await stripe.subscriptions.retrieve(cs.subscription as string);
      const priceId = subscription.items.data[0].price.id;
      const tier = priceIdToTier(priceId);
      await setUserTier(cs.customer, tier, subscription.id);
      break;
    }
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      if (subscription.status === "past_due" || subscription.status === "unpaid") {
        await setUserTier(subscription.customer as string, "free");
        break;
      }
      if (subscription.status !== "active") break;
      const priceId = subscription.items.data[0].price.id;
      const tier = priceIdToTier(priceId);
      await setUserTier(subscription.customer as string, tier, subscription.id);
      break;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      await setUserTier(subscription.customer as string, "free");
      break;
    }
  }

  return NextResponse.json({ received: true });
}
