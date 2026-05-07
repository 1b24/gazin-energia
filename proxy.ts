/**
 * Proxy Edge — proteção por rota baseada no registry.
 *
 * Next 16 renomeou `middleware.ts` → `proxy.ts`. Mesma API.
 * Roda em Edge runtime, então monta um NextAuth APENAS com o `authConfig`
 * Edge-safe (sem providers Credentials, sem Prisma, sem bcrypt). O JWT
 * existente continua sendo decodificado pelo mesmo NEXTAUTH_SECRET.
 */
import NextAuth from "next-auth";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";

import { authConfig } from "@/lib/auth.config";
import { canAccess } from "@/lib/modules/permissions";

const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = ["/login", "/api/auth"];

function isPublic(path: string): boolean {
  if (path === "/") return false; // home exige login
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

export default auth(async (req) => {
  const { nextUrl } = req as unknown as { nextUrl: NextRequest["nextUrl"] };
  const path = nextUrl.pathname;

  if (isPublic(path)) return NextResponse.next();

  const session = (
    req as unknown as { auth: { user?: { role?: Role } } | null }
  ).auth;

  if (!session?.user) {
    const url = new URL("/login", nextUrl);
    url.searchParams.set("callbackUrl", path);
    return NextResponse.redirect(url);
  }

  const role = session.user.role;
  if (!canAccess(role, path, "view")) {
    return NextResponse.redirect(new URL("/", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|uploads|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
