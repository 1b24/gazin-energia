"use client";

/**
 * Modal de importação Excel para Consumos.
 *
 * Espelha `app/(dashboard)/filiais/import-dialog.tsx` com 3 diferenças:
 *  - Aviso de volume (Consumo costuma ter milhares de linhas).
 *  - Aviso explícito sobre a coluna "Filial Código" como referência humana.
 *  - Mensagem específica sobre duplicata lógica (Filial + Ano + Mês).
 *
 * Quando 3 entidades estiverem usando o mesmo padrão, vale abstrair pra um
 * componente genérico (`<EntityImportDialog action={...} entityLabel={...}>`).
 * Por ora mantemos cópia consciente — sample size 2 ainda não justifica.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { importConsumo, type ImportConsumoResult } from "./actions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConsumoImportDialog({ open, onOpenChange }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportConsumoResult | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function reset() {
    setFile(null);
    setResult(null);
  }

  function handleClose(open: boolean) {
    if (!open) {
      reset();
      if (result?.ok) router.refresh();
    }
    onOpenChange(open);
  }

  async function handleApply() {
    if (!file) return;
    const buffer = await file.arrayBuffer();
    startTransition(async () => {
      const r = await importConsumo(buffer);
      setResult(r);
    });
  }

  // Agrupa erros por linha pra UX legível.
  type Errs = ImportConsumoResult["errors"];
  const errorsByRow = (result?.errors ?? []).reduce<Record<number, Errs>>(
    (acc, err) => {
      const key = err.row;
      if (!acc[key]) acc[key] = [];
      acc[key].push(err);
      return acc;
    },
    {},
  );
  const errorRows = Object.keys(errorsByRow)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar planilha Excel — Consumo</DialogTitle>
        </DialogHeader>

        {/* Estado inicial — escolher arquivo */}
        {!result && (
          <div className="flex flex-col gap-4">
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Use o modelo exportado pelo sistema. Linhas com a coluna{" "}
                <strong>ID</strong> preenchida serão atualizadas; sem ID serão
                criadas. Em caso de qualquer erro, nada é salvo.
              </p>
              <p>
                <strong>Filial</strong>: para criar novos registros, preencha{" "}
                <strong>&quot;Filial Código&quot;</strong> — o sistema resolve
                pro ID interno automaticamente.
              </p>
              <p>
                <strong>Duplicata</strong>: combinação <em>Filial + Ano + Mês</em>{" "}
                não pode repetir (use o ID pra atualizar registro existente).
              </p>
              <p className="text-xs">
                Limite: 5000 linhas por importação. Acima disso, quebre por ano
                ou por filial.
              </p>
            </div>
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
            {file && (
              <p className="text-xs text-muted-foreground">
                Arquivo selecionado: <strong>{file.name}</strong>
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => handleClose(false)}
                disabled={pending}
              >
                Cancelar
              </Button>
              <Button onClick={handleApply} disabled={!file || pending}>
                {pending ? "Importando..." : "Aplicar"}
              </Button>
            </div>
          </div>
        )}

        {/* Resultado de sucesso */}
        {result?.ok && (
          <div className="flex flex-col gap-4">
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/20">
              <p className="font-medium text-emerald-900 dark:text-emerald-200">
                Importação concluída.
              </p>
              <ul className="mt-2 text-emerald-800 dark:text-emerald-300">
                <li>{result.created} registro(s) criado(s)</li>
                <li>{result.updated} registro(s) atualizado(s)</li>
                <li>{result.total} linha(s) processada(s)</li>
              </ul>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => handleClose(false)}>Fechar</Button>
            </div>
          </div>
        )}

        {/* Resultado de erro */}
        {result && !result.ok && (
          <div className="flex flex-col gap-4">
            <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm dark:border-rose-900 dark:bg-rose-950/20">
              <p className="font-medium text-rose-900 dark:text-rose-200">
                Importação cancelada — {result.errors.length} erro(s)
                encontrado(s). Nenhum registro foi salvo.
              </p>
            </div>

            <div className="max-h-96 overflow-y-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Linha</th>
                    <th className="px-3 py-2 text-left">Campo</th>
                    <th className="px-3 py-2 text-left">Valor recebido</th>
                    <th className="px-3 py-2 text-left">Problema</th>
                    <th className="px-3 py-2 text-left">Esperado</th>
                  </tr>
                </thead>
                <tbody>
                  {errorRows.map((rowNum) =>
                    errorsByRow[rowNum].map((err, i) => (
                      <tr
                        key={`${rowNum}-${i}`}
                        className="border-t hover:bg-muted/30"
                      >
                        <td className="px-3 py-2 font-mono">
                          {rowNum === 0
                            ? "—"
                            : rowNum === 1
                              ? "header"
                              : rowNum}
                        </td>
                        <td className="px-3 py-2">{err.field ?? "—"}</td>
                        <td className="px-3 py-2 font-mono text-muted-foreground">
                          {err.value != null ? String(err.value) : "—"}
                        </td>
                        <td className="px-3 py-2">{err.message}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {err.expected ?? "—"}
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => handleClose(false)}>
                Fechar
              </Button>
              <Button
                onClick={() => {
                  reset();
                }}
              >
                Tentar outra planilha
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
