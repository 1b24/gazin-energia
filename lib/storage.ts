/**
 * Storage abstraction com 2 backends:
 *
 *  - Local (dev): grava em `private-uploads/<bucket>/<key>` FORA de
 *    `public/` — arquivos NÃO ficam acessíveis sem passar pela rota
 *    `/api/files/<bucket>/<key>` (que checa sessão).
 *
 *  - S3-compatível (prod, ex: Cloudflare R2): se as variáveis de ambiente
 *    `STORAGE_S3_*` estiverem setadas, grava no bucket privado e devolve
 *    presigned URL via `getReadUrl(key)`. Bucket é privado por padrão.
 *
 * Backend é escolhido em runtime via `chooseBackend()`. URL pública dos
 * arquivos sempre fica em `/api/files/<bucket>/<key>` — a rota decide se
 * stream do disco ou redirect pra presigned R2.
 */
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface SavedFile {
  key: string;
  url: string;
  originalName: string;
  mimetype: string;
  size: number;
}

const SAFE_NAME_RE = /[^a-zA-Z0-9._-]/g;
const PRESIGNED_TTL_SECONDS = 60 * 15; // 15min

function sanitize(name: string): string {
  return name.replace(SAFE_NAME_RE, "_").slice(0, 80);
}

function safeBucket(bucket: string) {
  return bucket.replace(SAFE_NAME_RE, "_");
}

// ----------------------------------------------------------------------------
// Backend dispatch
// ----------------------------------------------------------------------------

function s3Client(): S3Client | null {
  const endpoint = process.env.STORAGE_S3_ENDPOINT;
  const region = process.env.STORAGE_S3_REGION ?? "auto";
  const accessKeyId = process.env.STORAGE_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.STORAGE_S3_SECRET_ACCESS_KEY;
  const bucketName = process.env.STORAGE_S3_BUCKET;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucketName) return null;
  return new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}

function s3BucketName(): string {
  const b = process.env.STORAGE_S3_BUCKET;
  if (!b) throw new Error("STORAGE_S3_BUCKET não setado");
  return b;
}

export type StorageBackend = "s3" | "local";

export function activeBackend(): StorageBackend {
  return s3Client() ? "s3" : "local";
}

// ----------------------------------------------------------------------------
// Save
// ----------------------------------------------------------------------------

export async function saveFile(
  file: File,
  bucket = "default",
): Promise<SavedFile> {
  const original = file.name || "arquivo";
  const key = `${randomUUID()}-${sanitize(original)}`;
  const bucketSafe = safeBucket(bucket);
  const buffer = Buffer.from(await file.arrayBuffer());

  const client = s3Client();
  if (client) {
    const objectKey = `${bucketSafe}/${key}`;
    await client.send(
      new PutObjectCommand({
        Bucket: s3BucketName(),
        Key: objectKey,
        Body: buffer,
        ContentType: file.type || "application/octet-stream",
        Metadata: { "original-name": original },
      }),
    );
  } else {
    const dir = path.join(process.cwd(), "private-uploads", bucketSafe);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, key), buffer);
  }

  return {
    key,
    // URL roteia pelo handler protegido — nunca expõe o backend direto.
    url: `/api/files/${bucketSafe}/${key}`,
    originalName: original,
    mimetype: file.type || "application/octet-stream",
    size: file.size,
  };
}

// ----------------------------------------------------------------------------
// Read (usado pelo route handler protegido)
// ----------------------------------------------------------------------------

export interface ReadResult {
  /** Para local: payload binário; para s3: presigned URL pra redirect. */
  kind: "buffer" | "redirect";
  buffer?: Buffer;
  redirectUrl?: string;
  mimetype?: string;
  filename?: string;
  size?: number;
}

export async function readFileFor(
  bucket: string,
  key: string,
): Promise<ReadResult | null> {
  const bucketSafe = safeBucket(bucket);
  const safeKey = key.replace(/[/\\]/g, ""); // não permite path traversal

  const client = s3Client();
  if (client) {
    const objectKey = `${bucketSafe}/${safeKey}`;
    try {
      const url = await getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: s3BucketName(), Key: objectKey }),
        { expiresIn: PRESIGNED_TTL_SECONDS },
      );
      return { kind: "redirect", redirectUrl: url };
    } catch {
      return null;
    }
  }

  const filePath = path.join(
    process.cwd(),
    "private-uploads",
    bucketSafe,
    safeKey,
  );
  try {
    const st = await stat(filePath);
    const buffer = await readFile(filePath);
    return {
      kind: "buffer",
      buffer,
      // Mimetype simples por extensão — o /api route adiciona Content-Type.
      filename: safeKey,
      size: st.size,
    };
  } catch {
    return null;
  }
}
