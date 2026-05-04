export type Role = "admin" | "gestor_filial" | "operacional";

export interface SubmoduleDefinition {
  id: string;
  label: string;
  path: string;
  prismaModel: string;
  icon?: string;
  description?: string;
}

export interface ModuleDefinition {
  id: string;
  label: string;
  icon: string;
  basePath: string;
  description?: string;
  submodules?: SubmoduleDefinition[];
  prismaModel?: string;
  permissions?: {
    view?: Role[];
    create?: Role[];
    edit?: Role[];
    delete?: Role[];
  };
}
