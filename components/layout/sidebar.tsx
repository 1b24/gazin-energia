"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";
import * as Icons from "lucide-react";
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MODULES } from "@/lib/modules/registry";
import type { ModuleDefinition } from "@/lib/modules/types";
import type { Role } from "@prisma/client";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "gazin-sidebar-collapsed";
const SIDEBAR_COLLAPSED_CHANGE_EVENT = "gazin-sidebar-collapsed-change";

function getStoredSidebarCollapsed() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1";
}

function subscribeToSidebarCollapsed(callback: () => void) {
  if (typeof window === "undefined") return () => {};

  const handleStorage = (event: StorageEvent) => {
    if (event.key === SIDEBAR_COLLAPSED_STORAGE_KEY) callback();
  };
  const handleLocalChange = () => callback();

  window.addEventListener("storage", handleStorage);
  window.addEventListener(SIDEBAR_COLLAPSED_CHANGE_EVENT, handleLocalChange);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(
      SIDEBAR_COLLAPSED_CHANGE_EVENT,
      handleLocalChange,
    );
  };
}

function ModuleIcon({ name, className }: { name: string; className?: string }) {
  const Icon = (
    Icons as unknown as Record<
      string,
      React.ComponentType<{ className?: string }>
    >
  )[name];
  if (!Icon) return null;
  return <Icon className={className} />;
}

function isActivePath(pathname: string, target: string) {
  if (target === "/") return pathname === "/";
  return pathname === target || pathname.startsWith(target + "/");
}

function ModuleItem({
  mod,
  collapsed,
}: {
  mod: ModuleDefinition;
  collapsed: boolean;
}) {
  const pathname = usePathname();
  const hasSubs = !!mod.submodules?.length;
  const moduleActive = isActivePath(pathname, mod.basePath);
  const [open, setOpen] = useState(moduleActive);

  if (collapsed || !hasSubs) {
    return (
      <Link
        href={mod.basePath}
        title={mod.label}
        aria-label={mod.label}
        className={cn(
          "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
          collapsed && "justify-center px-2",
          moduleActive
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
        )}
      >
        <ModuleIcon name={mod.icon} className="h-4 w-4 shrink-0" />
        {!collapsed && <span>{mod.label}</span>}
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
  const collapsed = useSyncExternalStore(
    subscribeToSidebarCollapsed,
    getStoredSidebarCollapsed,
    () => false,
  );
  const items = useMemo(() => {
    if (!role) return MODULES;
    return MODULES.filter((m) => {
      const allowed = m.permissions?.view;
      if (!allowed) return true; // default = todos
      return allowed.includes(role);
    });
  }, [role]);

  const toggleCollapsed = () => {
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? "0" : "1");
    window.dispatchEvent(new Event(SIDEBAR_COLLAPSED_CHANGE_EVENT));
  };

  return (
    <aside
      className={cn(
        "sticky top-0 left-0 z-30 flex h-screen shrink-0 flex-col border-r bg-background transition-[width] duration-200",
        collapsed ? "w-16" : "w-64",
      )}
    >
      <div
        className={cn(
          "flex h-14 items-center border-b px-3",
          collapsed ? "justify-center" : "justify-between gap-2",
        )}
      >
        <Link
          href="/"
          title="Gazin Energia"
          className={cn(
            "min-w-0 text-sm font-semibold",
            collapsed && "sr-only",
          )}
        >
          <span className="truncate">Gazin Energia</span>
        </Link>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={toggleCollapsed}
          aria-label={
            collapsed ? "Expandir menu lateral" : "Recolher menu lateral"
          }
          title={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>
      </div>
      <nav
        className={cn(
          "flex flex-1 flex-col gap-1 overflow-y-auto",
          collapsed ? "p-2" : "p-3",
        )}
      >
        {items.map((mod) => (
          <ModuleItem key={mod.id} mod={mod} collapsed={collapsed} />
        ))}
      </nav>
    </aside>
  );
}
