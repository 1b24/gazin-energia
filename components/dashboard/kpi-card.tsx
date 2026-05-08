import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";

export function KpiCard({
  label,
  value,
  subtitle,
  icon,
  variant = "default",
}: {
  label: string;
  value: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  variant?: "default" | "warning" | "success" | "destructive";
}) {
  const accent =
    variant === "success"
      ? "text-emerald-600"
      : variant === "warning"
        ? "text-amber-600"
        : variant === "destructive"
          ? "text-destructive"
          : "text-foreground";
  return (
    <Card>
      <CardContent className="flex flex-col gap-1.5 py-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            {label}
          </p>
          {icon ? <div className="text-muted-foreground">{icon}</div> : null}
        </div>
        <p className={`text-2xl font-semibold tracking-tight ${accent}`}>
          {value}
        </p>
        {subtitle ? (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
