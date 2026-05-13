import type { ModuleDefinition } from "./types";

export const MODULES: ModuleDefinition[] = [
  {
    id: "usinas",
    label: "Cadastro de Usinas",
    icon: "Sun",
    basePath: "/usinas",
    prismaModel: "Usina",
  },
  {
    id: "filiais",
    label: "Cadastro de Filiais",
    icon: "Building2",
    basePath: "/filiais",
    prismaModel: "Filial",
  },
  {
    id: "fornecedores",
    label: "Cadastro de Fornecedores",
    icon: "Truck",
    basePath: "/fornecedores",
    prismaModel: "Fornecedor",
  },
  {
    id: "distribuidoras",
    label: "Distribuidoras",
    icon: "Zap",
    basePath: "/distribuidoras",
    prismaModel: "Distribuidora",
  },
  {
    id: "tarifas",
    label: "Tarifas de Energia",
    icon: "DollarSign",
    basePath: "/tarifas",
    prismaModel: "TarifaEnergia",
  },
  {
    id: "juridico",
    label: "Jurídico",
    icon: "Scale",
    basePath: "/juridico",
    submodules: [
      {
        id: "processos",
        label: "Processos Adm. e Judiciais",
        path: "/juridico/processos",
        prismaModel: "ProcessoJuridico",
      },
      {
        id: "licencas",
        label: "Controle de Licenças",
        path: "/juridico/licencas",
        prismaModel: "Licenca",
      },
    ],
  },
  {
    id: "geracao",
    label: "Geração",
    icon: "Zap",
    basePath: "/geracao",
    prismaModel: "Geracao",
  },
  {
    id: "venda-kwh",
    label: "Venda de KWh",
    icon: "TrendingUp",
    basePath: "/venda-kwh",
    prismaModel: "VendaKwh",
  },
  {
    id: "consumo",
    label: "Consumo",
    icon: "Plug",
    basePath: "/consumo",
    submodules: [
      {
        id: "consumo",
        label: "Consumo",
        path: "/consumo",
        prismaModel: "Consumo",
      },
      {
        id: "validacao-fatura",
        label: "Validação Relatório Fatura",
        path: "/consumo/validacao-fatura",
        prismaModel: "ValidacaoFatura",
      },
    ],
  },
  {
    id: "estoque",
    label: "Controle de Estoque",
    icon: "Package",
    basePath: "/estoque",
    prismaModel: "ItemEstoque",
  },
  {
    id: "injecao",
    label: "Controle de Injeção",
    icon: "ArrowUpFromDot",
    basePath: "/injecao",
    prismaModel: "Injecao",
  },
  {
    id: "orcamentario",
    label: "Cadastro Orçamentário",
    icon: "Calculator",
    basePath: "/orcamentario",
    prismaModel: "Orcamento",
  },
  {
    id: "manutencao",
    label: "Menu de Manutenção",
    icon: "Wrench",
    basePath: "/manutencao",
    submodules: [
      {
        id: "consertos",
        label: "Conserto de Equipamentos",
        path: "/manutencao/consertos",
        prismaModel: "ConsertoEquipamento",
      },
      {
        id: "limpeza",
        label: "Cronograma de Limpeza",
        path: "/manutencao/limpeza",
        prismaModel: "CronogramaLimpeza",
      },
      {
        id: "preventiva",
        label: "Manutenção Preventiva",
        path: "/manutencao/preventiva",
        prismaModel: "ManutencaoPreventiva",
      },
      {
        id: "corretiva",
        label: "Manutenção Corretiva",
        path: "/manutencao/corretiva",
        prismaModel: "ManutencaoCorretiva",
      },
    ],
  },
  {
    id: "documentos",
    label: "Documentos Internos",
    icon: "FileText",
    basePath: "/documentos",
    prismaModel: "Documento",
  },
];

export function getAllEntities() {
  return MODULES.flatMap((m) =>
    m.submodules
      ? m.submodules.map((s) => ({ ...s, moduleId: m.id }))
      : [
          {
            id: m.id,
            label: m.label,
            path: m.basePath,
            prismaModel: m.prismaModel!,
            moduleId: m.id,
          },
        ],
  );
}

export function findModuleByPath(path: string) {
  return MODULES.find(
    (m) => m.basePath === path || m.submodules?.some((s) => s.path === path),
  );
}
