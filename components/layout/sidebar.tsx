"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import * as Icons from "lucide-react";
import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { MODULES } from "@/lib/modules/registry";
import type { ModuleDefinition } from "@/lib/modules/types";
import type { Role } from "@prisma/client";

function ModuleIcon({ name, className }: { name: string; className?: string }) {
  const Icon = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name];
  if (!Icon) return null;
  return <Icon className={className} />;
}

function isActivePath(pathname: string, target: string) {
  if (target === "/") return pathname === "/";
  return pathname === target || pathname.startsWith(target + "/");
}

function ModuleItem({ mod }: { mod: ModuleDefinition }) {
  const pathname = usePathname();
  const hasSubs = !!mod.submodules?.length;
  const moduleActive = isActivePath(pathname, mod.basePath);
  const [open, setOpen] = useState(moduleActive);

  if (!hasSubs) {
    return (
      <Link
        href={mod.basePath}
        className={cn(
          "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
          moduleActive
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
        )}
      >
        <ModuleIcon name={mod.icon} className="h-4 w-4" />
        <span>{mod.label}</span>
      </Link>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
          moduleActive
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
        )}
      >
        <ModuleIcon name={mod.icon} className="h-4 w-4" />
        <span className="flex-1 text-left">{mod.label}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 transition-transform",
            open ? "rotate-180" : "rotate-0",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 ml-6 flex flex-col gap-0.5">
        {mod.submodules!.map((sub) => {
          const active = pathname === sub.path;
          return (
            <Link
              key={sub.id}
              href={sub.path}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              {sub.label}
            </Link>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function Sidebar({ role }: { role?: Role | null } = {}) {
  const items = useMemo(() => {
    if (!role) return MODULES;
    return MODULES.filter((m) => {
      const allowed = m.permissions?.view;
      if (!allowed) return true; // default = todos
      return allowed.includes(role);
    });
  }, [role]);
  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r bg-background">
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/" className="text-sm font-semibold">
          Gazin Energia
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
        {items.map((mod) => (
          <ModuleItem key={mod.id} mod={mod} />
        ))}
      </nav>
    </aside>
  );
}
