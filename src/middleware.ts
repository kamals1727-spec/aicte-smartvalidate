import { NextResponse, type NextRequest } from "next/server";

// Cheap redirect for signed-out visitors. This is NOT the security boundary — every page,
// server action and API route re-verifies the session and permissions on the server.
export function middleware(req: NextRequest) {
  if (!req.cookies.get("sv_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/app/:path*"] };
