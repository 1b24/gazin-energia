"use server";

/**
 * Server action que o `<HistoryPanel />` (client) chama pra carregar audit log
 * de uma entidade. RBAC + sanitização ficam em `lib/audit.ts`.
 */
import type { AuditAction } from "@prisma/client";

import { loadAuditLogs } from "@/lib/audit";

export interface AuditLogClientView {
  id: string;
  action: AuditAction;
  createdAt: string;
  user: { id: string; name: string; email: string };
  before: unknown;
  after: unknown;
}

export async function fetchAuditLogs(
  prismaModel: string,
  entityId: string,
): Promise<AuditLogClientView[]> {
  const rows = await loadAuditLogs(prismaModel, entityId);
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    createdAt: r.createdAt,
    user: r.user,
    before: r.before,
    after: r.after,
  }));
}
