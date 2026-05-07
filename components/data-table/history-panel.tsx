"use client";

/**
 * Aba "Histórico" do drawer — fetch lazy do audit log via server action,
 * exibido como timeline com diff legível campo a campo.
 */
import {
  CircleAlert,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import type { AuditAction } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import {
  fetchAuditLogs,
  type AuditLogClientView,
} from "./history-actions";

const ACTION_LABEL: Record<AuditAction, string> = {
  create: "Criou",
  update: "Editou",
  soft_delete: "Arquivou",
  restore: "Restaurou",
  hard_delete: "Excluiu (definitivo)",
};

function actionIcon(a: AuditAction): ReactNode {
  switch (a) {
    case "create":
      return <Plus className="h-3.5 w-3.5" />;
    case "update":
      return <Pencil className="h-3.5 w-3.5" />;
    case "soft_delete":
      return <Trash2 className="h-3.5 w-3.5" />;
    case "restore":
      return <RotateCcw className="h-3.5 w-3.5" />;
    case "hard_delete":
      return <CircleAlert className="h-3.5 w-3.5" />;
  }
}

function actionVariant(
  a: AuditAction,
): "default" | "secondary" | "destructive" | "outline" {
  if (a === "create") return "default";
  if (a === "soft_delete" || a === "hard_delete") return "destructive";
  if (a === "restore") return "secondary";
  return "outline";
}

function fmtTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
    return String(v);
  // Compact JSON pra objetos/arrays.
  return JSON.stringify(v);
}

/** Diff campo a campo entre before e after — só campos que mudaram. */
interface FieldChange {
  key: string;
  before: unknown;
  after: unknown;
}
function diffFields(before: unknown, after: unknown): FieldChange[] {
  if (before == null && after == null) return [];
  const a = (before ?? {}) as Record<string, unknown>;
  const b = (after ?? {}) as Record<string, unknown>;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: FieldChange[] = [];
  for (const k of keys) {
    if (k === "updatedAt" || k === "createdAt") continue; // ruído
    const va = a[k];
    const vb = b[k];
    if (JSON.stringify(va) === JSON.stringify(vb)) continue;
    out.push({ key: k, before: va, after: vb });
  }
  return out.sort((x, y) => x.key.localeCompare(y.key));
}

export function HistoryPanel({
  prismaModel,
  entityId,
}: {
  prismaModel: string;
  entityId: string;
}) {
  const [logs, setLogs] = useState<AuditLogClientView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // HistoryPanel é montado via `key={entity.id}` no drawer — sempre que muda
  // a entidade ele remonta. Por isso o fetch acontece uma única vez na
  // montagem, sem precisar reagir a mudança de prop em runtime.
  useEffect(() => {
    let cancelled = false;
    startTransition(async () => {
      try {
        const data = await fetchAuditLogs(prismaModel, entityId);
        if (!cancelled) setLogs(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Erro ao carregar.");
        }
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (pending && !logs) {
    return (
      <p className="text-sm text-muted-foreground">Carregando histórico...</p>
    );
  }
  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }
  if (!logs || logs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Sem alterações registradas para este registro.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-3">
      {logs.map((log) => {
        const changes =
          log.action === "update" ? diffFields(log.before, log.after) : [];
        return (
          <li key={log.id} className="rounded-md border bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <Badge
                  variant={actionVariant(log.action)}
                  className="gap-1"
                >
                  {actionIcon(log.action)}
                  {ACTION_LABEL[log.action]}
                </Badge>
                <span className="text-muted-foreground">por</span>
                <span className="font-medium">
                  {log.user.name || log.user.email}
                </span>
              </div>
              <span
                className="text-muted-foreground"
                title={new Date(log.createdAt).toISOString()}
              >
                {fmtTimestamp(log.createdAt)}
              </span>
            </div>

            {log.action === "update" && (
              <ul className="mt-2 flex flex-col gap-1 text-xs">
                {changes.length === 0 ? (
                  <li className="italic text-muted-foreground">
                    (Sem campos relevantes alterados.)
                  </li>
                ) : (
                  changes.map((c) => (
                    <li key={c.key} className="grid grid-cols-[8rem_1fr] gap-2">
                      <span className="font-mono text-muted-foreground">
                        {c.key}
                      </span>
                      <span>
                        <span className="text-muted-foreground line-through">
                          {formatValue(c.before)}
                        </span>{" "}
                        →{" "}
                        <span className="text-foreground">
                          {formatValue(c.after)}
                        </span>
                      </span>
                    </li>
                  ))
                )}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
