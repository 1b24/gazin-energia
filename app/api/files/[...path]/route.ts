/**
 * Rota protegida pra servir arquivos enviados via `lib/storage.ts`.
 *
 * - Local backend: stream do payload do disco.
 * - S3/R2 backend: 302 redirect pra presigned URL (válida por 15min).
 *
 * Sempre exige sessão autenticada — bucket em si é privado por design.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { readFileFor } from "@/lib/storage";

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  json: "application/json",
};

function mimeOf(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  return (ext && MIME_BY_EXT[ext]) || "application/octet-stream";
}

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse("Não autenticado.", { status: 401 });
  }

  const { path } = await params;
  if (!path || path.length < 2) {
    return new NextResponse("Caminho inválido.", { status: 400 });
  }
  const [bucket, ...keyParts] = path;
  const key = keyParts.join("/");

  const result = await readFileFor(bucket, key);
  if (!result) {
    return new NextResponse("Arquivo não encontrado.", { status: 404 });
  }

  if (result.kind === "redirect" && result.redirectUrl) {
    return NextResponse.redirect(result.redirectUrl);
  }

  if (result.kind === "buffer" && result.buffer) {
    const filename = result.filename ?? key;
    return new NextResponse(new Uint8Array(result.buffer), {
      headers: {
        "Content-Type": mimeOf(filename),
        "Content-Length": String(result.size ?? result.buffer.length),
        "Cache-Control": "private, max-age=60",
      },
    });
  }

  return new NextResponse("Erro lendo arquivo.", { status: 500 });
}
