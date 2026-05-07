import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";

export default auth((req) => {
  const { nextUrl, auth: session } = req;
  const res = NextResponse.next();

  // Protect /dashboard
  if (nextUrl.pathname.startsWith("/dashboard") && !session) {
    return NextResponse.redirect(new URL("/signin", nextUrl));
  }

  // Set anonymous session token cookie (30-day) if not present and user not signed in
  if (!session && !req.cookies.get("notara_session")) {
    res.cookies.set("notara_session", nanoid(), {
      maxAge: 60 * 60 * 24 * 30,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  }

  return res;
});

export const config = {
  matcher: ["/dashboard/:path*", "/app/:path*"],
};
