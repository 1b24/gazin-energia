"use client";

import { LogOut, User as UserIcon } from "lucide-react";
import { useTransition } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Role } from "@prisma/client";

import { signOutAction } from "@/app/(auth)/login/actions";

const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador",
  gestor_filial: "Gestor de filial",
  operacional: "Operacional",
};

interface Props {
  name: string | null;
  email: string | null;
  role: Role;
  filialCodigo?: string | null;
}

export function UserMenu({ name, email, role, filialCodigo }: Props) {
  const [pending, startTransition] = useTransition();
  const initials = (name ?? email ?? "?")
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "gap-2",
        )}
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
          {initials}
        </span>
        <span className="text-xs">{name ?? email}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{name ?? "—"}</span>
              {email && (
                <span className="text-xs font-normal text-muted-foreground">
                  {email}
                </span>
              )}
              <span className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                <UserIcon className="h-3 w-3" />
                {ROLE_LABEL[role]}
                {filialCodigo && ` · ${filialCodigo}`}
              </span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => startTransition(() => signOutAction())}
            disabled={pending}
            variant="destructive"
          >
            <LogOut className="mr-1 h-4 w-4" />
            {pending ? "Saindo..." : "Sair"}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

