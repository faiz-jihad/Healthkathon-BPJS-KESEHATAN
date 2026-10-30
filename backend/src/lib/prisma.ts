import { PrismaClient } from "@prisma/client";

// Extended PrismaClient interface to include new models even before local 'prisma generate' is executed on the host
export type ExtendedPrismaClient = PrismaClient & {
  caseInvestigation: any;
  caseTransition: any;
  ingestionBatch: any;
};

const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedPrismaClient | undefined;
};

const datasourceUrl = process.env.DATABASE_URL;

export const prisma: ExtendedPrismaClient =
  globalForPrisma.prisma ??
  (new PrismaClient({
    ...(datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : {}),
    log: ["error", "warn"],
  }) as ExtendedPrismaClient);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

