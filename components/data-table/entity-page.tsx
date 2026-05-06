"use client";

/**
 * `<EntityPage />` — orquestrador de cada página de entidade.
 *
 * Renderiza:
 *   1) EmptyState quando ENTITY_STATUS marca a entidade como "stub"; OU
 *   2) toolbar + DataTable + drawer + dialogs (criar e editar).
 *
 * Três fluxos pra editar um registro existente (todos chegam ao mesmo
 * `actions.update`):
 *   A) Botão "Editar" no header do drawer — alterna a aba "Detalhes" entre
 *      read-only e form.
 *   B) Botão lápis na última coluna da tabela — abre dialog dedicado.
 *   C) Double-click numa linha — abre drawer já em modo edit.
 *
 * As páginas de entidade (Tarefa 4) instanciam isso com ~30-50 linhas cada.
 */
import {
  type ColumnDef,
  type VisibilityState,
} from "@tanstack/react-table";
import { Pencil, Plus, Trash2, Undo2 } from "lucide-react";
import { useCallback, useMemo, useState, useTransition, type ReactNode } from "react";
import type { z } from "zod";

import { entityToFormDefaults } from "@/components/forms/defaults";
import {
  EntityForm,
  type FormFieldConfig,
} from "@/components/forms/entity-form";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { isStub } from "@/lib/modules/status";
import { cn } from "@/lib/utils";

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
  ) => Promise<{
    buffer: ArrayBuffer | Uint8Array | string;
    filename: string;
    mimetype: string;
  }>;
}

export interface EntityPageProps<
  T extends { id: string },
  S extends z.ZodObject,
> {
  title: string;
  prismaModel: string;
  rawFileName: string;
  schema?: S;
  fields?: FormFieldConfig[];
  rows: T[];
  columns: ColumnDef<T, unknown>[];
  actions?: EntityPageActions;
  details?: (entity: T) => ReactNode;
  relations?: EntityRelation<T>[];
  /** Visibilidade inicial por coluna; usuário pode toggleá-las em "Colunas". */
  initialColumnVisibility?: VisibilityState;
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
    initialColumnVisibility,
  } = props;

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
      initialColumnVisibility={initialColumnVisibility}
    />
  );
}

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
  initialColumnVisibility?: VisibilityState;
}

function ActiveEntityPage<
  T extends { id: string; deletedAt?: Date | null },
  S extends z.ZodObject,
>({
  title,
  rows,
  columns,
  schema,
  fields,
  actions,
  details,
  relations,
  initialColumnVisibility,
}: ActiveProps<T, S>) {
  const [showArchived, setShowArchived] = useState(false);
  const [drawerEntity, setDrawerEntity] = useState<T | null>(null);
  const [drawerEditing, setDrawerEditing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editDialogEntity, setEditDialogEntity] = useState<T | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const canEdit = !!schema && !!fields && !!actions?.update;

  const visibleRows = rows.filter(
    (r) => showArchived || !(r as { deletedAt?: Date | null }).deletedAt,
  );

  // (B) Coluna de lápis — anexada se houver capacidade de edição.
  const augmentedColumns = useMemo<ColumnDef<T, unknown>[]>(() => {
    if (!canEdit) return columns;
    const editColumn: ColumnDef<T, unknown> = {
      id: "_edit",
      header: "",
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setEditDialogEntity(row.original);
          }}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Editar"
          title="Editar"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      ),
    };
    return [...columns, editColumn];
  }, [columns, canEdit]);

  // ---------- Bulk handlers ----------
  const onBulkDelete = useCallback(() => {
    if (!actions?.bulkDelete || selectedIds.length === 0) return;
    if (!confirm(`Arquivar ${selectedIds.length} registro(s)?`)) return;
    startTransition(async () => {
      await actions.bulkDelete!(selectedIds);
      setSelectedIds([]);
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

  // ---------- Update handler — usado por A, B, C ----------
  const onUpdate = useCallback(
    async (id: string, values: unknown) => {
      if (!actions?.update) return;
      await actions.update(id, values);
    },
    [actions],
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
        columns={augmentedColumns}
        initialColumnVisibility={initialColumnVisibility}
        searchPlaceholder={`Buscar em ${title.toLowerCase()}...`}
        onRowClick={(row) => {
          setDrawerEntity(row);
          setDrawerEditing(false);
        }}
        // (C) Double-click → drawer em modo edit
        onRowDoubleClick={
          canEdit
            ? (row) => {
                setDrawerEntity(row);
                setDrawerEditing(true);
              }
            : undefined
        }
        onSelectionChange={setSelectedIds}
        toolbarRight={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 text-sm">
              <Checkbox
                id="show-archived"
                checked={showArchived}
                onCheckedChange={(checked: boolean) =>
                  setShowArchived(checked)
                }
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

      {/* (A) Drawer com toggle Edit no header */}
      <EntityDrawer<T, S>
        open={!!drawerEntity}
        onOpenChange={(open) => {
          if (!open) {
            setDrawerEntity(null);
            setDrawerEditing(false);
          }
        }}
        entity={drawerEntity}
        title={title.replace(/s$/, "")}
        details={
          details ??
          (() => (
            <p className="text-sm text-muted-foreground">
              Sem renderer de detalhes configurado.
            </p>
          ))
        }
        relations={relations}
        editing={drawerEditing}
        onEditingChange={canEdit ? setDrawerEditing : undefined}
        schema={canEdit ? schema : undefined}
        fields={canEdit ? fields : undefined}
        onSave={canEdit ? onUpdate : undefined}
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

      {/* (B) Edit dialog — disparado pelo lápis na coluna */}
      {canEdit && (
        <Dialog
          open={!!editDialogEntity}
          onOpenChange={(open) => !open && setEditDialogEntity(null)}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Editar {title.replace(/s$/, "")}</DialogTitle>
            </DialogHeader>
            {editDialogEntity && (
              <EntityForm
                schema={schema!}
                fields={fields!}
                defaultValues={
                  entityToFormDefaults(
                    editDialogEntity as unknown as Record<string, unknown>,
                    fields!,
                  ) as never
                }
                submitLabel="Salvar alterações"
                cancelLabel="Cancelar"
                onCancel={() => setEditDialogEntity(null)}
                onSubmit={async (values) => {
                  await onUpdate(editDialogEntity.id, values);
                  setEditDialogEntity(null);
                }}
              />
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

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
          <Badge variant="secondary">
            {count} registro{count === 1 ? "" : "s"}
          </Badge>
        )}
      </div>
      {rightSlot}
    </div>
  );
}

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
