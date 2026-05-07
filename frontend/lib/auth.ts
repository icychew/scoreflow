import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { db } from "@/lib/db";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Resend({ from: "noreply@notara.app" }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      await db.from("users").upsert(
        { id: user.id!, email: user.email },
        { onConflict: "id", ignoreDuplicates: true }
      );
      return true;
    },
    async session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      const { data } = await db
        .from("users")
        .select("tier")
        .eq("id", token.sub!)
        .single();
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
      email: string;
      name?: string | null;
      image?: string | null;
      tier: "free" | "pro" | "business";
    };
  }
}
