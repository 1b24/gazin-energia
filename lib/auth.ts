/**
 * NextAuth v5 — config completo (Node runtime). Compõe `authConfig` (Edge-safe)
 * + Credentials provider que toca o Prisma e o bcrypt.
 */
import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { Role } from "@prisma/client";

import { authConfig } from "@/lib/auth.config";
import { prisma } from "@/lib/db";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "Credenciais",
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(creds) {
        const parsed = credentialsSchema.safeParse(creds);
        if (!parsed.success) return null;

        const user = await prisma.user.findFirst({
          where: { email: parsed.data.email, deletedAt: null },
        });
        if (!user) return null;

        const ok = await bcrypt.compare(parsed.data.password, user.password);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          filialId: user.filialId,
        };
      },
    }),
  ],
});

// ---- Type augmentation ----
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      filialId: string | null;
    } & DefaultSession["user"];
  }
  interface User {
    role: Role;
    filialId: string | null;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
    filialId?: string | null;
  }
}
