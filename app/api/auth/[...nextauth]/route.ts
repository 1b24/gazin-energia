/**
 * Catch-all do NextAuth v5 — re-exporta os handlers do `lib/auth.ts`.
 */
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;

// Node runtime — bcrypt + Prisma não rodam em Edge.
export const runtime = "nodejs";
