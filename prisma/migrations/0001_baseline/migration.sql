-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UF" AS ENUM ('AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO');

-- CreateEnum
CREATE TYPE "TipoGD" AS ENUM ('GD1', 'GD2', 'GD3');

-- CreateEnum
CREATE TYPE "LocalInstalacao" AS ENUM ('telhado', 'solo');

-- CreateEnum
CREATE TYPE "StatusUsina" AS ENUM ('em_implantacao', 'operacional', 'manutencao', 'desativada');

-- CreateEnum
CREATE TYPE "TipoProcesso" AS ENUM ('judicial', 'administrativo');

-- CreateEnum
CREATE TYPE "StatusManutencao" AS ENUM ('pendente', 'em_andamento', 'concluida');

-- CreateEnum
CREATE TYPE "TipoOrcamento" AS ENUM ('despesa_direta', 'outro');

-- CreateEnum
CREATE TYPE "StatusEntidade" AS ENUM ('ativo', 'inativo');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'gestor_filial', 'operacional');

-- CreateTable
CREATE TABLE "Filial" (
    "id" TEXT NOT NULL,
    "zohoId" TEXT,
    "codigo" TEXT,
    "cd" TEXT,
    "mercadoLivre" TEXT,
    "percentualAbsorcaoUsp" DECIMAL(7,2),
    "uc" TEXT,
    "uc2" TEXT,
    "uc3" TEXT,
    "municipio" TEXT,
    "uf" "UF",
    "senha" TEXT,
    "usuario" TEXT,
    "grupo" TEXT,
    "distribuidora" TEXT,
    "cnpj" TEXT,
    "filialClimatizada" TEXT,
    "dataClimatizacaoPlanejada" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Filial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usina" (
    "id" TEXT NOT NULL,
    "zohoId" TEXT,
    "nome" TEXT NOT NULL,
    "ccUsinas" TEXT,
    "localInstalacao" "LocalInstalacao",
    "tipoGd" "TipoGD",
    "cnpj" TEXT,
    "uc" TEXT,
    "potenciaInstaladaKw" DECIMAL(10,2),
    "potenciaProjetadaKw" DECIMAL(10,2),
    "metaKwhMes" INTEGER,
    "inicioOperacao" TIMESTAMP(3),
    "autoProdutora" BOOLEAN,
    "quantasFlAtende" INTEGER,
    "municipio" TEXT,
    "uf" "UF",
    "investimentoTotal" DECIMAL(15,2),
    "documentosProjeto" TEXT,
    "status" "StatusUsina" NOT NULL DEFAULT 'operacional',
    "filialId" TEXT,
    "filialCodigoRaw" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Usina_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fornecedor" (
    "id" TEXT NOT NULL,
    "zohoId" TEXT,
    "nome" TEXT,
    "cnpj" TEXT,
    "status" "StatusEntidade" NOT NULL DEFAULT 'ativo',
    "escopoServico" TEXT,
    "inicioPrestacao" TIMESTAMP(3),
    "terminoPrestacao" TIMESTAMP(3),
    "idContratoZoho" TEXT,
    "anexoContrato" TEXT,
    "abrangenciaUsinas" TEXT,
    "abrangenciaFilialId" TEXT,
    "abrangenciaFilialRaw" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Fornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Geracao" (
    "id" TEXT NOT NULL,
    "zohoId" TEXT,
    "ano" INTEGER,
    "mes" TEXT,
    "metaMensal" DECIMAL(12,2),
    "metaGeracao" DECIMAL(12,2),
    "usinaId" TEXT,
    "nomeUsinaRaw" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Geracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeracaoDia" (
    "id" TEXT NOT NULL,
    "geracaoId" TEXT NOT NULL,
    "dia" INTEGER NOT NULL,
    "kwh" DECIMAL(12,2),

    CONSTRAINT "GeracaoDia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendaKwh" (
    "id" TEXT NOT NULL,
    "zohoId" TEXT,
    "ano" INTEGER NOT NULL,
    "mes" TEXT NOT NULL,
    "kwhVendidos" DECIMAL(12,2),
    "valorReais" DECIMAL(15,2),
    "notaFiscalUrl" TEXT,
    "usinaId" TEXT,
    "nomeUsinaRaw" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "VendaKwh_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consumo" (
    "id" TEXT NOT NULL,
    "zohoId" TEXT,
    "ano" INTEGER,
    "mes" TEXT,
    "uc" TEXT,
    "consumoKwhP" DECIMAL(12,2),
    "consumoKwhFp" DECIMAL(12,2),
    "consumoTotal" DECIMAL(12,2),
    "injecaoRecebida" DECIMAL(12,2),
    "multasJurosAtraso" DECIMAL(15,2),
    "outrasMultas" DECIMAL(15,2),
    "valor" DECIMAL(15,2),
    "valor1" DECIMAL(15,2),
    "valor2" DECIMAL(15,2),
    "valor3" DECIMAL(15,2),
    "valorTotalFatura" DECIMAL(15,2),
    "statusAnexo" TEXT,
    "arquivoFatura" TEXT,
    "municipio" TEXT,
    "filialId" TEXT,
    "filialCodigoRaw" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Consumo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Injecao" (
    "id" TEXT NOT NULL,
    "zohoId" TEXT,
    "ano" INTEGER,
    "mes" TEXT,
    "uc" TEXT,
    "municipio" TEXT,
    "consumoKwhP" DECIMAL(12,2),
    "consumoKwhP1" DECIMAL(12,2),
    "consumoTotalKwh" DECIMAL(12,2),
    "valor" DECIMAL(15,2),
    "valor1" DECIMAL(15,2),
    "valor2" DECIMAL(15,2),
    "anexoFechamento" TEXT,
    "filialId" TEXT,
    "filialCodigoRaw" TEXT,
    "fornecedorId" TEXT,
    "fornecedorRaw" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Injecao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Orcamento" (
    "id" TEXT NOT NULL,
    "zohoId" TEXT,
    "mes" TEXT,
    "tipo" "TipoOrcamento",
    "naturezaGasto" TEXT,
    "detalhamento" TEXT,
    "equipamentos" TEXT,
    "realEquipamentos" DECIMAL(15,2),
    "realViagensEstadias" DECIMAL(15,2),
    "realUsoConsumo" DECIMAL(15,2),
    "usoConsumo" DECIMAL(15,2),
    "anexosDetalhamento" TEXT,
    "usinaId" TEXT,
    "nomeUsinaRaw" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Orcamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CronogramaLimpeza" (
    "id" TEXT NOT NULL,
    "zohoId" TEXT,
    "realizado" TEXT,
    "statusGeral" "StatusManutencao" NOT NULL DEFAULT 'pendente',
    "usinaId" TEXT,
    "nomeUsinaRaw" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CronogramaLimpeza_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LimpezaItem" (
    "id" TEXT NOT NULL,
    "cronogramaId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "dataPlanejada" TIMESTAMP(3),
    "dataConclusao" TIMESTAMP(3),
    "status" "StatusManutencao",
    "fotoUrl" TEXT,

    CONSTRAINT "LimpezaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManutencaoPreventiva" (
    "id" TEXT NOT NULL,
    "zohoId" TEXT,
    "status" "StatusManutencao" NOT NULL DEFAULT 'pendente',
    "dataExecucao" TIMESTAMP(3),
    "dataConclusao" TIMESTAMP(3),
    "laudoTecnico" TEXT,
    "fotosUsina" TEXT,
    "checklistVerificacao" TEXT,
    "usinaId" TEXT,
    "nomeUsinaRaw" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ManutencaoPreventiva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessoJuridico" (
    "id" TEXT NOT NULL,
    "zohoId" TEXT,
    "tipo" "TipoProcesso",
    "parteAdversa" TEXT,
    "pleito" TEXT,
    "dataProtocolo" TIMESTAMP(3),
    "fornecedor" TEXT,
    "evolucaoJaneiro" TEXT,
    "nomeUsinasRaw" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProcessoJuridico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Licenca" (
    "id" TEXT NOT NULL,
    "observacao" TEXT,
    "usinaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Licenca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidacaoFatura" (
    "id" TEXT NOT NULL,
    "observacao" TEXT,
    "consumoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ValidacaoFatura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemEstoque" (
    "id" TEXT NOT NULL,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ItemEstoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsertoEquipamento" (
    "id" TEXT NOT NULL,
    "observacao" TEXT,
    "usinaId" TEXT,
    "fornecedorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ConsertoEquipamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManutencaoCorretiva" (
    "id" TEXT NOT NULL,
    "observacao" TEXT,
    "usinaId" TEXT,
    "fornecedorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ManutencaoCorretiva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'operacional',
    "filialId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Documento" (
    "id" TEXT NOT NULL,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Documento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Filial_zohoId_key" ON "Filial"("zohoId");

-- CreateIndex
CREATE INDEX "Filial_codigo_idx" ON "Filial"("codigo");

-- CreateIndex
CREATE INDEX "Filial_cnpj_idx" ON "Filial"("cnpj");

-- CreateIndex
CREATE INDEX "Filial_uf_idx" ON "Filial"("uf");

-- CreateIndex
CREATE INDEX "Filial_deletedAt_idx" ON "Filial"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Usina_zohoId_key" ON "Usina"("zohoId");

-- CreateIndex
CREATE INDEX "Usina_nome_idx" ON "Usina"("nome");

-- CreateIndex
CREATE INDEX "Usina_cnpj_idx" ON "Usina"("cnpj");

-- CreateIndex
CREATE INDEX "Usina_filialId_idx" ON "Usina"("filialId");

-- CreateIndex
CREATE INDEX "Usina_status_idx" ON "Usina"("status");

-- CreateIndex
CREATE INDEX "Usina_deletedAt_idx" ON "Usina"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Fornecedor_zohoId_key" ON "Fornecedor"("zohoId");

-- CreateIndex
CREATE INDEX "Fornecedor_cnpj_idx" ON "Fornecedor"("cnpj");

-- CreateIndex
CREATE INDEX "Fornecedor_status_idx" ON "Fornecedor"("status");

-- CreateIndex
CREATE INDEX "Fornecedor_abrangenciaFilialId_idx" ON "Fornecedor"("abrangenciaFilialId");

-- CreateIndex
CREATE INDEX "Fornecedor_deletedAt_idx" ON "Fornecedor"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Geracao_zohoId_key" ON "Geracao"("zohoId");

-- CreateIndex
CREATE INDEX "Geracao_usinaId_idx" ON "Geracao"("usinaId");

-- CreateIndex
CREATE INDEX "Geracao_ano_mes_idx" ON "Geracao"("ano", "mes");

-- CreateIndex
CREATE INDEX "Geracao_deletedAt_idx" ON "Geracao"("deletedAt");

-- CreateIndex
CREATE INDEX "GeracaoDia_geracaoId_idx" ON "GeracaoDia"("geracaoId");

-- CreateIndex
CREATE UNIQUE INDEX "GeracaoDia_geracaoId_dia_key" ON "GeracaoDia"("geracaoId", "dia");

-- CreateIndex
CREATE INDEX "VendaKwh_usinaId_idx" ON "VendaKwh"("usinaId");

-- CreateIndex
CREATE INDEX "VendaKwh_ano_mes_idx" ON "VendaKwh"("ano", "mes");

-- CreateIndex
CREATE INDEX "VendaKwh_deletedAt_idx" ON "VendaKwh"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "VendaKwh_zohoId_ano_mes_key" ON "VendaKwh"("zohoId", "ano", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "Consumo_zohoId_key" ON "Consumo"("zohoId");

-- CreateIndex
CREATE INDEX "Consumo_filialId_idx" ON "Consumo"("filialId");

-- CreateIndex
CREATE INDEX "Consumo_ano_mes_idx" ON "Consumo"("ano", "mes");

-- CreateIndex
CREATE INDEX "Consumo_uc_idx" ON "Consumo"("uc");

-- CreateIndex
CREATE INDEX "Consumo_deletedAt_idx" ON "Consumo"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Injecao_zohoId_key" ON "Injecao"("zohoId");

-- CreateIndex
CREATE INDEX "Injecao_filialId_idx" ON "Injecao"("filialId");

-- CreateIndex
CREATE INDEX "Injecao_fornecedorId_idx" ON "Injecao"("fornecedorId");

-- CreateIndex
CREATE INDEX "Injecao_ano_mes_idx" ON "Injecao"("ano", "mes");

-- CreateIndex
CREATE INDEX "Injecao_uc_idx" ON "Injecao"("uc");

-- CreateIndex
CREATE INDEX "Injecao_deletedAt_idx" ON "Injecao"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Orcamento_zohoId_key" ON "Orcamento"("zohoId");

-- CreateIndex
CREATE INDEX "Orcamento_usinaId_idx" ON "Orcamento"("usinaId");

-- CreateIndex
CREATE INDEX "Orcamento_mes_idx" ON "Orcamento"("mes");

-- CreateIndex
CREATE INDEX "Orcamento_deletedAt_idx" ON "Orcamento"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CronogramaLimpeza_zohoId_key" ON "CronogramaLimpeza"("zohoId");

-- CreateIndex
CREATE INDEX "CronogramaLimpeza_usinaId_idx" ON "CronogramaLimpeza"("usinaId");

-- CreateIndex
CREATE INDEX "CronogramaLimpeza_statusGeral_idx" ON "CronogramaLimpeza"("statusGeral");

-- CreateIndex
CREATE INDEX "CronogramaLimpeza_deletedAt_idx" ON "CronogramaLimpeza"("deletedAt");

-- CreateIndex
CREATE INDEX "LimpezaItem_cronogramaId_idx" ON "LimpezaItem"("cronogramaId");

-- CreateIndex
CREATE INDEX "LimpezaItem_dataPlanejada_idx" ON "LimpezaItem"("dataPlanejada");

-- CreateIndex
CREATE UNIQUE INDEX "LimpezaItem_cronogramaId_ordem_key" ON "LimpezaItem"("cronogramaId", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "ManutencaoPreventiva_zohoId_key" ON "ManutencaoPreventiva"("zohoId");

-- CreateIndex
CREATE INDEX "ManutencaoPreventiva_usinaId_idx" ON "ManutencaoPreventiva"("usinaId");

-- CreateIndex
CREATE INDEX "ManutencaoPreventiva_status_idx" ON "ManutencaoPreventiva"("status");

-- CreateIndex
CREATE INDEX "ManutencaoPreventiva_dataExecucao_idx" ON "ManutencaoPreventiva"("dataExecucao");

-- CreateIndex
CREATE INDEX "ManutencaoPreventiva_deletedAt_idx" ON "ManutencaoPreventiva"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessoJuridico_zohoId_key" ON "ProcessoJuridico"("zohoId");

-- CreateIndex
CREATE INDEX "ProcessoJuridico_tipo_idx" ON "ProcessoJuridico"("tipo");

-- CreateIndex
CREATE INDEX "ProcessoJuridico_dataProtocolo_idx" ON "ProcessoJuridico"("dataProtocolo");

-- CreateIndex
CREATE INDEX "ProcessoJuridico_deletedAt_idx" ON "ProcessoJuridico"("deletedAt");

-- CreateIndex
CREATE INDEX "Licenca_usinaId_idx" ON "Licenca"("usinaId");

-- CreateIndex
CREATE INDEX "Licenca_deletedAt_idx" ON "Licenca"("deletedAt");

-- CreateIndex
CREATE INDEX "ValidacaoFatura_consumoId_idx" ON "ValidacaoFatura"("consumoId");

-- CreateIndex
CREATE INDEX "ValidacaoFatura_deletedAt_idx" ON "ValidacaoFatura"("deletedAt");

-- CreateIndex
CREATE INDEX "ItemEstoque_deletedAt_idx" ON "ItemEstoque"("deletedAt");

-- CreateIndex
CREATE INDEX "ConsertoEquipamento_usinaId_idx" ON "ConsertoEquipamento"("usinaId");

-- CreateIndex
CREATE INDEX "ConsertoEquipamento_fornecedorId_idx" ON "ConsertoEquipamento"("fornecedorId");

-- CreateIndex
CREATE INDEX "ConsertoEquipamento_deletedAt_idx" ON "ConsertoEquipamento"("deletedAt");

-- CreateIndex
CREATE INDEX "ManutencaoCorretiva_usinaId_idx" ON "ManutencaoCorretiva"("usinaId");

-- CreateIndex
CREATE INDEX "ManutencaoCorretiva_fornecedorId_idx" ON "ManutencaoCorretiva"("fornecedorId");

-- CreateIndex
CREATE INDEX "ManutencaoCorretiva_deletedAt_idx" ON "ManutencaoCorretiva"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_filialId_idx" ON "User"("filialId");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE INDEX "Documento_deletedAt_idx" ON "Documento"("deletedAt");

-- AddForeignKey
ALTER TABLE "Usina" ADD CONSTRAINT "Usina_filialId_fkey" FOREIGN KEY ("filialId") REFERENCES "Filial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fornecedor" ADD CONSTRAINT "Fornecedor_abrangenciaFilialId_fkey" FOREIGN KEY ("abrangenciaFilialId") REFERENCES "Filial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Geracao" ADD CONSTRAINT "Geracao_usinaId_fkey" FOREIGN KEY ("usinaId") REFERENCES "Usina"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeracaoDia" ADD CONSTRAINT "GeracaoDia_geracaoId_fkey" FOREIGN KEY ("geracaoId") REFERENCES "Geracao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendaKwh" ADD CONSTRAINT "VendaKwh_usinaId_fkey" FOREIGN KEY ("usinaId") REFERENCES "Usina"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consumo" ADD CONSTRAINT "Consumo_filialId_fkey" FOREIGN KEY ("filialId") REFERENCES "Filial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Injecao" ADD CONSTRAINT "Injecao_filialId_fkey" FOREIGN KEY ("filialId") REFERENCES "Filial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Injecao" ADD CONSTRAINT "Injecao_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orcamento" ADD CONSTRAINT "Orcamento_usinaId_fkey" FOREIGN KEY ("usinaId") REFERENCES "Usina"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CronogramaLimpeza" ADD CONSTRAINT "CronogramaLimpeza_usinaId_fkey" FOREIGN KEY ("usinaId") REFERENCES "Usina"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LimpezaItem" ADD CONSTRAINT "LimpezaItem_cronogramaId_fkey" FOREIGN KEY ("cronogramaId") REFERENCES "CronogramaLimpeza"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManutencaoPreventiva" ADD CONSTRAINT "ManutencaoPreventiva_usinaId_fkey" FOREIGN KEY ("usinaId") REFERENCES "Usina"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Licenca" ADD CONSTRAINT "Licenca_usinaId_fkey" FOREIGN KEY ("usinaId") REFERENCES "Usina"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidacaoFatura" ADD CONSTRAINT "ValidacaoFatura_consumoId_fkey" FOREIGN KEY ("consumoId") REFERENCES "Consumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsertoEquipamento" ADD CONSTRAINT "ConsertoEquipamento_usinaId_fkey" FOREIGN KEY ("usinaId") REFERENCES "Usina"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsertoEquipamento" ADD CONSTRAINT "ConsertoEquipamento_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManutencaoCorretiva" ADD CONSTRAINT "ManutencaoCorretiva_usinaId_fkey" FOREIGN KEY ("usinaId") REFERENCES "Usina"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManutencaoCorretiva" ADD CONSTRAINT "ManutencaoCorretiva_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_filialId_fkey" FOREIGN KEY ("filialId") REFERENCES "Filial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

