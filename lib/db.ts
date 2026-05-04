import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 dropped the legacy `datasources` constructor option. Direct Postgres
// connections now go through a driver adapter; HTTP `prisma+postgres://` URLs go
// through `accelerateUrl` (and require an older client). For both `prisma dev`
// and managed Postgres we use the TCP driver adapter.
export function createPrismaClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  if (url.startsWith("prisma+postgres://") || url.startsWith("prisma://")) {
    return new PrismaClient({ accelerateUrl: url });
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
