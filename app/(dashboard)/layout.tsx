import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-1">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center border-b px-6">
          <Breadcrumbs />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
