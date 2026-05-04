/**
 * Imports the legacy Zoho JSON dumps from `data/raw/` into Postgres via Prisma.
 *
 * Idempotent: each entity stores its original Zoho `ID` as `zohoId @unique` and
 * is upserted by that key. Re-running the script is safe.
 *
 * Cross-references between entities (Geração → Usina, Consumo → Filial, ...) are
 * resolved by name/code lookups built from the already-imported parents. Misses
 * are logged but never abort the run; the original raw value is preserved on the
 * row in a `*Raw` column for later reconciliation.
 */
import "dotenv/config";
import type { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createPrismaClient } from "@/lib/db";
import {
  mesAbbrPtToNumber,
  nullIfEmpty,
  parseCNPJ,
  parseLooseDate,
  parseLooseInt,
  parseLooseNumber,
} from "@/lib/format";

const RAW_DIR = path.join(process.cwd(), "data", "raw");

// File names exactly as they sit in data/raw/ (with the typos and accents).
const FILES = {
  filiais: "Usinas Relatório.json",
  usinas: "Cadástro de usinas Relatório.json",
  fornecedores: "Cadastro de fornecedores Relatório.json",
  geracao: "Geração Usinas Relatório.json",
  vendaKwh: "Venda de energia elétrica Relatório.json",
  consumo: "Consumo Relatório.json",
  injecao: "Controle de injeção Relatório.json",
  orcamento: "Cadastro de orçamento Relatório.json",
  limpeza: "Cronograma de limpeza - report.json",
  preventiva: "Cronograma de manutenção preventiva Relatório.json",
  processos: "Processos ADMs e Judiciais, Relatório.json",
} as const;

type Row = Record<string, unknown>;

async function loadJson(file: string): Promise<Row[]> {
  const raw = await readFile(path.join(RAW_DIR, file), "utf-8");
  const parsed = JSON.parse(raw);
  // Each Zoho dump has a single top-level key like `Cadastro_de_..._Report`.
  const key = Object.keys(parsed)[0];
  return parsed[key] as Row[];
}

function asString(r: Row, k: string): string | null {
  return nullIfEmpty(r[k]);
}

// Decimal columns in Prisma accept string | number | Decimal. Pass through as
// number; Prisma serializes appropriately.
function asNumber(r: Row, k: string): number | null {
  return parseLooseNumber(r[k]);
}

function asInt(r: Row, k: string): number | null {
  return parseLooseInt(r[k]);
}

function asDate(r: Row, k: string): Date | null {
  return parseLooseDate(r[k]);
}

interface Stats {
  inserted: number;
  unmatched: { entity: string; lookup: string; raw: string }[];
}

const stats: Record<string, Stats> = {};

function track(entity: string) {
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

// ---------------------------------------------------------------------------
// Importers — one per JSON. Each returns nothing; mutations happen via prisma.
// ---------------------------------------------------------------------------

async function importFiliais(prisma: PrismaClient) {
  const rows = await loadJson(FILES.filiais);
  for (const r of rows) {
    const zohoId = asString(r, "ID");
    if (!zohoId) continue;
    await prisma.filial.upsert({
      where: { zohoId },
      create: {
        zohoId,
        codigo: asString(r, "Filial"),
        cd: asString(r, "CD"),
        mercadoLivre: asString(r, "Mercado_Livre"),
        percentualAbsorcaoUsp: asNumber(r, "Percentual_absor_o_USP"),
        uc: asString(r, "UC"),
        uc2: asString(r, "UC_2"),
        uc3: asString(r, "UC_3"),
        municipio: asString(r, "Munic_pio"),
        uf: asString(r, "UF"),
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
      },
      update: {
        codigo: asString(r, "Filial"),
        mercadoLivre: asString(r, "Mercado_Livre"),
        municipio: asString(r, "Munic_pio"),
        uf: asString(r, "UF"),
        grupo: asString(r, "Grupo"),
        distribuidora: asString(r, "Distribuidora1"),
        cnpj: asString(r, "CNPJ"),
      },
    });
    track("Filial").inserted++;
  }
}

async function buildFilialCodeMap(prisma: PrismaClient) {
  const all = await prisma.filial.findMany({
    where: { codigo: { not: null } },
    select: { id: true, codigo: true },
  });
  const map = new Map<string, number>();
  for (const f of all) if (f.codigo) map.set(f.codigo, f.id);
  return map;
}

async function importUsinas(prisma: PrismaClient) {
  const rows = await loadJson(FILES.usinas);
  const filialMap = await buildFilialCodeMap(prisma);

  for (const r of rows) {
    const zohoId = asString(r, "ID");
    if (!zohoId) continue;

    const filialCodigoRaw = asString(r, "Filial");
    const filialId = filialCodigoRaw ? filialMap.get(filialCodigoRaw) : undefined;
    if (filialCodigoRaw && !filialId) {
      logUnmatched("Usina", "Filial", filialCodigoRaw);
    }

    const cnpjRaw = asString(r, "CNPJ");
    const cnpj = cnpjRaw ? parseCNPJ(cnpjRaw) : null;

    const data = {
      nome: asString(r, "Nome"),
      ccUsinas: asString(r, "CC_usinas"),
      tipo: asString(r, "Tipo"),
      tipoGd: asString(r, "Tipo_de_GD"),
      cnpj,
      uc: asString(r, "UC"),
      potenciaKwp: asNumber(r, "Pot_ncia_kWp"),
      potenciaKwp1: asNumber(r, "Pot_ncia_kWp1"),
      metaKwhMes: asInt(r, "Meta_kwh_m_s"),
      inicioOperacao: asDate(r, "Inicio_de_opera_o"),
      autoProdutora: asString(r, "Auto_produtora"),
      quantasFlAtende: asInt(r, "Quantas_Fl_atende"),
      municipio: asString(r, "Munic_pio"),
      uf: asString(r, "UF"),
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
    where: { nome: { not: null } },
    select: { id: true, nome: true },
  });
  const map = new Map<string, number>();
  for (const u of all) if (u.nome) map.set(u.nome.trim(), u.id);
  return map;
}

function lookupUsina(
  map: Map<string, number>,
  raw: string | null,
  caller: string,
): number | null {
  if (!raw) return null;
  const id = map.get(raw.trim());
  if (!id) logUnmatched(caller, "Nome_da_usina", raw);
  return id ?? null;
}

async function importFornecedores(prisma: PrismaClient) {
  const rows = await loadJson(FILES.fornecedores);
  const filialMap = await buildFilialCodeMap(prisma);

  for (const r of rows) {
    const zohoId = asString(r, "ID");
    if (!zohoId) continue;

    const filialCodigoRaw = asString(r, "Abrang_ncia_filial");
    const filialId = filialCodigoRaw ? filialMap.get(filialCodigoRaw) : undefined;
    if (filialCodigoRaw && !filialId) {
      logUnmatched("Fornecedor", "Abrang_ncia_filial", filialCodigoRaw);
    }

    const data = {
      nome: asString(r, "Nome"),
      cnpj: asString(r, "CNPJ"),
      status: asString(r, "Status"),
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
  const rows = await loadJson(FILES.geracao);
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

    // Daily values: Single_Line1..Single_Line31 → dias 1..31.
    // `Single_Line` (no suffix) is ignored — its meaning isn't documented.
    for (let dia = 1; dia <= 31; dia++) {
      const key = `Single_Line${dia}`;
      const kwh = asNumber(r, key);
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
  const rows = await loadJson(FILES.vendaKwh);
  const usinaMap = await buildUsinaNameMap(prisma);
  const ABBR = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

  for (const r of rows) {
    const zohoId = asString(r, "ID");
    if (!zohoId) continue;
    const nomeUsinaRaw = asString(r, "Nome_da_usina");
    const usinaId = lookupUsina(usinaMap, nomeUsinaRaw, "VendaKwhMes");
    const notaFiscal = asString(r, "Nota_fiscal_da_venda");

    // Years observed in the dump are all 2026 — but read whichever year suffix
    // is present so future dumps with 2027 etc. still work.
    const years = new Set<number>();
    for (const k of Object.keys(r)) {
      const m = /_([A-Z]{3})_(\d{4})$/.exec(k);
      if (m) years.add(Number(m[2]));
    }

    for (const year of years) {
      for (const abbr of ABBR) {
        const kwhKey = `Total_de_KWh_vendidos_${abbr}_${year}`;
        const valKey = `Total_de_KWh_vendidos_em_R_${abbr}_${year}`;
        const kwh = asNumber(r, kwhKey);
        const val = asNumber(r, valKey);
        if (kwh == null && val == null) continue;
        const mesNum = mesAbbrPtToNumber(abbr);
        if (!mesNum) continue;
        await prisma.vendaKwhMes.upsert({
          where: {
            zohoId_ano_mes: {
              zohoId,
              ano: year,
              mes: String(mesNum).padStart(2, "0"),
            },
          },
          create: {
            zohoId,
            ano: year,
            mes: String(mesNum).padStart(2, "0"),
            kwhVendidos: kwh,
            valorReais: val,
            notaFiscalUrl: notaFiscal,
            usinaId,
            nomeUsinaRaw,
          },
          update: {
            kwhVendidos: kwh,
            valorReais: val,
            notaFiscalUrl: notaFiscal,
            usinaId,
            nomeUsinaRaw,
          },
        });
        track("VendaKwhMes").inserted++;
      }
    }
  }
}

async function importConsumo(prisma: PrismaClient) {
  const rows = await loadJson(FILES.consumo);
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
  const rows = await loadJson(FILES.injecao);
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
  const rows = await loadJson(FILES.orcamento);
  const usinaMap = await buildUsinaNameMap(prisma);

  for (const r of rows) {
    const zohoId = asString(r, "ID");
    if (!zohoId) continue;
    const nomeUsinaRaw = asString(r, "Nome_da_usina");
    const usinaId = lookupUsina(usinaMap, nomeUsinaRaw, "Orcamento");

    const data = {
      mes: asString(r, "M_s"),
      tipo: asString(r, "Tipo"),
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
  const rows = await loadJson(FILES.limpeza);
  const usinaMap = await buildUsinaNameMap(prisma);

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
        statusGeral: asString(r, "Status"),
        usinaId,
        nomeUsinaRaw,
      },
      update: {
        realizado: asString(r, "Realizado"),
        statusGeral: asString(r, "Status"),
        usinaId,
        nomeUsinaRaw,
      },
    });

    // The JSON has a quirky pattern: Limpeza, Limpeza_2, Limpeza_3, Limpeza_21,
    // Limpeza_5, Limpeza_6 — six occurrences. We map them positionally to
    // ordens 1..6 for stability across reruns.
    const limpezaKeys: { ordem: number; data: string; concl: string; status: string; foto: string }[] = [
      { ordem: 1, data: "Limpeza",    concl: "Data_de_conclus_o",   status: "Status1", foto: "Foto_da_limpeza" },
      { ordem: 2, data: "Limpeza_2",  concl: "Data_de_conclus_o_2", status: "Status2", foto: "Fotos_da_limpeza_2" },
      { ordem: 3, data: "Limpeza_3",  concl: "Data_de_conclus_o_3", status: "Status3", foto: "Fotos_da_limpeza_3" },
      { ordem: 4, data: "Limpeza_21", concl: "Data_de_conclus_o_4", status: "Status4", foto: "Foto_da_limpeza_4" },
      { ordem: 5, data: "Limpeza_5",  concl: "Data_de_conclus_o_5", status: "",        foto: "Foto_da_limpeza_5" },
      { ordem: 6, data: "Limpeza_6",  concl: "Data_de_conclus_o_6", status: "",        foto: "" },
    ];

    for (const k of limpezaKeys) {
      const dataPlanejada = asDate(r, k.data);
      const dataConclusao = asDate(r, k.concl);
      const status = k.status ? asString(r, k.status) : null;
      const fotoUrl = k.foto ? asString(r, k.foto) : null;
      if (!dataPlanejada && !dataConclusao && !status && !fotoUrl) continue;

      await prisma.limpezaItem.upsert({
        where: { cronogramaId_ordem: { cronogramaId: cronograma.id, ordem: k.ordem } },
        create: {
          cronogramaId: cronograma.id,
          ordem: k.ordem,
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
  const rows = await loadJson(FILES.preventiva);
  const usinaMap = await buildUsinaNameMap(prisma);

  for (const r of rows) {
    const zohoId = asString(r, "ID");
    if (!zohoId) continue;
    const nomeUsinaRaw = asString(r, "Nome_da_usina");
    const usinaId = lookupUsina(usinaMap, nomeUsinaRaw, "ManutencaoPreventiva");

    const data = {
      status: asString(r, "Status"),
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
  const rows = await loadJson(FILES.processos);
  for (const r of rows) {
    const zohoId = asString(r, "ID");
    if (!zohoId) continue;

    const data = {
      tipo: asString(r, "Tipo"),
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

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function runImport(prisma?: PrismaClient): Promise<Record<string, Stats>> {
  const owns = !prisma;
  const client = prisma ?? createPrismaClient();
  try {
    // Dependency order: Filial → Usina → everything else.
    await importFiliais(client);
    await importUsinas(client);
    await importFornecedores(client);
    await importGeracao(client);
    await importVendaKwh(client);
    await importConsumo(client);
    await importInjecao(client);
    await importOrcamento(client);
    await importLimpeza(client);
    await importPreventiva(client);
    await importProcessos(client);
    return stats;
  } finally {
    if (owns) await client.$disconnect();
  }
}

export function printSummary(s: Record<string, Stats>) {
  const entities = Object.keys(s).sort();
  console.log("\n=== Import summary ===");
  for (const e of entities) {
    const st = s[e];
    console.log(`  ${e.padEnd(24)} inserted=${st.inserted}  unmatched=${st.unmatched.length}`);
  }
  // Detailed unmatched references (truncated).
  const allUnmatched = entities.flatMap((e) => s[e].unmatched);
  if (allUnmatched.length) {
    console.log(`\n=== Unmatched references (${allUnmatched.length}) ===`);
    for (const u of allUnmatched.slice(0, 30)) {
      console.log(`  [${u.entity}] ${u.lookup} = "${u.raw}"`);
    }
    if (allUnmatched.length > 30) {
      console.log(`  ... and ${allUnmatched.length - 30} more`);
    }
  }
}

// CLI entrypoint when run directly via `tsx scripts/import-raw.ts`.
const isDirect = (() => {
  try {
    return process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, "/")}`).href;
  } catch {
    return false;
  }
})();

if (isDirect) {
  runImport()
    .then((s) => {
      printSummary(s);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
