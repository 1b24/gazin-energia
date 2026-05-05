"use client";

/**
 * Drawer (Sheet) lateral pra detalhar uma entidade.
 *
 * Três abas:
 *  - Detalhes:    todos os campos formatados.
 *  - Relacionados: uma lista por relação configurada (ex: "Geração", "Vendas").
 *  - Histórico:    audit log da entidade — placeholder até a Tarefa 6 entregar.
 */
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type ReactNode } from "react";

export interface EntityRelation<T> {
  /** Texto da aba (ex: "Geração", "Manutenções"). */
  label: string;
  /** Render-prop que recebe a entidade pai e devolve o conteúdo da aba. */
  render: (entity: T) => ReactNode;
}

export interface EntityDrawerProps<T> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: T | null;
  title: string;
  /** Render-prop pra montar a aba "Detalhes". Recebe a entidade. */
  details: (entity: T) => ReactNode;
  relations?: EntityRelation<T>[];
}

export function EntityDrawer<T>({
  open,
  onOpenChange,
  entity,
  title,
  details,
  relations = [],
}: EntityDrawerProps<T>) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription className="sr-only">Detalhes da entidade</SheetDescription>
        </SheetHeader>

        {entity ? (
          <Tabs defaultValue="detalhes" className="flex flex-1 flex-col">
            <TabsList className="mx-6 mt-3 h-9 self-start">
              <TabsTrigger value="detalhes">Detalhes</TabsTrigger>
              {relations.map((r) => (
                <TabsTrigger key={r.label} value={r.label}>
                  {r.label}
                </TabsTrigger>
              ))}
              <TabsTrigger value="historico">Histórico</TabsTrigger>
            </TabsList>

            <ScrollArea className="flex-1">
              <TabsContent value="detalhes" className="px-6 py-4">
                {details(entity)}
              </TabsContent>

              {relations.map((r) => (
                <TabsContent key={r.label} value={r.label} className="px-6 py-4">
                  {r.render(entity)}
                </TabsContent>
              ))}

              <TabsContent value="historico" className="px-6 py-4">
                <p className="text-sm text-muted-foreground">
                  Audit log será exibido aqui quando a Tarefa 6 (audit) for
                  implementada.
                </p>
              </TabsContent>
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
