/**
 * Storage abstraction.
 *
 * Em dev, grava em `public/uploads/<bucket>/<cuid>-<nome>` — o Next serve
 * direto via `/uploads/<bucket>/<arquivo>`. Em produção, troque por R2/S3
 * (credenciais já estubadas em `.env.example`) mantendo a mesma assinatura.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

export interface SavedFile {
  /** Nome único no storage (basename, sem subpasta de bucket). */
  key: string;
  /** URL pública relativa (servida pelo Next a partir de `/public`). */
  url: string;
  /** Nome original que o usuário viu antes de mandar. */
  originalName: string;
  /** MIME informado pelo browser. */
  mimetype: string;
  /** Bytes. */
  size: number;
}

const SAFE_NAME_RE = /[^a-zA-Z0-9._-]/g;

function sanitize(name: string): string {
  return name.replace(SAFE_NAME_RE, "_").slice(0, 80);
}

/**
 * Salva um File em `public/uploads/<bucket>/`. Retorna metadados e a URL
 * relativa (`/uploads/<bucket>/<key>`).
 */
export async function saveLocalFile(
  file: File,
  bucket = "default",
): Promise<SavedFile> {
  const safeBucket = bucket.replace(SAFE_NAME_RE, "_");
  const dir = path.join(process.cwd(), "public", "uploads", safeBucket);
  await mkdir(dir, { recursive: true });

  const original = file.name || "arquivo";
  const key = `${randomUUID()}-${sanitize(original)}`;
  const fullPath = path.join(dir, key);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(fullPath, buffer);

  return {
    key,
    url: `/uploads/${safeBucket}/${key}`,
    originalName: original,
    mimetype: file.type || "application/octet-stream",
    size: file.size,
  };
}
