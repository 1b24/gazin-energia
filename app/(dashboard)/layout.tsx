import type { ReactNode } from "react";

import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Sidebar } from "@/components/layout/sidebar";
import { UserMenu } from "@/components/layout/user-menu";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();
  // Middleware garante que aqui sempre temos session — type-narrow.
  const user = session?.user;

  // Busca codigo da filial pra exibir como rótulo no header (se tiver).
  let filialCodigo: string | null = null;
  if (user?.filialId) {
    const f = await prisma.filial.findUnique({
      where: { id: user.filialId },
      select: { codigo: true },
    });
    filialCodigo = f?.codigo ?? null;
  }

  return (
    <div className="flex min-h-screen flex-1">
      <Sidebar role={user?.role ?? null} />
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b px-6">
          <Breadcrumbs />
          {user && (
            <UserMenu
              name={user.name ?? null}
              email={user.email ?? null}
              role={user.role}
              filialCodigo={filialCodigo}
            />
          )}
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
