import { redirect } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";

import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await auth();
  const sp = await searchParams;
  const callbackUrl = sp.callbackUrl ?? "/";

  if (session?.user) {
    redirect(callbackUrl);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/20 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Gazin Energia</CardTitle>
          <p className="text-sm text-muted-foreground">
            Entre com seu e-mail e senha.
          </p>
        </CardHeader>
        <CardContent>
          <LoginForm callbackUrl={callbackUrl} initialError={sp.error} />
        </CardContent>
      </Card>
    </main>
  );
}
