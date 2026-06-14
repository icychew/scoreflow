import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { convex, api, CONVEX_SECRET } from "@/lib/convex";
import { getCompTier } from "@/lib/comp";

if (!process.env.GOOGLE_CLIENT_ID) throw new Error("Missing GOOGLE_CLIENT_ID");
if (!process.env.GOOGLE_CLIENT_SECRET) throw new Error("Missing GOOGLE_CLIENT_SECRET");

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      // .trim() guards against trailing newlines in the Vercel env values
      // (a stray "\n" on GOOGLE_CLIENT_ID produces Google "invalid_client").
      clientId: process.env.GOOGLE_CLIENT_ID!.trim(),
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      const userId = user.id ?? user.email;

      try {
        // Step 1: ensure the user row exists. Don't touch tier here — that's
        // managed by step 2 below using tier_source as the policy lever.
        await convex.mutation(api.users.upsertUser, {
          secret: CONVEX_SECRET,
          userId,
          email: user.email,
        });

        // Step 2: read current tier_source so we know what we may overwrite.
        // - `default` or `comp_email` → safe to overwrite from env allowlist
        // - `stripe` or `comp_code` → don't touch; those have their own lifecycles
        const existing = await convex.query(api.users.getTierSource, {
          secret: CONVEX_SECRET,
          userId,
        });

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
            await convex.mutation(api.users.setTierBySource, {
              secret: CONVEX_SECRET,
              userId,
              tier: compTier,
              tierSource: "comp_email",
            });
          }
        } else if (currentSource === "comp_email") {
          // Email was previously in allowlist but isn't anymore → auto-downgrade.
          await convex.mutation(api.users.setTierBySource, {
            secret: CONVEX_SECRET,
            userId,
            tier: "free",
            tierSource: "default",
          });
        }

        return true;
      } catch (err) {
        console.error("[auth] Failed to sync user:", err);
        return false;
      }
    },
    async session({ session, token }) {
      if (!token.sub) return session;
      session.user.id = token.sub;
      try {
        const data = await convex.query(api.users.getTier, {
          secret: CONVEX_SECRET,
          userId: token.sub,
        });
        session.user.tier = (data?.tier ?? "free") as "free" | "pro" | "business";
      } catch (err) {
        console.error("[auth] Failed to fetch user tier:", err);
        session.user.tier = "free";
      }
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
