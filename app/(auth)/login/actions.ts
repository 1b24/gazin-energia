"use server";

import { headers } from "next/headers";
import { AuthError } from "next-auth";

import { signIn } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

export async function signInAction(
  formData: FormData,
): Promise<{ error?: string } | void> {
  // Rate limit por IP: 5 tentativas / minuto. Identificador = X-Forwarded-For
  // (proxy) ou X-Real-IP (Vercel/nginx) — fallback "unknown" não bloqueia
  // logins legítimos mas mantém o teto.
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0].trim() ??
    h.get("x-real-ip") ??
    "unknown";
  const rate = await checkRateLimit(`login:${ip}`, 5, "1 m");
  if (!rate.success) {
    const seconds = Math.max(1, Math.ceil((rate.reset - Date.now()) / 1000));
    return {
      error: `Muitas tentativas de login. Tente novamente em ${seconds}s.`,
    };
  }

  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: String(formData.get("callbackUrl") ?? "/"),
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: err.type };
    }
    // NextAuth lança um redirect quando login dá certo — propagar.
    throw err;
  }
}

export async function signOutAction() {
  const { signOut } = await import("@/lib/auth");
  await signOut({ redirectTo: "/login" });
}
