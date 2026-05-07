import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { db } from "@/lib/db";

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
      const { error } = await db.from("users").upsert(
        { id: userId, email: user.email },
        { onConflict: "id" }
      );
      if (error) {
        console.error("[auth] Failed to upsert user:", error);
        return false;
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
