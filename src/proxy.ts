import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/constants";

const protectedPrefixes = ["/admin", "/libreria", "/impostazioni"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (protectedPrefixes.some((prefix) => pathname.startsWith(prefix)) && !request.cookies.get(SESSION_COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/libreria/:path*", "/impostazioni/:path*"]
};
