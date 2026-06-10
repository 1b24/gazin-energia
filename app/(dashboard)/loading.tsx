/**
 * Loading state do grupo (dashboard) — skeleton genérico exibido enquanto a
 * page server agrega dados (Suspense boundary automático do App Router).
 * Mantém o shell/sidebar visíveis; só a área de conteúdo pulsa.
 */
export default function DashboardLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-4" aria-busy="true">
      {/* título + filtros */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-44 rounded-md bg-muted" />
          <div className="h-3 w-28 rounded bg-muted" />
        </div>
        <div className="hidden gap-2 sm:flex">
          <div className="h-9 w-32 rounded-md bg-muted" />
          <div className="h-9 w-32 rounded-md bg-muted" />
        </div>
      </div>

      {/* linha de KPI cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-xl border bg-muted/40" />
        ))}
      </div>

      {/* blocos de conteúdo (tabelas / gráficos) */}
      <div className="h-64 rounded-xl border bg-muted/40" />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="h-48 rounded-xl border bg-muted/40" />
        <div className="h-48 rounded-xl border bg-muted/40" />
      </div>
    </div>
  );
}
