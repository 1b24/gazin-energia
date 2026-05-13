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

/**
 * Extensões aceitas. SVG ESTÁ FORA propositalmente — SVG é um documento XML
 * que executa <script> quando servido inline, abrindo XSS na origem do app.
 * O fluxo legítimo é nota fiscal/laudo: PDFs + imagens raster bastam.
 */
const ALLOWED_EXTENSIONS = new Set([
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "csv",
  "xlsx",
  "xls",
  "json",
  "txt",
]);

/**
 * MIMEs explicitamente bloqueados — defesa em profundidade caso o browser
 * envie content-type customizado mas a extensão tenha sido aceita por engano.
 */
const BLOCKED_MIMES = new Set([
  "image/svg+xml",
  "text/html",
  "application/xhtml+xml",
  "application/javascript",
  "text/javascript",
]);

function extensionOf(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  return ext ?? "";
}

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

  const ext = extensionOf(file.name);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(
      `Extensão "${ext || "(sem)"}" não é permitida. Aceitos: ${[...ALLOWED_EXTENSIONS].join(", ")}.`,
    );
  }
  if (file.type && BLOCKED_MIMES.has(file.type.toLowerCase())) {
    throw new Error(`Tipo "${file.type}" bloqueado por segurança.`);
  }

  const saved = await saveFile(file, bucket);
  return saved.url;
}
