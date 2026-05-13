/**
 * Rota protegida pra servir arquivos enviados via `lib/storage.ts`.
 *
 * - Local backend: stream do payload do disco.
 * - S3/R2 backend: 302 redirect pra presigned URL (válida por 15min).
 *
 * Autorização (Step 7 do refactor 2026-05-foundations):
 *   - 401 sem sessão.
 *   - 403 se nenhuma entidade ATIVA referencia este arquivo (órfão).
 *   - 403 se o usuário não tem escopo sobre a entidade dona (gestor_filial
 *     X tentando ler arquivo da filial Y).
 *   - Admin: passa, exceto em arquivo órfão.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { userCanAccessFile } from "@/lib/file-auth";
import { readFileFor } from "@/lib/storage";

// SVG / HTML / JS NÃO ESTÃO AQUI — servidos como octet-stream + attachment.
// Razão: <script> inline em SVG executa na origem do app (XSS, roubo de sessão).
// Veja `lib/actions/upload.ts` para a allowlist do upload.
const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  json: "application/json",
};

/**
 * Extensões servidas INLINE — só formatos que não executam código no browser.
 * Qualquer coisa fora desta lista vai como `attachment` (força download).
 */
const INLINE_EXTENSIONS = new Set([
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
]);

function extOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function mimeOf(name: string): string {
  const ext = extOf(name);
  return MIME_BY_EXT[ext] || "application/octet-stream";
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

  // Autorização fina — checa ownership do arquivo contra escopo do user.
  // Resposta uniforme 403 tanto para "não autorizado" quanto "órfão", para
  // não vazar via mensagem se o arquivo existe ou não.
  const allowed = await userCanAccessFile(session.user, bucket, key);
  if (!allowed) {
    return new NextResponse("Não autorizado.", { status: 403 });
  }

  const result = await readFileFor(bucket, key);
  if (!result) {
    return new NextResponse("Arquivo não encontrado.", { status: 404 });
  }

  if (result.kind === "redirect" && result.redirectUrl) {
    return NextResponse.redirect(result.redirectUrl);
  }

  if (result.kind === "buffer" && result.buffer) {
    const filename = result.filename ?? key;
    const ext = extOf(filename);
    const inline = INLINE_EXTENSIONS.has(ext);
    // Filename é seguro? Só ascii imprimível, sem aspas/quebras. Caso contrário,
    // usa fallback genérico — evita header-injection via Content-Disposition.
    const safeName = /^[\w.\-]+$/.test(filename) ? filename : `arquivo.${ext || "bin"}`;
    const disposition = inline
      ? `inline; filename="${safeName}"`
      : `attachment; filename="${safeName}"`;
    return new NextResponse(new Uint8Array(result.buffer), {
      headers: {
        "Content-Type": mimeOf(filename),
        "Content-Length": String(result.size ?? result.buffer.length),
        "Content-Disposition": disposition,
        // Bloqueia mime-sniffing: o browser respeita o Content-Type acima
        // (octet-stream pra extensões não-inline) e não tenta "adivinhar".
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=60",
      },
    });
  }

  return new NextResponse("Erro lendo arquivo.", { status: 500 });
}
