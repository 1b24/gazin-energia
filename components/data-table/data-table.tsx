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
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  type Row,
  type RowSelectionState,
  type SortingState,
  type Table,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  ListFilter,
  Settings2,
} from "lucide-react";
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
  type TouchEvent,
} from "react";

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
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const NO_COLUMN_VALUES_SELECTED = "__data_table_no_column_values_selected__";

/**
 * Global filter que inspeciona o `row.original` recursivamente — necessário
 * porque várias colunas usam apenas `id` + `cell` (sem `accessorKey`), e o
 * filtro padrão do tanstack só lê valores via accessor. Sem isto, buscar
 * "GR ENERGY" não acha registros cujo nome vem de `fornecedor.nome`.
 */
function flattenForSearch(value: unknown, out: string[], depth = 0): void {
  if (value == null || depth > 4) return;
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    out.push(String(value));
    return;
  }
  if (value instanceof Date) {
    out.push(value.toISOString());
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) flattenForSearch(v, out, depth + 1);
    return;
  }
  if (typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      flattenForSearch(v, out, depth + 1);
    }
  }
}

const deepIncludesFilter: FilterFn<unknown> = (
  row: Row<unknown>,
  _columnId,
  rawFilter,
) => {
  const term = String(rawFilter ?? "")
    .trim()
    .toLowerCase();
  if (!term) return true;
  const parts: string[] = [];
  flattenForSearch(row.original, parts);
  return parts.join(" ").toLowerCase().includes(term);
};

function getColumnSourceValue<T>(row: Row<T>, columnId: string): unknown {
  const value = row.getValue(columnId);
  if (value != null && value !== "") return value;

  const original = row.original;
  if (original && typeof original === "object" && columnId in original) {
    return (original as Record<string, unknown>)[columnId];
  }

  return value;
}

function columnValueText(value: unknown): string {
  const parts: string[] = [];
  flattenForSearch(value, parts);
  return parts.join(" ").trim();
}

function getColumnFilterKey<T>(row: Row<T>, columnId: string): string {
  const text = columnValueText(getColumnSourceValue(row, columnId));
  return text || "__empty__";
}

function formatColumnFilterLabel(value: unknown): string {
  if (value == null || value === "") return "Vazio";
  if (value instanceof Date) return value.toLocaleDateString("pt-BR");
  if (typeof value === "number") return value.toLocaleString("pt-BR");
  if (typeof value === "string" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    const text = value.map(formatColumnFilterLabel).join(", ");
    return text || "Vazio";
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["nome", "name", "label", "codigo", "razaoSocial"]) {
      const candidate = record[key];
      if (typeof candidate === "string" && candidate.trim()) return candidate;
      if (typeof candidate === "number")
        return candidate.toLocaleString("pt-BR");
    }

    const text = columnValueText(value);
    return text || "Vazio";
  }
  return String(value);
}

const columnIncludesFilter: FilterFn<unknown> = (
  row: Row<unknown>,
  columnId,
  rawFilter,
) => {
  if (Array.isArray(rawFilter)) {
    const selected = rawFilter.map(String).filter(Boolean);
    if (selected.length === 0) return true;
    return selected.includes(getColumnFilterKey(row, columnId));
  }

  const term = String(rawFilter ?? "")
    .trim()
    .toLowerCase();
  if (!term) return true;

  return columnValueText(getColumnSourceValue(row, columnId))
    .toLowerCase()
    .includes(term);
};

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
  /**
   * Define como a tabela acompanha a leitura durante a rolagem.
   * - header: fixa apenas os cabecalhos das colunas.
   * - block: fixa o toolbar e mantem cabecalhos dentro da area da tabela.
   * - none: comportamento solto.
   */
  initialStickyMode?: DataTableStickyMode;
}

type DataTableStickyMode = "none" | "header" | "block";

type DataColumnWithAccessor<T> = ColumnDef<T, unknown> & {
  accessorFn?: (row: T, index: number) => unknown;
  accessorKey?: string;
  id?: string;
};

function getOriginalColumnValue<T>(row: T, columnId: string): unknown {
  if (!row || typeof row !== "object") return null;

  const record = row as Record<string, unknown>;
  if (columnId in record && record[columnId] != null) {
    return record[columnId];
  }

  if (columnId === "filial") {
    const filial = record.filial as Record<string, unknown> | null | undefined;
    return filial?.codigo ?? filial?.nome ?? record.filialCodigoRaw ?? null;
  }
  if (columnId === "fornecedor") {
    const fornecedor = record.fornecedor as
      | Record<string, unknown>
      | null
      | undefined;
    return fornecedor?.nome ?? record.fornecedorRaw ?? null;
  }
  if (columnId === "abrangenciaFilial") {
    const filial = record.abrangenciaFilial as
      | Record<string, unknown>
      | null
      | undefined;
    return (
      filial?.codigo ?? filial?.nome ?? record.abrangenciaFilialRaw ?? null
    );
  }
  if (columnId === "usina") {
    const usina = record.usina as Record<string, unknown> | null | undefined;
    return usina?.nome ?? record.nomeUsinaRaw ?? null;
  }

  return null;
}

function ensureColumnFilterAccessor<T>(
  column: ColumnDef<T, unknown>,
): ColumnDef<T, unknown> {
  const candidate = column as DataColumnWithAccessor<T>;
  if (candidate.accessorFn || candidate.accessorKey || !candidate.id) {
    return column;
  }

  return {
    ...column,
    accessorFn: (row) => getOriginalColumnValue(row, candidate.id!),
  } as ColumnDef<T, unknown>;
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
  initialStickyMode = "header",
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  // `searchInput` reflete o que o usuário está digitando (atualização imediata
  // para o controle ficar fluido). `globalFilter` é o valor DEBOUNCED entregue
  // ao tanstack table — só atualiza após 400ms parado, evitando re-flatten de
  // todas as linhas a cada tecla apagada/digitada.
  const [searchInput, setSearchInput] = useState("");
  const [globalFilter, setGlobalFilter] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setGlobalFilter(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    initialColumnVisibility ?? {},
  );
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [stickyMode, setStickyMode] =
    useState<DataTableStickyMode>(initialStickyMode);
  const suppressSortClickRef = useRef(false);

  const startResize = (
    event: MouseEvent<HTMLDivElement> | TouchEvent<HTMLDivElement>,
    resizeHandler: (event: unknown) => void,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    suppressSortClickRef.current = true;
    resizeHandler(event);

    window.setTimeout(() => {
      suppressSortClickRef.current = false;
    }, 200);
  };

  const filterableColumns = columns.map(ensureColumnFilterAccessor);

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
        ...filterableColumns,
      ]
    : filterableColumns;

  const table = useReactTable({
    data,
    columns: allColumns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
      columnVisibility,
      rowSelection,
    },
    globalFilterFn: deepIncludesFilter as FilterFn<T>,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
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
    defaultColumn: {
      size: 180,
      minSize: 60,
      maxSize: 800,
      filterFn: columnIncludesFilter as FilterFn<T>,
    },
    initialState: { pagination: { pageSize } },
  });
  const hasColumnFilters = table.getState().columnFilters.length > 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div
        className={cn(
          "flex items-center gap-2",
          stickyMode === "block" &&
            "sticky top-0 z-20 rounded-md border bg-background/95 p-2 shadow-sm backdrop-blur",
        )}
      >
        {searchable && (
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={searchPlaceholder}
            className="max-w-sm"
          />
        )}
        <div className="flex-1" />
        {toolbarRight}
        {hasColumnFilters && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => table.resetColumnFilters()}
          >
            Limpar filtros
          </Button>
        )}
        <StickyModeControl value={stickyMode} onChange={setStickyMode} />
        <ColumnsMenu table={table} />
      </div>

      {/* Tabela. <table-layout: fixed> + width explícita por coluna fazem o
          column-resize do TanStack funcionar; usar o wrapper <Table> do shadcn
          impõe `w-full` no <table> e quebra o resize. */}
      <div
        className={cn(
          "rounded-md border",
          stickyMode === "none"
            ? "overflow-x-auto"
            : "max-h-[calc(100vh-14rem)] overflow-auto",
        )}
      >
        <table
          className="caption-bottom text-sm"
          style={{
            tableLayout: "fixed",
            width: table.getTotalSize(),
            minWidth: "100%",
          }}
        >
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <Fragment key={hg.id}>
                <TableRow key={hg.id}>
                  {hg.headers.map((h) => {
                    const sort = h.column.getIsSorted();
                    const canSort = h.column.getCanSort();
                    const canResize = h.column.getCanResize();
                    const isResizing = h.column.getIsResizing();
                    const isSelectHeader = h.column.id === "_select";
                    const canFilter =
                      h.column.getCanFilter() && !isSelectHeader;
                    return (
                      <TableHead
                        key={h.id}
                        onClick={(event) => {
                          if (!canSort) return;
                          if (suppressSortClickRef.current) {
                            event.preventDefault();
                            event.stopPropagation();
                            return;
                          }
                          h.column.getToggleSortingHandler()?.(event);
                        }}
                        style={{ width: h.getSize() }}
                        className={cn(
                          "relative whitespace-nowrap",
                          stickyMode !== "none" &&
                            "sticky top-0 z-10 bg-background shadow-[inset_0_-1px_0_hsl(var(--border))]",
                          isSelectHeader ? "px-2" : "px-2",
                          canSort &&
                            !isSelectHeader &&
                            "cursor-pointer select-none",
                        )}
                      >
                        <div
                          className={cn(
                            "flex min-w-0 items-center gap-1",
                            isSelectHeader
                              ? "justify-center pr-0"
                              : "justify-start pr-6",
                          )}
                        >
                          <span className="truncate">
                            {h.isPlaceholder
                              ? null
                              : flexRender(
                                  h.column.columnDef.header,
                                  h.getContext(),
                                )}
                          </span>
                          {canSort && (
                            <SortIcon
                              dir={
                                sort === "asc"
                                  ? "asc"
                                  : sort === "desc"
                                    ? "desc"
                                    : "none"
                              }
                            />
                          )}
                          {canFilter && (
                            <ColumnValueFilterMenu
                              table={table}
                              column={h.column}
                            />
                          )}
                        </div>
                        {canResize && (
                          <div
                            onMouseDown={(e) =>
                              startResize(e, h.getResizeHandler())
                            }
                            onTouchStart={(e) =>
                              startResize(e, h.getResizeHandler())
                            }
                            onClick={(e) => e.stopPropagation()}
                            className={cn(
                              // Área de grab de 10px (afastada do conteúdo do
                              // header pra não conflitar com sort chevron);
                              // visualmente uma linha sutil de 1px no centro.
                              "group/resize absolute top-0 right-0 z-10 flex h-full w-2.5 cursor-col-resize touch-none items-stretch justify-center select-none",
                              "before:block before:w-px before:bg-border/60 before:transition-colors",
                              "hover:before:w-0.5 hover:before:bg-primary",
                              isResizing && "before:w-0.5 before:bg-primary",
                            )}
                            aria-hidden
                            title="Arrastar para redimensionar"
                          />
                        )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              </Fragment>
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
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
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
        </table>
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

function ColumnValueFilterMenu<T>({
  table,
  column,
}: {
  table: Table<T>;
  column: Column<T, unknown>;
}) {
  const [search, setSearch] = useState("");
  const rawSelected = column.getFilterValue();
  const selected = Array.isArray(rawSelected) ? rawSelected.map(String) : [];
  const active = selected.length > 0;
  const optionLimit = column.id === "filial" ? 550 : 200;

  const options = useMemo(() => {
    const map = new Map<
      string,
      { value: string; label: string; count: number }
    >();

    for (const row of table.getCoreRowModel().flatRows) {
      const value = getColumnFilterKey(row, column.id);
      const label = formatColumnFilterLabel(
        getColumnSourceValue(row, column.id),
      );
      const current = map.get(value);
      if (current) {
        current.count += 1;
      } else {
        map.set(value, { value, label, count: 1 });
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      a.label.localeCompare(b.label, "pt-BR", { numeric: true }),
    );
  }, [column.id, table]);

  const visibleOptions = options
    .filter((option) =>
      option.label.toLowerCase().includes(search.trim().toLowerCase()),
    )
    .slice(0, optionLimit);

  const setSelected = (next: string[]) => {
    column.setFilterValue(next.length > 0 ? next : undefined);
  };

  const toggleValue = (value: string, checked: boolean) => {
    const allValues = options.map((option) => option.value);
    const hasNoValuesSelected = selected.includes(NO_COLUMN_VALUES_SELECTED);
    const base =
      selected.length === 0 ? allValues : hasNoValuesSelected ? [] : selected;
    const next = checked
      ? Array.from(new Set([...base, value]))
      : base.filter((item) => item !== value);

    setSelected(next.length > 0 ? next : [NO_COLUMN_VALUES_SELECTED]);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({
            variant: active ? "secondary" : "ghost",
            size: "icon",
          }),
          "h-6 w-6",
        )}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        aria-label={`Filtrar coluna ${String(column.columnDef.header ?? column.id)}`}
      >
        <ListFilter className={cn("h-3.5 w-3.5", active && "text-primary")} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-72"
        onClick={(event) => event.stopPropagation()}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>Filtrar valores</DropdownMenuLabel>
          <div className="px-1 py-1">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
              placeholder="Buscar valor..."
              className="h-8"
            />
          </div>
          <div className="flex items-center gap-1 px-1 py-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={(event) => {
                event.stopPropagation();
                column.setFilterValue(undefined);
              }}
            >
              Todos
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={(event) => {
                event.stopPropagation();
                column.setFilterValue([NO_COLUMN_VALUES_SELECTED]);
              }}
            >
              Nenhum
            </Button>
          </div>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup className="max-h-72 overflow-y-auto">
          {visibleOptions.length ? (
            visibleOptions.map((option) => (
              <DropdownMenuCheckboxItem
                key={option.value}
                checked={
                  selected.length === 0 || selected.includes(option.value)
                }
                onCheckedChange={(checked) =>
                  toggleValue(option.value, Boolean(checked))
                }
                onClick={(event) => event.stopPropagation()}
              >
                <span className="truncate">{option.label}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {option.count}
                </span>
              </DropdownMenuCheckboxItem>
            ))
          ) : (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              Nenhum valor.
            </div>
          )}
        </DropdownMenuGroup>
        {options.length > optionLimit && (
          <div className="px-2 py-1 text-xs text-muted-foreground">
            Mostrando os {optionLimit} primeiros valores encontrados.
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StickyModeControl({
  value,
  onChange,
}: {
  value: DataTableStickyMode;
  onChange: (value: DataTableStickyMode) => void;
}) {
  const options: Array<{ value: DataTableStickyMode; label: string }> = [
    { value: "none", label: "Solto" },
    { value: "header", label: "Colunas" },
    { value: "block", label: "Bloco" },
  ];

  return (
    <div
      className="flex items-center rounded-md border bg-background p-0.5"
      aria-label="Modo de rolagem da tabela"
    >
      {options.map((option) => (
        <Button
          key={option.value}
          type="button"
          variant={value === option.value ? "secondary" : "ghost"}
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

function ColumnsMenu<T>({
  table,
}: {
  table: ReturnType<typeof useReactTable<T>>;
}) {
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
