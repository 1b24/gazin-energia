"use client";

/**
 * Tabela genérica TanStack Table v8.
 *
 * Recursos atuais:
 *  - Sorting (multi-coluna via Shift+click)
 *  - Global filter (busca cross-column)
 *  - Visibilidade de coluna (toggle por coluna)
 *  - Paginação cliente
 *  - Seleção múltipla de linhas
 *  - Click numa linha emite `onRowClick` (usado pra abrir drawer)
 *
 * Não-funcional ainda (vão entrar em iterações futuras quando o volume pedir):
 *  virtualização, column pinning, column resize, server-side pagination,
 *  persistência de prefs em localStorage.
 */
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  Settings2,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  /** Mostra um campo de busca global no toolbar. */
  searchable?: boolean;
  /** Placeholder do campo de busca. */
  searchPlaceholder?: string;
  /** Nó renderizado no canto direito do toolbar (bulk actions, exportar etc). */
  toolbarRight?: ReactNode;
  /** Click numa linha. Em geral usado pra abrir o drawer da entidade. */
  onRowClick?: (row: T) => void;
  /** Double-click numa linha. Em geral usado pra abrir o drawer já em modo edit. */
  onRowDoubleClick?: (row: T) => void;
  /** Inicial — quantas linhas por página (default 50). */
  initialPageSize?: number;
  /** Habilita coluna de checkbox de seleção (default `true`). */
  selectable?: boolean;
  /** Notificado quando a seleção muda — recebe lista de IDs (chave `id`). */
  onSelectionChange?: (selectedIds: string[]) => void;
  /**
   * Visibilidade inicial por coluna — `{ "valor1": false }` esconde a
   * coluna `valor1` no carregamento; usuário pode reabrir via "Colunas".
   */
  initialColumnVisibility?: VisibilityState;
}

export function DataTable<T extends { id?: string }>({
  data,
  columns,
  searchable = true,
  searchPlaceholder = "Buscar...",
  toolbarRight,
  onRowClick,
  onRowDoubleClick,
  initialPageSize = 50,
  selectable = true,
  onSelectionChange,
  initialColumnVisibility,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    initialColumnVisibility ?? {},
  );
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pageSize, setPageSize] = useState(initialPageSize);

  const allColumns: ColumnDef<T, unknown>[] = selectable
    ? [
        {
          id: "_select",
          enableSorting: false,
          enableHiding: false,
          enableResizing: false,
          size: 36,
          minSize: 36,
          maxSize: 36,
          header: ({ table }) => (
            <div onClick={(e) => e.stopPropagation()} className="flex">
              <Checkbox
                checked={table.getIsAllPageRowsSelected()}
                indeterminate={
                  table.getIsSomePageRowsSelected() &&
                  !table.getIsAllPageRowsSelected()
                }
                onCheckedChange={(checked: boolean) =>
                  table.toggleAllPageRowsSelected(checked)
                }
                aria-label="Selecionar todas"
              />
            </div>
          ),
          cell: ({ row }) => (
            <div onClick={(e) => e.stopPropagation()} className="flex">
              <Checkbox
                checked={row.getIsSelected()}
                onCheckedChange={(checked: boolean) =>
                  row.toggleSelected(checked)
                }
                aria-label="Selecionar linha"
              />
            </div>
          ),
        },
        ...columns,
      ]
    : columns;

  const table = useReactTable({
    data,
    columns: allColumns,
    state: { sorting, globalFilter, columnVisibility, rowSelection },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: (updater) => {
      const next =
        typeof updater === "function" ? updater(rowSelection) : updater;
      setRowSelection(next);
      if (onSelectionChange) {
        const ids = Object.keys(next)
          .filter((k) => next[k])
          .map((k) => {
            const row = data[Number(k)];
            return row?.id;
          })
          .filter((id): id is string => !!id);
        onSelectionChange(ids);
      }
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    enableMultiSort: true,
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    defaultColumn: { size: 180, minSize: 60, maxSize: 800 },
    initialState: { pagination: { pageSize } },
  });

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        {searchable && (
          <Input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder={searchPlaceholder}
            className="max-w-sm"
          />
        )}
        <div className="flex-1" />
        {toolbarRight}
        <ColumnsMenu table={table} />
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-md border">
        <Table style={{ width: table.getTotalSize() }}>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => {
                  const sort = h.column.getIsSorted();
                  const canSort = h.column.getCanSort();
                  const canResize = h.column.getCanResize();
                  const isResizing = h.column.getIsResizing();
                  return (
                    <TableHead
                      key={h.id}
                      onClick={canSort ? h.column.getToggleSortingHandler() : undefined}
                      style={{ width: h.getSize() }}
                      className={cn(
                        "relative whitespace-nowrap",
                        canSort && "cursor-pointer select-none",
                      )}
                    >
                      <div className="flex items-center gap-1 pr-3">
                        {h.isPlaceholder
                          ? null
                          : flexRender(h.column.columnDef.header, h.getContext())}
                        {canSort && (
                          <SortIcon
                            dir={sort === "asc" ? "asc" : sort === "desc" ? "desc" : "none"}
                          />
                        )}
                      </div>
                      {canResize && (
                        <div
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            h.getResizeHandler()(e);
                          }}
                          onTouchStart={(e) => {
                            e.stopPropagation();
                            h.getResizeHandler()(e);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className={cn(
                            "absolute top-0 right-0 z-10 h-full w-1.5 cursor-col-resize touch-none select-none",
                            "bg-transparent transition-colors",
                            "hover:bg-primary/40",
                            isResizing && "bg-primary",
                          )}
                          aria-hidden
                        />
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className={cn(
                    (onRowClick || onRowDoubleClick) && "cursor-pointer",
                  )}
                  onClick={
                    onRowClick ? () => onRowClick(row.original) : undefined
                  }
                  onDoubleClick={
                    onRowDoubleClick
                      ? () => onRowDoubleClick(row.original)
                      : undefined
                  }
                >
                  {row.getVisibleCells().map((cell) => {
                    const isSelectCell = cell.column.id === "_select";
                    return (
                      <TableCell
                        key={cell.id}
                        style={{ width: cell.column.getSize() }}
                        className="overflow-hidden truncate whitespace-nowrap"
                        onClick={
                          isSelectCell ? (e) => e.stopPropagation() : undefined
                        }
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={allColumns.length}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  Nenhum resultado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm">
        <div className="text-muted-foreground">
          {table.getFilteredSelectedRowModel().rows.length > 0
            ? `${table.getFilteredSelectedRowModel().rows.length} de ${table.getFilteredRowModel().rows.length} selecionada(s)`
            : `${table.getFilteredRowModel().rows.length} registro(s)`}
        </div>
        <div className="flex items-center gap-2">
          <select
            className="rounded-md border bg-background px-2 py-1 text-sm"
            value={pageSize}
            onChange={(e) => {
              const n = Number(e.target.value);
              setPageSize(n);
              table.setPageSize(n);
            }}
          >
            {[25, 50, 100, 200].map((n) => (
              <option key={n} value={n}>
                {n} / página
              </option>
            ))}
          </select>
          <div className="text-muted-foreground">
            Página {table.getState().pagination.pageIndex + 1} de{" "}
            {table.getPageCount() || 1}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="Anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Próxima"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function SortIcon({ dir }: { dir: "asc" | "desc" | "none" }) {
  if (dir === "asc") return <ChevronUp className="h-3.5 w-3.5" />;
  if (dir === "desc") return <ChevronDown className="h-3.5 w-3.5" />;
  return <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />;
}

function ColumnsMenu<T>({ table }: { table: ReturnType<typeof useReactTable<T>> }) {
  const hideable = table
    .getAllLeafColumns()
    .filter((c) => c.getCanHide() && c.id !== "_select");

  if (hideable.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
      >
        <Settings2 className="mr-1 h-4 w-4" />
        Colunas
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Mostrar colunas</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {hideable.map((c) => (
            <DropdownMenuCheckboxItem
              key={c.id}
              checked={c.getIsVisible()}
              onCheckedChange={(v) => c.toggleVisibility(!!v)}
            >
              {String(c.columnDef.header ?? c.id)}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
