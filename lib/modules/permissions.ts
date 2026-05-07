/**
 * Permissões por módulo — defaults sensatos quando não especificado:
 *  - view:    todos os roles
 *  - create:  admin + gestor_filial
 *  - edit:    admin + gestor_filial
 *  - delete:  apenas admin
 *
 * Cada `ModuleDefinition` no registry pode sobrescrever via `permissions`.
 */
import type { Role } from "@prisma/client";

import { MODULES, findModuleByPath } from "./registry";

export type Action = "view" | "create" | "edit" | "delete";

const DEFAULTS: Record<Action, Role[]> = {
  view: ["admin", "gestor_filial", "operacional"],
  create: ["admin", "gestor_filial"],
  edit: ["admin", "gestor_filial"],
  delete: ["admin"],
};

/** Resolve permissão pra um path. Path desconhecido → defaults. */
export function rolesAllowedFor(path: string, action: Action): Role[] {
  const mod = findModuleByPath(path);
  return mod?.permissions?.[action] ?? DEFAULTS[action];
}

export function canAccess(
  role: Role | undefined | null,
  path: string,
  action: Action = "view",
): boolean {
  if (!role) return false;
  return rolesAllowedFor(path, action).includes(role);
}

/** Lista de módulos visíveis para um role (usado pela sidebar). */
export function visibleModulesFor(role: Role | undefined | null) {
  if (!role) return [];
  return MODULES.filter((m) =>
    (m.permissions?.view ?? DEFAULTS.view).includes(role),
  );
}
