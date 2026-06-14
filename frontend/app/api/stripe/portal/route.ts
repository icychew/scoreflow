import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { convex, api, CONVEX_SECRET } from "@/lib/convex";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const customerId = await convex.query(api.users.getStripeCustomerId, {
    secret: CONVEX_SECRET,
    userId: session.user.id,
  });

  if (!customerId) {
    return NextResponse.json({ error: "No billing account" }, { status: 400 });
  }

  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.NEXTAUTH_URL?.trim()}/dashboard`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
