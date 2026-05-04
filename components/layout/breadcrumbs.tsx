"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { MODULES } from "@/lib/modules/registry";

function resolveCrumbs(pathname: string) {
  if (pathname === "/" || pathname === "") {
    return [{ label: "Dashboard", href: "/" }];
  }

  const crumbs: { label: string; href: string }[] = [
    { label: "Dashboard", href: "/" },
  ];

  for (const mod of MODULES) {
    if (
      pathname === mod.basePath ||
      pathname.startsWith(mod.basePath + "/")
    ) {
      crumbs.push({ label: mod.label, href: mod.basePath });

      const sub = mod.submodules?.find((s) => s.path === pathname);
      if (sub) crumbs.push({ label: sub.label, href: sub.path });

      return crumbs;
    }
  }

  // Fallback: derive a single crumb from the last segment.
  const last = pathname.split("/").filter(Boolean).pop() ?? "";
  crumbs.push({ label: last, href: pathname });
  return crumbs;
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const crumbs = resolveCrumbs(pathname);

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1 text-sm text-muted-foreground"
    >
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <span key={c.href + i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5" />}
            {last ? (
              <span className="text-foreground">{c.label}</span>
            ) : (
              <Link href={c.href} className="hover:text-foreground">
                {c.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
