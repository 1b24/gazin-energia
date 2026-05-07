/**
 * Rate limit abstraction — Upstash Redis (Vercel KV) em prod; fallback
 * in-memory pra dev.
 *
 * Uso:
 *   const ok = await checkRateLimit(`login:${ip}`, 5, "1 m");
 *   if (!ok.success) throw new Error("Muitas tentativas. Tente em 1 minuto.");
 */
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

type Window = `${number} ${"s" | "m" | "h"}`;

interface CheckResult {
  success: boolean;
  /** Quantos restam na janela. */
  remaining: number;
  /** Timestamp Unix em ms quando reseta. */
  reset: number;
}

// ---- Backend prod: Upstash ----
function upstashRedis(): Redis | null {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

const limiterCache = new Map<string, Ratelimit>();
function upstashLimiter(limit: number, window: Window): Ratelimit | null {
  const redis = upstashRedis();
  if (!redis) return null;
  const cacheKey = `${limit}:${window}`;
  const cached = limiterCache.get(cacheKey);
  if (cached) return cached;
  const lim = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, window),
    analytics: false,
    prefix: "gazin:rl",
  });
  limiterCache.set(cacheKey, lim);
  return lim;
}

// ---- Fallback dev: in-memory por process. NÃO funciona em prod
// horizontal (cada instância tem o seu mapa) — por isso loga warning. ----

interface MemHit {
  count: number;
  resetAt: number;
}
const memStore = new Map<string, MemHit>();

function parseWindow(w: Window): number {
  const [n, unit] = w.split(" ");
  const num = Number(n);
  if (unit === "s") return num * 1000;
  if (unit === "m") return num * 60 * 1000;
  return num * 60 * 60 * 1000;
}

function memCheck(key: string, limit: number, window: Window): CheckResult {
  const now = Date.now();
  const win = parseWindow(window);
  const hit = memStore.get(key);
  if (!hit || hit.resetAt < now) {
    memStore.set(key, { count: 1, resetAt: now + win });
    return { success: true, remaining: limit - 1, reset: now + win };
  }
  hit.count++;
  if (hit.count > limit) {
    return { success: false, remaining: 0, reset: hit.resetAt };
  }
  return { success: true, remaining: limit - hit.count, reset: hit.resetAt };
}

let warnedFallback = false;

export async function checkRateLimit(
  key: string,
  limit: number,
  window: Window,
): Promise<CheckResult> {
  const limiter = upstashLimiter(limit, window);
  if (limiter) {
    const r = await limiter.limit(key);
    return { success: r.success, remaining: r.remaining, reset: r.reset };
  }

  if (!warnedFallback && process.env.NODE_ENV === "production") {
    warnedFallback = true;
    console.warn(
      "[rate-limit] KV_REST_API_URL/KV_REST_API_TOKEN ausentes em produção — " +
        "usando fallback in-memory (NÃO seguro em deploy multi-instância).",
    );
  }
  return memCheck(key, limit, window);
}
