/**
 * Autorização fina para `/api/files/<bucket>/<key>`.
 *
 * Antes do Step 7 do refactor 2026-05-foundations, qualquer usuário
 * autenticado conseguia baixar QUALQUER arquivo enviado por upload —
 * incluindo notas fiscais e laudos de outras filiais. Esta camada resolve
 * "qual entidade do domínio aponta para esta URL" e checa via
 * `userCanAccessId` se o usuário tem escopo sobre ela.
 *
 * Política:
 *   - admin: pode tudo, desde que o arquivo exista no DB.
 *   - gestor_filial / operacional: só os arquivos das entidades que ele já
 *     veria via `scopedPrisma`.
 *   - arquivo órfão (não referenciado por nenhuma entidade ATIVA): NEGADO
 *     mesmo para admin. Reduz surface — uploads antigos / esquecidos não
 *     ficam acessíveis para sempre.
 *
 * Campos varridos (todos os `String?` que armazenam URL de arquivo no
 * schema atual):
 *   - Consumo.arquivoFatura
 *   - Injecao.anexoFechamento
 *   - VendaKwh.notaFiscalUrl
 *   - Orcamento.anexosDetalhamento
 *   - ManutencaoPreventiva.{laudoTecnico, fotosUsina, checklistVerificacao}
 *   - Fornecedor.anexoContrato
 *
 * Fornecedor não está no `MODEL_SCOPE` de `lib/db.ts` (entidade global com
 * vínculo opcional `abrangenciaFilialId`), então `userCanAccessId` retornaria
 * `true` para qualquer não-admin — perderíamos o escopo. Aqui tratamos
 * manualmente: checa `abrangenciaFilialId === user.filialId`.
 */
import { prisma, userCanAccessId, type ScopedUser } from "@/lib/db";

type EntityWithFile =
  | "Consumo"
  | "Injecao"
  | "VendaKwh"
  | "Orcamento"
  | "ManutencaoPreventiva"
  | "Fornecedor";

export interface FileOwnership {
  entityModel: EntityWithFile;
  entityId: string;
  /**
   * Preenchido apenas para Fornecedor — necessário para o check manual de
   * escopo (Fornecedor não está em MODEL_SCOPE).
   */
  abrangenciaFilialId?: string | null;
}

/**
 * Procura qual entidade ATIVA aponta para a URL `/api/files/<bucket>/<key>`.
 * Retorna a primeira ocorrência encontrada ou `null` (arquivo órfão).
 *
 * Notas:
 *   - Roda queries em paralelo para minimizar latência (Promise.all).
 *   - Filtra `deletedAt: null` em todos — arquivos de entidades arquivadas
 *     não são servidos. Restaurar a entidade reabilita o acesso.
 *   - Se a mesma URL aparecer em entidades diferentes (raro, mas possível
 *     com colisão de UUID externo), retorna a primeira no order da lista.
 */
export async function resolveFileOwnership(
  bucket: string,
  key: string,
): Promise<FileOwnership | null> {
  const url = `/api/files/${bucket}/${key}`;

  const [consumo, injecao, vendaKwh, orcamento, preventiva, fornecedor] =
    await Promise.all([
      prisma.consumo.findFirst({
        where: { arquivoFatura: url, deletedAt: null },
        select: { id: true },
      }),
      prisma.injecao.findFirst({
        where: { anexoFechamento: url, deletedAt: null },
        select: { id: true },
      }),
      prisma.vendaKwh.findFirst({
        where: { notaFiscalUrl: url, deletedAt: null },
        select: { id: true },
      }),
      prisma.orcamento.findFirst({
        where: { anexosDetalhamento: url, deletedAt: null },
        select: { id: true },
      }),
      prisma.manutencaoPreventiva.findFirst({
        where: {
          deletedAt: null,
          OR: [
            { laudoTecnico: url },
            { fotosUsina: url },
            { checklistVerificacao: url },
          ],
        },
        select: { id: true },
      }),
      prisma.fornecedor.findFirst({
        where: { anexoContrato: url, deletedAt: null },
        select: { id: true, abrangenciaFilialId: true },
      }),
    ]);

  if (consumo) return { entityModel: "Consumo", entityId: consumo.id };
  if (injecao) return { entityModel: "Injecao", entityId: injecao.id };
  if (vendaKwh) return { entityModel: "VendaKwh", entityId: vendaKwh.id };
  if (orcamento) return { entityModel: "Orcamento", entityId: orcamento.id };
  if (preventiva) {
    return { entityModel: "ManutencaoPreventiva", entityId: preventiva.id };
  }
  if (fornecedor) {
    return {
      entityModel: "Fornecedor",
      entityId: fornecedor.id,
      abrangenciaFilialId: fornecedor.abrangenciaFilialId,
    };
  }
  return null;
}

/**
 * `true` se `user` pode acessar o arquivo identificado por `bucket`/`key`.
 *
 * - Admin: permite, desde que o arquivo exista (não-órfão).
 * - Demais roles: precisa ter escopo sobre a entidade dona via
 *   `userCanAccessId`. Para Fornecedor (não escopado), checa
 *   `abrangenciaFilialId` manualmente contra `user.filialId`.
 * - Arquivo órfão (não referenciado por entidade ATIVA): nega.
 *
 * Não loga acesso — auditoria de leitura de arquivo está fora deste escopo
 * (audit obrigatório vive em `lib/audit.ts` para mutações).
 */
export async function userCanAccessFile(
  user: ScopedUser,
  bucket: string,
  key: string,
): Promise<boolean> {
  const owner = await resolveFileOwnership(bucket, key);
  if (!owner) return false; // órfão sempre nega

  if (user?.role === "admin") return true;
  if (!user || !user.filialId) return false;

  if (owner.entityModel === "Fornecedor") {
    return owner.abrangenciaFilialId === user.filialId;
  }

  const modelLower =
    owner.entityModel.charAt(0).toLowerCase() + owner.entityModel.slice(1);
  return userCanAccessId(user, modelLower, owner.entityId);
}
