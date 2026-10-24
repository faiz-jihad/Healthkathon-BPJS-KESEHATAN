import { prisma } from "@/lib/prisma";
const db = prisma as any;
import {
  getAuthenticatedUser,
  requirePermission,
  PERMISSIONS,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/ingestion/history
 * Returns ingestion batch history for Phase 1 — Data Intake
 * Requires: VIEW_INGESTION_HISTORY permission
 */
export async function GET(request: Request) {
  const user = getAuthenticatedUser(request);
  const authError = requirePermission(
    user,
    PERMISSIONS.VIEW_INGESTION_HISTORY
  );
  if (authError) return authError;

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(
    50,
    Math.max(1, parseInt(url.searchParams.get("limit") || "10", 10))
  );

  try {
    // First, try to read actual ingestion_batches table
    let batches: any[] = [];
    let total = 0;
    let hasIngestionTable = true;

    try {
      [total, batches] = await Promise.all([
        db.ingestionBatch.count(),
        db.ingestionBatch.findMany({
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
      ]);
    } catch {
      // Table not yet migrated — synthesize from audit log
      hasIngestionTable = false;
    }

    if (!hasIngestionTable || batches.length === 0) {
      // Fallback: read CLAIM_INGESTED events from audit_logs
      const auditIngestions = await prisma.auditLog.findMany({
        where: { action: { in: ["CLAIM_INGESTED", "BULK_IMPORT_COMPLETED"] } },
        orderBy: { recordedAt: "desc" },
        take: 20,
      });

      // Also get actual claim/entity counts from database
      const [claimCount, patientCount, doctorCount, facilityCount] =
        await Promise.all([
          prisma.claim.count(),
          prisma.patient.count(),
          prisma.doctor.count(),
          prisma.facility.count(),
        ]);

      // Derive ingestion summary from what's actually in the database
      const derivedBatches = auditIngestions.length > 0
        ? auditIngestions.map((log: any) => ({
            batch_id: `AUDIT-${log.id.substring(0, 8)}`,
            source_dataset: (log.metadata as any)?.source || "Sistema/API",
            dataset_type: "CLAIMS",
            total_read: 1,
            total_valid: (log.metadata as any)?.assessmentStatus !== "FAILED" ? 1 : 0,
            total_rejected: (log.metadata as any)?.assessmentStatus === "FAILED" ? 1 : 0,
            total_duplicates: 0,
            status: "COMPLETED",
            started_at: log.recordedAt,
            completed_at: log.recordedAt,
            initiated_by: log.actorName,
            notes: `Klaim diproses melalui API gateway. AI terhubung: ${(log.metadata as any)?.aiEngineConnected}`,
          }))
        : [];

      return Response.json({
        status: "SUCCESS",
        data_source: "audit_log_derived",
        note: "Tabel ingestion_batches belum dimigrasikan. Data berikut diturunkan dari audit_logs.",
        database_summary: {
          total_claims_in_db: claimCount,
          total_patients_in_db: patientCount,
          total_doctors_in_db: doctorCount,
          total_facilities_in_db: facilityCount,
          last_checked: new Date().toISOString(),
        },
        pagination: {
          page,
          limit,
          total: derivedBatches.length,
          total_pages: 1,
        },
        batches: derivedBatches,
      });
    }

    // Get overall database counts for context
    const [claimCount, patientCount, doctorCount, facilityCount] =
      await Promise.all([
        prisma.claim.count(),
        prisma.patient.count(),
        prisma.doctor.count(),
        prisma.facility.count(),
      ]);

    return Response.json({
      status: "SUCCESS",
      data_source: "ingestion_batches_table",
      database_summary: {
        total_claims_in_db: claimCount,
        total_patients_in_db: patientCount,
        total_doctors_in_db: doctorCount,
        total_facilities_in_db: facilityCount,
        last_checked: new Date().toISOString(),
      },
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
      batches: batches.map((b: any) => ({
        batch_id: b.batchId,
        source_dataset: b.sourceDataset,
        dataset_type: b.datasetType,
        total_read: b.totalRead,
        total_valid: b.totalValid,
        total_rejected: b.totalRejected,
        total_duplicates: b.totalDuplicates,
        rejection_reasons: b.rejectionReasons,
        status: b.status,
        started_at: b.startedAt,
        completed_at: b.completedAt,
        duration_ms: b.durationMs,
        initiated_by: b.initiatedBy,
        notes: b.notes,
      })),
    });
  } catch (dbErr: any) {
    return Response.json(
      {
        status: "DATA_SOURCE_UNAVAILABLE",
        error: `Database tidak dapat dihubungi: ${dbErr?.message || "Koneksi gagal"}`,
      },
      { status: 503 }
    );
  }
}
