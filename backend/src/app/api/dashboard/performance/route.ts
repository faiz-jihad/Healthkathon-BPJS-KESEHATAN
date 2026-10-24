import { prisma } from "@/lib/prisma";
const db = prisma as any;
import {
  getAuthenticatedUser,
  requirePermission,
  PERMISSIONS,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/performance
 * Business Performance Dashboard — Phase 8
 * Returns investigation throughput, backlog, median time, false positive rate, model metrics
 * Requires: VIEW_PERFORMANCE_DASHBOARD permission
 */
export async function GET(request: Request) {
  const user = getAuthenticatedUser(request);
  const authError = requirePermission(user, PERMISSIONS.VIEW_PERFORMANCE_DASHBOARD);
  if (authError) return authError;

  const url = new URL(request.url);
  const periodDays = Math.min(
    365,
    Math.max(1, parseInt(url.searchParams.get("period_days") || "30", 10))
  );

  const since = new Date();
  since.setDate(since.getDate() - periodDays);

  try {
    // Run all metrics queries in parallel for performance
    const [
      totalCases,
      openCases,
      resolvedCases,
      escalatedCases,
      closedCases,
      reviewedCases,
      flaggedForReview,
      totalAlerts,
      reviewedAlerts,
      allResolvedCasesWithTime,
      casesByPriority,
      casesByOutcome,
      recentAuditCount,
      totalClaimsCount,
      assessedClaimsCount,
      highRiskCount,
      mediumRiskCount,
      lowRiskCount,
      latestModelVersion,
    ] = await Promise.all([
      // Case counts
      db.caseInvestigation.count(),
      db.caseInvestigation.count({
        where: { status: { in: ["FLAGGED_FOR_REVIEW", "UNDER_REVIEW", "AWAITING_EVIDENCE"] } },
      }),
      db.caseInvestigation.count({ where: { status: "RESOLVED" } }),
      db.caseInvestigation.count({ where: { status: "ESCALATED" } }),
      db.caseInvestigation.count({ where: { status: "CLOSED" } }),
      db.caseInvestigation.count({
        where: { status: { in: ["RESOLVED", "CLOSED"] } },
      }),
      db.caseInvestigation.count({ where: { status: "FLAGGED_FOR_REVIEW" } }),

      // Alert review metrics
      prisma.riskAssessment.count({
        where: { assessmentStatus: "COMPLETED" },
      }),
      prisma.humanReview.count({
        where: { reviewedAt: { gte: since } },
      }),

      // For median time calculation — get all resolved cases with timestamps
      db.caseInvestigation.findMany({
        where: {
          status: { in: ["RESOLVED", "CLOSED"] },
          reviewStartedAt: { not: null },
          resolvedAt: { not: null },
        },
        select: { reviewStartedAt: true, resolvedAt: true },
        take: 500,
      }),

      // Priority distribution
      db.caseInvestigation.groupBy({
        by: ["priority"],
        _count: { id: true },
      }),

      // Outcome distribution
      db.caseInvestigation.groupBy({
        by: ["outcome"],
        where: { outcome: { not: null } },
        _count: { id: true },
      }),

      // Audit trail coverage
      prisma.auditLog.count({ where: { recordedAt: { gte: since } } }),

      // Claim stats
      prisma.claim.count(),
      prisma.riskAssessment.count({ where: { assessmentStatus: "COMPLETED" } }),
      prisma.riskAssessment.count({ where: { riskLevel: "HIGH" } }),
      prisma.riskAssessment.count({ where: { riskLevel: "MEDIUM" } }),
      prisma.riskAssessment.count({ where: { riskLevel: "LOW" } }),

      // Latest model version
      prisma.riskAssessment.findFirst({
        where: { modelVersion: { not: null } },
        orderBy: { evaluatedAt: "desc" },
        select: { modelVersion: true, evaluatedAt: true },
      }),
    ]);

    // Calculate median investigation time (in hours)
    let medianInvestigationHours: number | null = null;
    if (allResolvedCasesWithTime.length > 0) {
      const durations: number[] = (allResolvedCasesWithTime as any[])
        .filter((c: any) => Boolean(c?.reviewStartedAt && c?.resolvedAt))
        .map((c: any): number => {
          const start = new Date(c.reviewStartedAt).getTime();
          const end = new Date(c.resolvedAt).getTime();
          return (end - start) / (1000 * 60 * 60); // hours
        })
        .sort((a: number, b: number) => a - b);

      if (durations.length > 0) {
        const mid = Math.floor(durations.length / 2);
        const rawMedian: number =
          durations.length % 2 !== 0
            ? durations[mid]
            : (durations[mid - 1] + durations[mid]) / 2;
        medianInvestigationHours = Math.round(rawMedian * 10) / 10;
      }
    }

    // False positive rate: reviews with decision RELEASE on high-risk cases (approximate)
    const releasedFromHighRisk = await prisma.humanReview.count({
      where: {
        decision: "RELEASE",
        claim: {
          riskAssessment: { riskLevel: "HIGH" },
        },
        reviewedAt: { gte: since },
      },
    });

    const totalReviewedInPeriod = await prisma.humanReview.count({
      where: { reviewedAt: { gte: since } },
    });

    const verifiedFalsePositiveRate =
      totalReviewedInPeriod > 0
        ? Math.round((releasedFromHighRisk / totalReviewedInPeriod) * 1000) / 10
        : null;

    // Evidence completeness: cases with at least 1 human review
    const casesWithEvidence = await db.caseInvestigation.count({
      where: {
        claim: {
          humanReviews: { some: {} },
        },
      },
    });

    const evidenceCompleteness =
      totalCases > 0
        ? Math.round((casesWithEvidence / totalCases) * 1000) / 10
        : null;

    // Alert review rate
    const alertReviewRate =
      totalAlerts > 0
        ? Math.round((reviewedAlerts / totalAlerts) * 1000) / 10
        : null;

    // Priority distribution map
    const priorityMap: Record<string, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const row of casesByPriority) {
      priorityMap[row.priority] = row._count.id;
    }

    // Outcome distribution map
    const outcomeMap: Record<string, number> = {
      REFERRED_FOR_ACTION: 0,
      CLEARED: 0,
      INSUFFICIENT_EVIDENCE: 0,
      CLOSED_ADMINISTRATIVE: 0,
    };
    for (const row of casesByOutcome as any[]) {
      if (row.outcome) {
        outcomeMap[row.outcome] = row._count.id;
      }
    }

    // Ingestion history summary
    let ingestionSummary = null;
    try {
      const latestBatch = await db.ingestionBatch.findFirst({
        orderBy: { createdAt: "desc" },
      });
      const totalBatches = await db.ingestionBatch.count();
      ingestionSummary = {
        total_batches: totalBatches,
        latest_batch: latestBatch
          ? {
              batch_id: latestBatch.batchId,
              status: latestBatch.status,
              total_valid: latestBatch.totalValid,
              total_rejected: latestBatch.totalRejected,
              completed_at: latestBatch.completedAt,
            }
          : null,
      };
    } catch {
      // Table may not exist yet before migration
      ingestionSummary = { total_batches: 0, latest_batch: null };
    }

    return Response.json({
      status: "SUCCESS",
      period_days: periodDays,
      generated_at: new Date().toISOString(),
      metrics_definitions: {
        investigation_throughput:
          "Jumlah kasus yang selesai ditinjau (RESOLVED + CLOSED) dalam semua waktu",
        backlog:
          "Jumlah kasus terbuka (FLAGGED_FOR_REVIEW + UNDER_REVIEW + AWAITING_EVIDENCE)",
        median_investigation_hours:
          "Median durasi dari review_started_at hingga resolved_at (jam)",
        alert_review_rate:
          "Persentase alert (risk assessments) yang telah memiliki minimal 1 human review",
        verified_false_positive_rate:
          "Proporsi kasus HIGH yang direview dengan keputusan RELEASE dalam periode",
        evidence_completeness:
          "Proporsi kasus yang memiliki minimal 1 catatan human review",
      },
      investigation: {
        total_cases: totalCases,
        open_cases: openCases,
        flagged_for_review: flaggedForReview,
        resolved_cases: resolvedCases,
        escalated_cases: escalatedCases,
        closed_cases: closedCases,
        throughput_all_time: reviewedCases,
        backlog: openCases,
        median_investigation_hours: medianInvestigationHours,
        priority_distribution: priorityMap,
        outcomes_distribution: outcomeMap,
      },
      alert_quality: {
        total_alerts: totalAlerts,
        reviewed_in_period: reviewedAlerts,
        alert_review_rate: alertReviewRate,
        verified_false_positive_rate: verifiedFalsePositiveRate,
        // Note: Precision@K requires ground truth labels — not established
        precision_at_k: null,
        precision_at_k_note:
          "Memerlukan ground truth yang divalidasi. Belum tersedia.",
      },
      evidence: {
        cases_with_evidence: casesWithEvidence,
        evidence_completeness_pct: evidenceCompleteness,
      },
      data_quality: {
        total_claims: totalClaimsCount,
        assessed_claims: assessedClaimsCount,
        not_assessed: Math.max(0, totalClaimsCount - assessedClaimsCount),
        high_risk: highRiskCount,
        medium_risk: mediumRiskCount,
        low_risk: lowRiskCount,
        assessment_coverage_pct:
          totalClaimsCount > 0
            ? Math.round((assessedClaimsCount / totalClaimsCount) * 1000) / 10
            : 0,
      },
      model: {
        current_version: latestModelVersion?.modelVersion || "1.0.0",
        last_inference: latestModelVersion?.evaluatedAt || null,
        model_name: "PyTorch Geometric Hetero R-GCN",
        // Model evaluation metrics require ground truth dataset
        precision: null,
        recall: null,
        pr_auc: null,
        model_metrics_note:
          "Metrik evaluasi model memerlukan dataset ground truth yang tervalidasi. Gunakan endpoint /api/health untuk status inferensi aktif.",
      },
      audit_trail: {
        audit_events_in_period: recentAuditCount,
        audit_coverage_note:
          "Setiap tindakan penting direkam ke tabel audit_logs dengan actor, role, action, dan timestamp.",
      },
      ingestion: ingestionSummary,
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
