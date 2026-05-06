"use server";

/**
 * Upload server action — recebe um arquivo via FormData e devolve a URL
 * pública. Usado pelo `<FileField />` do entity-form.
 *
 * `bucket` é livre — convencionalmente o nome da entidade ("venda-kwh",
 * "fornecedores", etc) pra que cada model tenha sua subpasta.
 */
import { saveLocalFile } from "@/lib/storage";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB — suficiente pra PDFs/JPGs de NF.

export async function uploadFile(formData: FormData): Promise<string> {
  const file = formData.get("file");
  const bucket = String(formData.get("bucket") ?? "default");

  if (!(file instanceof File)) {
    throw new Error("Arquivo não fornecido.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error(
      `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Limite: 25 MB.`,
    );
  }

  const saved = await saveLocalFile(file, bucket);
  return saved.url;
}
