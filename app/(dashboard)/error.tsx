"use client";

/**
 * Error boundary do grupo (dashboard) — captura exceções de qualquer page
 * server do dashboard (ex.: conexão PGLite reciclada que escapou do
 * `retryClosedConnection`) e oferece retry sem derrubar o shell/sidebar.
 *
 * `reset()` re-renderiza o segment; para erro transitório de socket, a
 * segunda tentativa quase sempre passa.
 */
import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log no console do browser — diagnóstico em dev; em produção o digest
    // permite correlacionar com o log do server.
    console.error("[dashboard:error-boundary]", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <div>
            <p className="text-base font-semibold">
              Não foi possível carregar esta página
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Geralmente é uma falha transitória de conexão com o banco.
              Tentar novamente costuma resolver.
            </p>
            {error.digest && (
              <p className="mt-2 font-mono text-xs text-muted-foreground">
                digest: {error.digest}
              </p>
            )}
          </div>
          <Button onClick={() => reset()} className="mt-1">
            <RotateCcw className="mr-2 h-4 w-4" /> Tentar novamente
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
