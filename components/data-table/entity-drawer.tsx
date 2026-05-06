"use client";

/**
 * Drawer (Sheet) lateral pra detalhar / editar uma entidade.
 *
 * Três abas:
 *  - Detalhes:    read-only por padrão; troca pra `<EntityForm />` quando
 *                 `editing` está ativo (Opção A — toggle no header do drawer).
 *  - Relacionados: uma lista por relação configurada (ex: "Geração", "Vendas").
 *  - Histórico:    audit log da entidade — placeholder até a Tarefa 6 entregar.
 */
import { Pencil, X } from "lucide-react";
import { type ReactNode } from "react";
import type { z } from "zod";

import { EntityForm, type FormFieldConfig } from "@/components/forms/entity-form";
import { entityToFormDefaults } from "@/components/forms/defaults";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface EntityRelation<T> {
  /** Texto da aba (ex: "Geração", "Manutenções"). */
  label: string;
  /** Render-prop que recebe a entidade pai e devolve o conteúdo da aba. */
  render: (entity: T) => ReactNode;
}

export interface EntityDrawerProps<T, S extends z.ZodObject> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: T | null;
  title: string;
  /** Render-prop pra montar a aba "Detalhes" no modo read-only. */
  details: (entity: T) => ReactNode;
  relations?: EntityRelation<T>[];
  /** Modo edit ativo. Quando `true`, "Detalhes" mostra o form. */
  editing?: boolean;
  /** Callback do toggle Edit/Cancel no header. */
  onEditingChange?: (editing: boolean) => void;
  /**
   * Quando `editing`, o form é renderizado a partir de `schema` + `fields` +
   * `entity`. `onSave` é chamado com os valores parseados pelo Zod.
   */
  schema?: S;
  fields?: FormFieldConfig[];
  onSave?: (id: string, values: z.infer<S>) => Promise<void> | void;
}

export function EntityDrawer<T extends { id: string }, S extends z.ZodObject>({
  open,
  onOpenChange,
  entity,
  title,
  details,
  relations = [],
  editing = false,
  onEditingChange,
  schema,
  fields,
  onSave,
}: EntityDrawerProps<T, S>) {
  const canEdit = !!schema && !!fields && !!onSave && !!onEditingChange;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="flex flex-row items-center justify-between border-b px-6 py-4">
          <div className="flex flex-col gap-0.5">
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription className="sr-only">
              Detalhes da entidade
            </SheetDescription>
          </div>
          {canEdit && entity && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEditingChange!(!editing)}
            >
              {editing ? (
                <>
                  <X className="mr-1 h-4 w-4" />
                  Cancelar
                </>
              ) : (
                <>
                  <Pencil className="mr-1 h-4 w-4" />
                  Editar
                </>
              )}
            </Button>
          )}
        </SheetHeader>

        {entity ? (
          <Tabs
            defaultValue="detalhes"
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <TabsList className="mx-6 mt-3 h-9 self-start">
              <TabsTrigger value="detalhes">
                {editing ? "Editar" : "Detalhes"}
              </TabsTrigger>
              {!editing &&
                relations.map((r) => (
                  <TabsTrigger key={r.label} value={r.label}>
                    {r.label}
                  </TabsTrigger>
                ))}
              {!editing && (
                <TabsTrigger value="historico">Histórico</TabsTrigger>
              )}
            </TabsList>

            <ScrollArea className="min-h-0 flex-1">
              <TabsContent value="detalhes" className="px-6 py-4">
                {editing && schema && fields && onSave ? (
                  <EntityForm<S>
                    schema={schema}
                    fields={fields}
                    defaultValues={
                      entityToFormDefaults(
                        entity as unknown as Record<string, unknown>,
                        fields,
                      ) as never
                    }
                    submitLabel="Salvar alterações"
                    cancelLabel="Cancelar"
                    onCancel={() => onEditingChange?.(false)}
                    onSubmit={async (values) => {
                      await onSave(entity.id, values);
                      onEditingChange?.(false);
                    }}
                  />
                ) : (
                  details(entity)
                )}
              </TabsContent>

              {!editing &&
                relations.map((r) => (
                  <TabsContent
                    key={r.label}
                    value={r.label}
                    className="px-6 py-4"
                  >
                    {r.render(entity)}
                  </TabsContent>
                ))}

              {!editing && (
                <TabsContent value="historico" className="px-6 py-4">
                  <p className="text-sm text-muted-foreground">
                    Audit log será exibido aqui quando a Tarefa 6 (audit) for
                    implementada.
                  </p>
                </TabsContent>
              )}
            </ScrollArea>
          </Tabs>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Helper: renderiza um par campo→valor estilizado pra usar dentro de
 * `details`. Retorna nada se valor for null/undefined/"".
 */
export function DetailField({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  if (value == null || value === "") return null;
  return (
    <div className="grid grid-cols-3 gap-3 border-b py-2 last:border-b-0">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="col-span-2 text-sm">{value}</dd>
    </div>
  );
}
