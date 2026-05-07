import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { db } from "@/lib/db";
import { getCompTier } from "@/lib/comp";

if (!process.env.GOOGLE_CLIENT_ID) throw new Error("Missing GOOGLE_CLIENT_ID");
if (!process.env.GOOGLE_CLIENT_SECRET) throw new Error("Missing GOOGLE_CLIENT_SECRET");

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      const userId = user.id ?? user.email;

      // Step 1: ensure the user row exists. Don't touch tier here — that's
      // managed by step 2 below using tier_source as the policy lever.
      const { error: upsertErr } = await db
        .from("users")
        .upsert({ id: userId, email: user.email }, { onConflict: "id", ignoreDuplicates: false });
      if (upsertErr) {
        console.error("[auth] Failed to upsert user:", upsertErr);
        return false;
      }

      // Step 2: read current tier_source so we know what we're allowed to overwrite.
      // - `default` or `comp_email` → safe to overwrite from env allowlist
      // - `stripe` or `comp_code` → don't touch; those have their own lifecycles
      const { data: existing } = await db
        .from("users")
        .select("tier, tier_source")
        .eq("id", userId)
        .single();

      const compTier = getCompTier(user.email);
      const currentSource = (existing?.tier_source ?? "default") as
        | "default"
        | "comp_email"
        | "comp_code"
        | "stripe";

      if (compTier) {
        // Email is in allowlist → grant comp tier (overrides default/comp_email).
        // Don't override stripe or comp_code; those are stronger.
        if (currentSource === "default" || currentSource === "comp_email") {
          await db
            .from("users")
            .update({ tier: compTier, tier_source: "comp_email" })
            .eq("id", userId);
        }
      } else if (currentSource === "comp_email") {
        // Email was previously in allowlist but isn't anymore → auto-downgrade.
        // This is the whole reason tier_source exists.
        await db
          .from("users")
          .update({ tier: "free", tier_source: "default" })
          .eq("id", userId);
      }

      return true;
    },
    async session({ session, token }) {
      if (!token.sub) return session;
      session.user.id = token.sub;
      const { data, error } = await db
        .from("users")
        .select("tier")
        .eq("id", token.sub)
        .single();
      if (error) {
        console.error("[auth] Failed to fetch user tier:", error);
      }
      session.user.tier = (data?.tier ?? "free") as "free" | "pro" | "business";
      return session;
    },
    async jwt({ token }) {
      return token;
    },
  },
  pages: {
    signIn: "/signin",
  },
});

// Extend next-auth Session type
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
      tier: "free" | "pro" | "business";
    };
  }
}
