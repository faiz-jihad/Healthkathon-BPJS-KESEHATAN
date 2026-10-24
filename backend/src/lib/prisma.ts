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

export const prisma: ExtendedPrismaClient =
  globalForPrisma.prisma ??
  (new PrismaClient({
    log: ["error", "warn"],
  }) as ExtendedPrismaClient);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

