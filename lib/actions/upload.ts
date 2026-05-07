"use server";

/**
 * Upload server action — recebe um arquivo via FormData e devolve a URL
 * (rota `/api/files/<bucket>/<key>`, protegida por sessão).
 *
 * Backend (local FS ou S3/R2) é escolhido em runtime pelo `lib/storage.ts`.
 * Apenas usuários autenticados podem fazer upload.
 */
import { auth } from "@/lib/auth";
import { saveFile } from "@/lib/storage";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB — suficiente pra PDFs/JPGs de NF.

/**
 * Buckets aceitos. Cada entidade que usa `type: "file"` no FormFieldConfig
 * registra seu nome aqui. Tentativas com bucket fora dessa lista são rejeitadas
 * — impede gestor_filial subir arquivo num bucket arbitrário.
 */
const ALLOWED_BUCKETS = new Set([
  "default",
  "venda-kwh",
  "consumo",
  "injecao",
  "orcamento",
  "manutencao-preventiva",
]);

export async function uploadFile(formData: FormData): Promise<string> {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Não autenticado.");
  }

  const file = formData.get("file");
  const bucket = String(formData.get("bucket") ?? "default");

  if (!ALLOWED_BUCKETS.has(bucket)) {
    throw new Error(`Bucket inválido: "${bucket}".`);
  }
  if (!(file instanceof File)) {
    throw new Error("Arquivo não fornecido.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error(
      `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Limite: 25 MB.`,
    );
  }

  const saved = await saveFile(file, bucket);
  return saved.url;
}
