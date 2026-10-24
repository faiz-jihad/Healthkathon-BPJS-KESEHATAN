import "@prisma/client";

declare module "@prisma/client" {
  export interface PrismaClient {
    caseInvestigation: any;
    caseTransition: any;
    ingestionBatch: any;
  }
}
