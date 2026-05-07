"use server";

import { AuthError } from "next-auth";

import { signIn } from "@/lib/auth";

export async function signInAction(
  formData: FormData,
): Promise<{ error?: string } | void> {
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
