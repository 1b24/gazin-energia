"use client";

/**
 * `<EntityPage />` — orquestrador de cada página de entidade.
 *
 * Recebe a entidade, dados pré-carregados (server component → client) e a
 * configuração de tabela/form/drawer. Decide se renderiza:
 *   1) o EmptyState (quando ENTITY_STATUS marca a entidade como "stub"); ou
 *   2) o toolbar + DataTable + drawer + dialog de criar/editar.
 *
 * As 11 entidades ATIVAS instanciam isso na Tarefa 4 com ~30-50 linhas cada.
 */
import { type ColumnDef } from "@tanstack/react-table";
import { Plus, Trash2, Undo2 } from "lucide-react";
import { useCallback, useState, useTransition, type ReactNode } from "react";
import type { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { isStub } from "@/lib/modules/status";
import {
  EntityForm,
  type FormFieldConfig,
} from "@/components/forms/entity-form";

import { DataTable } from "./data-table";
import { EntityEmptyState } from "./empty-state";
import { EntityDrawer, type EntityRelation } from "./entity-drawer";

export interface EntityPageActions {
  create?: (input: unknown) => Promise<{ id: string }>;
  update?: (id: string, input: unknown) => Promise<{ id: string }>;
  bulkDelete?: (ids: string[]) => Promise<{ count: number }>;
  bulkExport?: (
    ids: string[] | "all",
    format: "xlsx" | "csv" | "json",
  ) => Promise<{ buffer: ArrayBuffer | Uint8Array | string; filename: string; mimetype: string }>;
}

export interface EntityPageProps<T extends { id: string }, S extends z.ZodObject> {
  /** Nome legível ("Usinas", "Filiais"). */
  title: string;
  /** Nome do model Prisma — usado pra checar ENTITY_STATUS. */
  prismaModel: string;
  /** Nome canônico do JSON em `data/raw/`. Usado no EmptyState. */
  rawFileName: string;
  /** Schema Zod, alimenta o form de criar/editar. */
  schema?: S;
  fields?: FormFieldConfig[];
  /** Linhas a renderizar (vêm do server component caller). */
  rows: T[];
  columns: ColumnDef<T, unknown>[];
  /** Server actions geradas pelo `createCrudActions`. */
  actions?: EntityPageActions;
  /** Render-prop pro Drawer "Detalhes". */
  details?: (entity: T) => ReactNode;
  /** Aba "Relacionados" do Drawer. */
  relations?: EntityRelation<T>[];
}

export function EntityPage<T extends { id: string }, S extends z.ZodObject>(
  props: EntityPageProps<T, S>,
) {
  const {
    title,
    prismaModel,
    rawFileName,
    rows,
    columns,
    schema,
    fields,
    actions,
    details,
    relations,
  } = props;

  // ----- Stub gate -----
  if (isStub(prismaModel)) {
    return (
      <div className="flex flex-col gap-4">
        <Header title={title} count={null} stub />
        <EntityEmptyState fileName={rawFileName} />
      </div>
    );
  }

  return (
    <ActiveEntityPage
      title={title}
      rows={rows}
      columns={columns}
      schema={schema}
      fields={fields}
      actions={actions}
      details={details}
      relations={relations}
    />
  );
}

// ----------------------------------------------------------------------------
// Cliente (com hooks) — separado pra simplificar o branch Stub do Active.
// ----------------------------------------------------------------------------

interface ActiveProps<T extends { id: string }, S extends z.ZodObject> {
  title: string;
  rows: T[];
  columns: ColumnDef<T, unknown>[];
  schema?: S;
  fields?: FormFieldConfig[];
  actions?: EntityPageActions;
  details?: (entity: T) => ReactNode;
  relations?: EntityRelation<T>[];
}

function ActiveEntityPage<T extends { id: string; deletedAt?: Date | null }, S extends z.ZodObject>({
  title,
  rows,
  columns,
  schema,
  fields,
  actions,
  details,
  relations,
}: ActiveProps<T, S>) {
  const [showArchived, setShowArchived] = useState(false);
  const [drawerEntity, setDrawerEntity] = useState<T | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const visibleRows = rows.filter(
    (r) => showArchived || !(r as { deletedAt?: Date | null }).deletedAt,
  );

  const onBulkDelete = useCallback(() => {
    if (!actions?.bulkDelete || selectedIds.length === 0) return;
    if (!confirm(`Arquivar ${selectedIds.length} registro(s)?`)) return;
    startTransition(async () => {
      await actions.bulkDelete!(selectedIds);
      setSelectedIds([]);
      // Refresh do server component cabe ao caller via revalidatePath na action.
    });
  }, [actions, selectedIds]);

  const onExport = useCallback(
    (format: "xlsx" | "csv" | "json") => {
      if (!actions?.bulkExport) return;
      const target = selectedIds.length > 0 ? selectedIds : "all";
      startTransition(async () => {
        const payload = await actions.bulkExport!(target, format);
        downloadBlob(payload);
      });
    },
    [actions, selectedIds],
  );

  return (
    <div className="flex flex-col gap-4">
      <Header
        title={title}
        count={visibleRows.length}
        rightSlot={
          schema && fields && actions?.create ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              Novo
            </Button>
          ) : null
        }
      />

      <DataTable
        data={visibleRows}
        columns={columns}
        searchPlaceholder={`Buscar em ${title.toLowerCase()}...`}
        onRowClick={(row) => setDrawerEntity(row)}
        onSelectionChange={setSelectedIds}
        toolbarRight={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 text-sm">
              <Checkbox
                id="show-archived"
                checked={showArchived}
                onCheckedChange={(checked: boolean) => setShowArchived(checked)}
              />
              <Label htmlFor="show-archived" className="cursor-pointer">
                Mostrar arquivados
              </Label>
            </div>
            {actions?.bulkExport && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                  )}
                  disabled={pending}
                >
                  Exportar
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onExport("xlsx")}>
                    XLSX (.xlsx)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onExport("csv")}>
                    CSV (.csv)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onExport("json")}>
                    JSON (.json)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {selectedIds.length > 0 && actions?.bulkDelete && (
              <Button
                variant="outline"
                size="sm"
                onClick={onBulkDelete}
                disabled={pending}
              >
                {showArchived ? (
                  <Undo2 className="mr-1 h-4 w-4" />
                ) : (
                  <Trash2 className="mr-1 h-4 w-4" />
                )}
                Arquivar ({selectedIds.length})
              </Button>
            )}
          </div>
        }
      />

      {/* Drawer */}
      <EntityDrawer
        open={!!drawerEntity}
        onOpenChange={(open) => !open && setDrawerEntity(null)}
        entity={drawerEntity}
        title={title.replace(/s$/, "")}
        details={details ?? (() => <p className="text-sm text-muted-foreground">Sem renderer de detalhes configurado.</p>)}
        relations={relations}
      />

      {/* Create dialog */}
      {schema && fields && actions?.create && (
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Novo {title.replace(/s$/, "")}</DialogTitle>
            </DialogHeader>
            <EntityForm
              schema={schema}
              fields={fields}
              onSubmit={async (values) => {
                await actions.create!(values);
                setCreateOpen(false);
              }}
              onCancel={() => setCreateOpen(false)}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Header
// ----------------------------------------------------------------------------

function Header({
  title,
  count,
  rightSlot,
  stub,
}: {
  title: string;
  count: number | null;
  rightSlot?: ReactNode;
  stub?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {stub && <Badge variant="outline">stub</Badge>}
        {count != null && (
          <Badge variant="secondary">{count} registro{count === 1 ? "" : "s"}</Badge>
        )}
      </div>
      {rightSlot}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Download helper (client side blob trick).
// ----------------------------------------------------------------------------

function downloadBlob(payload: {
  buffer: ArrayBuffer | Uint8Array | string;
  filename: string;
  mimetype: string;
}) {
  const part: BlobPart =
    typeof payload.buffer === "string"
      ? payload.buffer
      : payload.buffer instanceof Uint8Array
        ? new Uint8Array(payload.buffer).buffer.slice(
            payload.buffer.byteOffset,
            payload.buffer.byteOffset + payload.buffer.byteLength,
          )
        : (payload.buffer as ArrayBuffer);
  const blob = new Blob([part], { type: payload.mimetype });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = payload.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
