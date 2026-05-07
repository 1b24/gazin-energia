"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { signInAction } from "./actions";

export function LoginForm({
  callbackUrl,
  initialError,
}: {
  callbackUrl: string;
  initialError?: string;
}) {
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const fd = new FormData(e.currentTarget);
        fd.set("callbackUrl", callbackUrl);
        startTransition(async () => {
          const res = await signInAction(fd);
          if (res?.error) setError(res.error);
        });
      }}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Senha</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {error && (
        <p className="text-sm text-destructive">
          {error === "CredentialsSignin"
            ? "E-mail ou senha inválidos."
            : error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}
