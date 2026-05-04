/**
 * Importa os JSONs canônicos de `data/raw/` para o Postgres via Prisma.
 *
 * Regras (BRIEF, item 2.1):
 * - Lê apenas arquivos presentes; entidades sem JSON são puladas com aviso
 *   `⊘` no log e não viram erro.
 * - Idempotente: cada upsert usa `zohoId` (ou `zohoId+ano+mes`) como chave.
 * - Ordem de dependência: filiais → usinas/fornecedores → resto.
 * - FKs por nome/código resolvidas após o pai estar gravado; misses preservam
 *   o valor original em colunas `*Raw` para reconciliação posterior.
 */
import "dotenv/config";

import type {
  LocalInstalacao,
  PrismaClient,
  StatusEntidade,
  StatusManutencao,
  TipoGD,
  TipoOrcamento,
  TipoProcesso,
  UF,
} from "@prisma/client";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { createPrismaClient } from "@/lib/db";
import { ENTITY_STATUS } from "@/lib/modules/status";
import {
  mesAbbrPtToNumber,
  nullIfEmpty,
  parseCNPJ,
  parseLooseDate,
  parseLooseInt,
  parseLooseNumber,
} from "@/lib/format";

const RAW_DIR = path.join(process.cwd(), "data", "raw");

// Mapa "nome canônico do JSON" → Prisma model. Casa com a tabela do BRIEF.
const FILE_TO_MODEL: Record<string, string> = {
  "filiais.json": "Filial",
  "usinas.json": "Usina",
  "fornecedores.json": "Fornecedor",
  "geracao.json": "Geracao",
  "venda_kwh.json": "VendaKwh",
  "consumo.json": "Consumo",
  "injecao.json": "Injecao",
  "orcamentario.json": "Orcamento",
  "manutencao_limpeza.json": "CronogramaLimpeza",
  "manutencao_preventiva.json": "ManutencaoPreventiva",
  "juridico_processos.json": "ProcessoJuridico",
  // Stubs (BRIEF item 2.1: pulados silenciosamente):
  "juridico_licencas.json": "Licenca",
  "consumo_validacao_fatura.json": "ValidacaoFatura",
  "estoque.json": "ItemEstoque",
  "manutencao_consertos.json": "ConsertoEquipamento",
  "manutencao_corretiva.json": "ManutencaoCorretiva",
  "documentos.json": "Documento",
};

type Row = Record<string, unknown>;

function rawPath(file: string) {
  return path.join(RAW_DIR, file);
}

async function loadJson(file: string): Promise<Row[]> {
  const raw = await readFile(rawPath(file), "utf-8");
  const parsed = JSON.parse(raw) as Record<string, Row[]>;
  // Cada dump Zoho tem uma única chave de topo (ex: `Cadastro_de_..._Report`).
  const key = Object.keys(parsed)[0];
  return parsed[key];
}

// ----------------------------------------------------------------------------
// Helpers — getters tolerantes + tradutores para os enums do schema.
// ----------------------------------------------------------------------------

function asString(r: Row, k: string): string | null {
  return nullIfEmpty(r[k]);
}

function asNumber(r: Row, k: string): number | null {
  return parseLooseNumber(r[k]);
}

function asInt(r: Row, k: string): number | null {
  return parseLooseInt(r[k]);
}

function asDate(r: Row, k: string): Date | null {
  return parseLooseDate(r[k]);
}

function asBool(r: Row, k: string): boolean | null {
  const s = asString(r, k);
  if (!s) return null;
  const norm = s.trim().toLowerCase();
  if (["sim", "yes", "true", "1"].includes(norm)) return true;
  if (["não", "nao", "no", "false", "0"].includes(norm)) return false;
  return null;
}

const UF_VALUES = new Set([
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG",
  "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR",
  "RS", "SC", "SE", "SP", "TO",
]);

function asUF(r: Row, k: string): UF | null {
  const s = asString(r, k);
  if (!s) return null;
  const norm = s.trim().toUpperCase();
  return (UF_VALUES.has(norm) ? norm : null) as UF | null;
}

function asLocalInstalacao(r: Row, k: string): LocalInstalacao | null {
  const s = asString(r, k);
  if (!s) return null;
  const norm = s.trim().toLowerCase();
  if (norm === "telhado") return "telhado";
  if (norm === "solo") return "solo";
  return null;
}

function asTipoGd(r: Row, k: string): TipoGD | null {
  const s = asString(r, k);
  if (!s) return null;
  const norm = s.trim().toUpperCase();
  if (["GD1", "GD2", "GD3"].includes(norm)) return norm as TipoGD;
  return null;
}

function asStatusEntidade(r: Row, k: string): StatusEntidade {
  const s = asString(r, k);
  if (!s) return "ativo";
  return s.trim().toLowerCase() === "inativo" ? "inativo" : "ativo";
}

function asStatusManutencao(r: Row, k: string): StatusManutencao | null {
  const s = asString(r, k);
  if (!s) return null;
  const norm = s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "_");
  if (norm === "pendente") return "pendente";
  if (norm === "em_andamento") return "em_andamento";
  if (norm === "concluida" || norm === "concluido") return "concluida";
  return null;
}

function asTipoProcesso(r: Row, k: string): TipoProcesso | null {
  const s = asString(r, k);
  if (!s) return null;
  const norm = s.trim().toLowerCase();
  if (norm === "judicial") return "judicial";
  if (norm === "administrativo") return "administrativo";
  return null;
}

function asTipoOrcamento(r: Row, k: string): TipoOrcamento | null {
  const s = asString(r, k);
  if (!s) return null;
  const norm = s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "_");
  if (norm === "despesa_direta") return "despesa_direta";
  return "outro";
}

// ----------------------------------------------------------------------------
// Telemetria do import — contagens, pulados, FKs não resolvidas.
// ----------------------------------------------------------------------------

interface Stats {
  inserted: number;
  unmatched: { entity: string; lookup: string; raw: string }[];
}

const stats: Record<string, Stats> = {};
const skipped: { model: string; file: string; reason: "stub" | "missing" }[] = [];

function track(entity: string): Stats {
  stats[entity] ??= { inserted: 0, unmatched: [] };
  return stats[entity];
}

function logUnmatched(
  entity: string,
  lookup: string,
  raw: string | null | undefined,
) {
  if (!raw) return;
  track(entity).unmatched.push({ entity, lookup, raw });
}

// ----------------------------------------------------------------------------
// Importers — um por entidade ativa.
// ----------------------------------------------------------------------------

async function importFiliais(prisma: PrismaClient) {
  const rows = await loadJson("filiais.json");
  for (const r of rows) {
    const zohoId = asString(r, "ID");
    if (!zohoId) continue;
    const data = {
      codigo: asString(r, "Filial"),
      cd: asString(r, "CD"),
      mercadoLivre: asString(r, "Mercado_Livre"),
      percentualAbsorcaoUsp: asNumber(r, "Percentual_absor_o_USP"),
      uc: asString(r, "UC"),
      uc2: asString(r, "UC_2"),
      uc3: asString(r, "UC_3"),
      municipio: asString(r, "Munic_pio"),
      uf: asUF(r, "UF"),
      senha: asString(r, "Senha"),
      usuario: asString(r, "Usu_rio"),
      grupo: asString(r, "Grupo"),
      distribuidora: asString(r, "Distribuidora1"),
      cnpj: asString(r, "CNPJ"),
      filialClimatizada: asString(r, "Filial_climatizada"),
      dataClimatizacaoPlanejada: asDate(
        r,
        "Caso_a_filial_n_o_seja_climatizada_informe_aqui_a_data_que_ser_realizada_a_climatiza_o",
      ),
    };
    await prisma.filial.upsert({
      where: { zohoId },
      create: { zohoId, ...data },
      update: data,
    });
    track("Filial").inserted++;
  }
}

async function buildFilialCodeMap(prisma: PrismaClient) {
  const all = await prisma.filial.findMany({
    where: { codigo: { not: null } },
    select: { id: true, codigo: true },
  });
  const map = new Map<string, string>();
  for (const f of all) if (f.codigo) map.set(f.codigo, f.id);
  return map;
}

async function importUsinas(prisma: PrismaClient) {
  const rows = await loadJson("usinas.json");
  const filialMap = await buildFilialCodeMap(prisma);

  for (const r of rows) {
    const zohoId = asString(r, "ID");
    const nome = asString(r, "Nome");
    if (!zohoId || !nome) continue;

    const filialCodigoRaw = asString(r, "Filial");
    const filialId = filialCodigoRaw ? filialMap.get(filialCodigoRaw) : undefined;
    if (filialCodigoRaw && !filialId) {
      logUnmatched("Usina", "Filial", filialCodigoRaw);
    }

    const cnpjRaw = asString(r, "CNPJ");
    const cnpj = cnpjRaw ? parseCNPJ(cnpjRaw) : null;

    const data = {
      nome,
      ccUsinas: asString(r, "CC_usinas"),
      localInstalacao: asLocalInstalacao(r, "Tipo"),
      tipoGd: asTipoGd(r, "Tipo_de_GD"),
      cnpj,
      uc: asString(r, "UC"),
      potenciaInstaladaKw: asNumber(r, "Pot_ncia_kWp"),
      potenciaProjetadaKw: asNumber(r, "Pot_ncia_kWp1"),
      metaKwhMes: asInt(r, "Meta_kwh_m_s"),
      inicioOperacao: asDate(r, "Inicio_de_opera_o"),
      autoProdutora: asBool(r, "Auto_produtora"),
      quantasFlAtende: asInt(r, "Quantas_Fl_atende"),
      municipio: asString(r, "Munic_pio"),
      uf: asUF(r, "UF"),
      investimentoTotal: asNumber(r, "Investimento_total"),
      documentosProjeto: asString(r, "Documentos_do_projeto"),
      filialId: filialId ?? null,
      filialCodigoRaw,
    };

    await prisma.usina.upsert({
      where: { zohoId },
      create: { zohoId, ...data },
      update: data,
    });
    track("Usina").inserted++;
  }
}

async function buildUsinaNameMap(prisma: PrismaClient) {
  const all = await prisma.usina.findMany({
    where: { nome: { not: "" } },
    select: { id: true, nome: true },
  });
  const map = new Map<string, string>();
  for (const u of all) map.set(u.nome.trim(), u.id);
  return map;
}

function lookupUsina(
  map: Map<string, string>,
  raw: string | null,
  caller: string,
): string | null {
  if (!raw) return null;
  const id = map.get(raw.trim());
  if (!id) logUnmatched(caller, "Nome_da_usina", raw);
  return id ?? null;
}

async function importFornecedores(prisma: PrismaClient) {
  const rows = await loadJson("fornecedores.json");
  const filialMap = await buildFilialCodeMap(prisma);

  for (const r of rows) {
    const zohoId = asString(r, "ID");
    if (!zohoId) continue;
    const nome = asString(r, "Nome");

    const filialCodigoRaw = asString(r, "Abrang_ncia_filial");
    const filialId = filialCodigoRaw ? filialMap.get(filialCodigoRaw) : undefined;
    if (filialCodigoRaw && !filialId) {
      logUnmatched("Fornecedor", "Abrang_ncia_filial", filialCodigoRaw);
    }

    const data = {
      nome,
      cnpj: asString(r, "CNPJ"),
      status: asStatusEntidade(r, "Status"),
      escopoServico: asString(r, "Escopo_de_servi_o"),
      inicioPrestacao: asDate(r, "Inicio_presta_o"),
      terminoPrestacao: asDate(r, "T_rmino_presta_o"),
      idContratoZoho: asString(r, "ID_contrato_zoho"),
      anexoContrato: asString(r, "Anexo_de_contrato"),
      abrangenciaUsinas: asString(r, "Abrang_ncia_usinas"),
      abrangenciaFilialId: filialId ?? null,
      abrangenciaFilialRaw: filialCodigoRaw,
    };

    await prisma.fornecedor.upsert({
      where: { zohoId },
      create: { zohoId, ...data },
      update: data,
    });
    track("Fornecedor").inserted++;
  }
}

async function importGeracao(prisma: PrismaClient) {
  const rows = await loadJson("geracao.json");
  const usinaMap = await buildUsinaNameMap(prisma);

  for (const r of rows) {
    const zohoId = asString(r, "ID");
    if (!zohoId) continue;
    const nomeUsinaRaw = asString(r, "Nome_da_usina");
    const usinaId = lookupUsina(usinaMap, nomeUsinaRaw, "Geracao");

    const ger = await prisma.geracao.upsert({
      where: { zohoId },
      create: {
        zohoId,
        ano: asInt(r, "Ano"),
        mes: asString(r, "M_s1"),
        metaMensal: asNumber(r, "Meta_mensal_de_Gera_o"),
        metaGeracao: asNumber(r, "Meta_de_gera_o"),
        usinaId,
        nomeUsinaRaw,
      },
      update: {
        ano: asInt(r, "Ano"),
        mes: asString(r, "M_s1"),
        metaMensal: asNumber(r, "Meta_mensal_de_Gera_o"),
        metaGeracao: asNumber(r, "Meta_de_gera_o"),
        usinaId,
        nomeUsinaRaw,
      },
    });

    // Single_Line1..Single_Line31 → dias 1..31. `Single_Line` (sem sufixo) é
    // ignorado por não ter semântica documentada.
    for (let dia = 1; dia <= 31; dia++) {
      const kwh = asNumber(r, `Single_Line${dia}`);
      if (kwh == null) continue;
      await prisma.geracaoDia.upsert({
        where: { geracaoId_dia: { geracaoId: ger.id, dia } },
        create: { geracaoId: ger.id, dia, kwh },
        update: { kwh },
      });
    }
    track("Geracao").inserted++;
  }
}

async function importVendaKwh(prisma: PrismaClient) {
  const rows = await loadJson("venda_kwh.json");
  const usinaMap = await buildUsinaNameMap(prisma);
  const ABBR = ["JAN","FEV","MAR","ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ"];

  for (const r of rows) {
    const zohoId = asString(r, "ID");
    if (!zohoId) continue;
    const nomeUsinaRaw = asString(r, "Nome_da_usina");
    const usinaId = lookupUsina(usinaMap, nomeUsinaRaw, "VendaKwh");
    const notaFiscal = asString(r, "Nota_fiscal_da_venda");

    // Descobre os anos presentes nas chaves (`*_FEV_2026`, `*_MAR_2026`, ...).
    const years = new Set<number>();
    for (const k of Object.keys(r)) {
      const m = /_([A-Z]{3})_(\d{4})$/.exec(k);
      if (m) years.add(Number(m[2]));
    }

    for (const year of years) {
      for (const abbr of ABBR) {
        const kwh = asNumber(r, `Total_de_KWh_vendidos_${abbr}_${year}`);
        const val = asNumber(r, `Total_de_KWh_vendidos_em_R_${abbr}_${year}`);
        if (kwh == null && val == null) continue;
        const mesNum = mesAbbrPtToNumber(abbr);
        if (!mesNum) continue;
        const mes = String(mesNum).padStart(2, "0");
        await prisma.vendaKwh.upsert({
          where: { zohoId_ano_mes: { zohoId, ano: year, mes } },
          create: {
            zohoId, ano: year, mes,
            kwhVendidos: kwh, valorReais: val,
            notaFiscalUrl: notaFiscal,
            usinaId, nomeUsinaRaw,
          },
          update: {
            kwhVendidos: kwh, valorReais: val,
            notaFiscalUrl: notaFiscal,
            usinaId, nomeUsinaRaw,
          },
        });
        track("VendaKwh").inserted++;
      }
    }
  }
}

async function importConsumo(prisma: PrismaClient) {
  const rows = await loadJson("consumo.json");
  const filialMap = await buildFilialCodeMap(prisma);

  for (const r of rows) {
    const zohoId = asString(r, "ID");
    if (!zohoId) continue;

    const filialCodigoRaw = asString(r, "Filial");
    const filialId = filialCodigoRaw ? filialMap.get(filialCodigoRaw) : undefined;
    if (filialCodigoRaw && !filialId) {
      logUnmatched("Consumo", "Filial", filialCodigoRaw);
    }

    const data = {
      ano: asInt(r, "Ano"),
      mes: asString(r, "M_s"),
      uc: asString(r, "UC1"),
      consumoKwhP: asNumber(r, "Consumo_KWH_P"),
      consumoKwhFp: asNumber(r, "Consumo_KWH_FP"),
      consumoTotal: asNumber(r, "Consumo_total"),
      injecaoRecebida: asNumber(r, "Inje_o_recebida"),
      multasJurosAtraso: asNumber(r, "Multas_juros_atraso"),
      outrasMultas: asNumber(r, "Outras_multas"),
      valor: asNumber(r, "Valor"),
      valor1: asNumber(r, "Valor1"),
      valor2: asNumber(r, "Valor2"),
      valor3: asNumber(r, "Valor3"),
      valorTotalFatura: asNumber(r, "Valor_total_fatura"),
      statusAnexo: asString(r, "Status_Anexo1"),
      arquivoFatura: asString(r, "Arquivo_da_fatura"),
      municipio: asString(r, "Munic_pio"),
      filialId: filialId ?? null,
      filialCodigoRaw,
    };

    await prisma.consumo.upsert({
      where: { zohoId },
      create: { zohoId, ...data },
      update: data,
    });
    track("Consumo").inserted++;
  }
}

async function importInjecao(prisma: PrismaClient) {
  const rows = await loadJson("injecao.json");
  for (const r of rows) {
    const zohoId = asString(r, "ID");
    if (!zohoId) continue;
    const data = {
      ano: asInt(r, "Ano"),
      mes: asString(r, "M_s"),
      uc: asString(r, "UC"),
      filialDescricao: asString(r, "Filial"),
      fornecedorRaw: asString(r, "fornecedor"),
      consumoKwhP: asNumber(r, "Consumo_KWH_P"),
      consumoKwhP1: asNumber(r, "Consumo_KWH_P1"),
      consumoTotalKwh: asNumber(r, "Consumo_total_KWH"),
      valor: asNumber(r, "Valor"),
      valor1: asNumber(r, "Valor1"),
      valor2: asNumber(r, "Valor2"),
      municipio: asString(r, "Munic_pio"),
      anexoFechamento: asString(r, "Anexo_fechamento"),
    };
    await prisma.injecao.upsert({
      where: { zohoId },
      create: { zohoId, ...data },
      update: data,
    });
    track("Injecao").inserted++;
  }
}

async function importOrcamento(prisma: PrismaClient) {
  const rows = await loadJson("orcamentario.json");
  const usinaMap = await buildUsinaNameMap(prisma);

  for (const r of rows) {
    const zohoId = asString(r, "ID");
    if (!zohoId) continue;
    const nomeUsinaRaw = asString(r, "Nome_da_usina");
    const usinaId = lookupUsina(usinaMap, nomeUsinaRaw, "Orcamento");

    const data = {
      mes: asString(r, "M_s"),
      tipo: asTipoOrcamento(r, "Tipo"),
      naturezaGasto: asString(r, "Natureza_do_gasto"),
      detalhamento: asString(r, "Detalhamento1"),
      equipamentos: asString(r, "Equipamentos"),
      realEquipamentos: asNumber(r, "Real_Equipamentos"),
      realViagensEstadias: asNumber(r, "Real_Viagens_e_estadias"),
      realUsoConsumo: asNumber(r, "Real_uso_e_consumo"),
      usoConsumo: asNumber(r, "Uso_e_consumo"),
      anexosDetalhamento: asString(r, "Anexos_do_Detalhamento"),
      usinaId,
      nomeUsinaRaw,
    };

    await prisma.orcamento.upsert({
      where: { zohoId },
      create: { zohoId, ...data },
      update: data,
    });
    track("Orcamento").inserted++;
  }
}

async function importLimpeza(prisma: PrismaClient) {
  const rows = await loadJson("manutencao_limpeza.json");
  const usinaMap = await buildUsinaNameMap(prisma);

  // Mapeamento posicional dos 6 slots de limpeza (chaves estranhas no Zoho).
  const SLOTS = [
    { ordem: 1, data: "Limpeza",    concl: "Data_de_conclus_o",   status: "Status1", foto: "Foto_da_limpeza" },
    { ordem: 2, data: "Limpeza_2",  concl: "Data_de_conclus_o_2", status: "Status2", foto: "Fotos_da_limpeza_2" },
    { ordem: 3, data: "Limpeza_3",  concl: "Data_de_conclus_o_3", status: "Status3", foto: "Fotos_da_limpeza_3" },
    { ordem: 4, data: "Limpeza_21", concl: "Data_de_conclus_o_4", status: "Status4", foto: "Foto_da_limpeza_4" },
    { ordem: 5, data: "Limpeza_5",  concl: "Data_de_conclus_o_5", status: "",        foto: "Foto_da_limpeza_5" },
    { ordem: 6, data: "Limpeza_6",  concl: "Data_de_conclus_o_6", status: "",        foto: "" },
  ] as const;

  for (const r of rows) {
    const zohoId = asString(r, "ID");
    if (!zohoId) continue;
    const nomeUsinaRaw = asString(r, "Nome_da_usina1");
    const usinaId = lookupUsina(usinaMap, nomeUsinaRaw, "CronogramaLimpeza");

    const cronograma = await prisma.cronogramaLimpeza.upsert({
      where: { zohoId },
      create: {
        zohoId,
        realizado: asString(r, "Realizado"),
        statusGeral: asStatusManutencao(r, "Status") ?? "pendente",
        usinaId,
        nomeUsinaRaw,
      },
      update: {
        realizado: asString(r, "Realizado"),
        statusGeral: asStatusManutencao(r, "Status") ?? "pendente",
        usinaId,
        nomeUsinaRaw,
      },
    });

    for (const slot of SLOTS) {
      const dataPlanejada = asDate(r, slot.data);
      const dataConclusao = asDate(r, slot.concl);
      const status = slot.status ? asStatusManutencao(r, slot.status) : null;
      const fotoUrl = slot.foto ? asString(r, slot.foto) : null;
      if (!dataPlanejada && !dataConclusao && !status && !fotoUrl) continue;

      await prisma.limpezaItem.upsert({
        where: { cronogramaId_ordem: { cronogramaId: cronograma.id, ordem: slot.ordem } },
        create: {
          cronogramaId: cronograma.id,
          ordem: slot.ordem,
          dataPlanejada,
          dataConclusao,
          status,
          fotoUrl,
        },
        update: { dataPlanejada, dataConclusao, status, fotoUrl },
      });
    }
    track("CronogramaLimpeza").inserted++;
  }
}

async function importPreventiva(prisma: PrismaClient) {
  const rows = await loadJson("manutencao_preventiva.json");
  const usinaMap = await buildUsinaNameMap(prisma);

  for (const r of rows) {
    const zohoId = asString(r, "ID");
    if (!zohoId) continue;
    const nomeUsinaRaw = asString(r, "Nome_da_usina");
    const usinaId = lookupUsina(usinaMap, nomeUsinaRaw, "ManutencaoPreventiva");

    const data = {
      status: asStatusManutencao(r, "Status") ?? "pendente",
      dataExecucao: asDate(r, "Data_de_execu_o"),
      dataConclusao: asDate(r, "Data_de_conclus_o_2"),
      laudoTecnico: asString(r, "Laudo_t_cnico"),
      fotosUsina: asString(r, "Fotos_da_usina"),
      checklistVerificacao: asString(r, "Checklist_de_verifica_o"),
      usinaId,
      nomeUsinaRaw,
    };

    await prisma.manutencaoPreventiva.upsert({
      where: { zohoId },
      create: { zohoId, ...data },
      update: data,
    });
    track("ManutencaoPreventiva").inserted++;
  }
}

async function importProcessos(prisma: PrismaClient) {
  const rows = await loadJson("juridico_processos.json");
  for (const r of rows) {
    const zohoId = asString(r, "ID");
    if (!zohoId) continue;

    const data = {
      tipo: asTipoProcesso(r, "Tipo"),
      parteAdversa: asString(r, "Parte_adversa"),
      pleito: asString(r, "Pleito"),
      dataProtocolo: asDate(r, "Data_protocolo"),
      fornecedor: asString(r, "fornecedor"),
      evolucaoJaneiro: asString(r, "Evolu_o_do_processo_Janeiro"),
      nomeUsinasRaw: asString(r, "Nome_das_usinas"),
    };

    await prisma.processoJuridico.upsert({
      where: { zohoId },
      create: { zohoId, ...data },
      update: data,
    });
    track("ProcessoJuridico").inserted++;
  }
}

// ----------------------------------------------------------------------------
// Orchestrator
// ----------------------------------------------------------------------------

interface Step {
  file: string;
  model: string;
  fn: (p: PrismaClient) => Promise<void>;
}

// Ordem de dependência: filiais → usinas/fornecedores → resto.
const STEPS: Step[] = [
  { file: "filiais.json",                model: "Filial",               fn: importFiliais },
  { file: "usinas.json",                 model: "Usina",                fn: importUsinas },
  { file: "fornecedores.json",           model: "Fornecedor",           fn: importFornecedores },
  { file: "geracao.json",                model: "Geracao",              fn: importGeracao },
  { file: "venda_kwh.json",              model: "VendaKwh",             fn: importVendaKwh },
  { file: "consumo.json",                model: "Consumo",              fn: importConsumo },
  { file: "injecao.json",                model: "Injecao",              fn: importInjecao },
  { file: "orcamentario.json",           model: "Orcamento",            fn: importOrcamento },
  { file: "manutencao_limpeza.json",     model: "CronogramaLimpeza",    fn: importLimpeza },
  { file: "manutencao_preventiva.json",  model: "ManutencaoPreventiva", fn: importPreventiva },
  { file: "juridico_processos.json",     model: "ProcessoJuridico",     fn: importProcessos },
];

// Stubs que o BRIEF prevê mas ainda não têm JSON. Aparecem no log com `⊘`.
const STUB_FILES: { file: string; model: string }[] = [
  { file: "juridico_licencas.json",          model: "Licenca" },
  { file: "consumo_validacao_fatura.json",   model: "ValidacaoFatura" },
  { file: "estoque.json",                    model: "ItemEstoque" },
  { file: "manutencao_consertos.json",       model: "ConsertoEquipamento" },
  { file: "manutencao_corretiva.json",       model: "ManutencaoCorretiva" },
  { file: "documentos.json",                 model: "Documento" },
];

export async function runImport(prisma?: PrismaClient): Promise<{
  stats: Record<string, Stats>;
  skipped: typeof skipped;
}> {
  const owns = !prisma;
  const client = prisma ?? createPrismaClient();

  console.log("[seed] Iniciando...");
  try {
    for (const step of STEPS) {
      if (!existsSync(rawPath(step.file))) {
        skipped.push({ model: step.model, file: step.file, reason: "missing" });
        console.log(
          `⊘ ${step.file}: arquivo ausente, pulando (entidade ativa esperada)`,
        );
        continue;
      }
      await step.fn(client);
      const inserted = stats[step.model]?.inserted ?? 0;
      console.log(`✓ ${step.file}: ${inserted} registros (${step.model})`);
    }

    for (const stub of STUB_FILES) {
      if (existsSync(rawPath(stub.file))) {
        // BRIEF não definiu importer pra stubs — registra e pede atenção humana.
        console.log(
          `! ${stub.file}: encontrado mas não há importer (entidade stub) — me avise`,
        );
      } else {
        skipped.push({ model: stub.model, file: stub.file, reason: "stub" });
        console.log(
          `⊘ ${stub.model.toLowerCase()}: arquivo ausente, pulando (entidade stub)`,
        );
      }
    }

    const populated = Object.keys(stats).length;
    const stubs = skipped.filter((s) => s.reason === "stub").length;
    console.log(
      `[seed] Concluído. ${populated} entidade(s) populada(s), ${stubs} stub(s) aguardando dados.`,
    );

    return { stats, skipped };
  } finally {
    if (owns) await client.$disconnect();
  }
}

export function printSummary(s: Record<string, Stats>) {
  const entities = Object.keys(s).sort();
  console.log("\n=== Detalhe ===");
  for (const e of entities) {
    const st = s[e];
    console.log(
      `  ${e.padEnd(24)} inseridos=${st.inserted}  fk_unmatched=${st.unmatched.length}`,
    );
  }
  const allUnmatched = entities.flatMap((e) => s[e].unmatched);
  if (allUnmatched.length) {
    console.log(`\n=== FKs não resolvidas (${allUnmatched.length}) ===`);
    for (const u of allUnmatched.slice(0, 30)) {
      console.log(`  [${u.entity}] ${u.lookup} = "${u.raw}"`);
    }
    if (allUnmatched.length > 30) {
      console.log(`  ... e mais ${allUnmatched.length - 30}`);
    }
  }
}

// Sanity check em runtime: garante que cada model tratado aqui está no
// status registry. Catches typos cedo.
for (const step of STEPS) {
  if (ENTITY_STATUS[step.model] !== "active") {
    throw new Error(
      `Sanity check falhou: ${step.model} está em STEPS mas não é "active" no ENTITY_STATUS.`,
    );
  }
}
for (const stub of STUB_FILES) {
  if (ENTITY_STATUS[stub.model] !== "stub") {
    throw new Error(
      `Sanity check falhou: ${stub.model} está em STUB_FILES mas não é "stub" no ENTITY_STATUS.`,
    );
  }
}

export { FILE_TO_MODEL };
