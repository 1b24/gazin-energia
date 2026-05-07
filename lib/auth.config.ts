/**
 * Config Edge-safe do NextAuth — SEM imports de Prisma / bcrypt / DB.
 *
 * Usado pelo middleware (que roda em Edge runtime, sem suporte a Node APIs)
 * e re-usado pelo `lib/auth.ts` (Node) que adiciona o provider Credentials.
 */
import type { NextAuthConfig } from "next-auth";
import type { Role } from "@prisma/client";

export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [], // Credentials adicionado em lib/auth.ts (Node).
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role: Role }).role;
        token.filialId = (user as { filialId: string | null }).filialId ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        const u = session.user as {
          id?: string;
          role?: Role;
          filialId?: string | null;
        };
        u.id = token.id as string;
        u.role = token.role as Role;
        u.filialId = (token.filialId as string | null) ?? null;
      }
      return session;
    },
  },
};
