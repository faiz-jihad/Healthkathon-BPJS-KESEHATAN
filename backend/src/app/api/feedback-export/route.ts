import { prisma } from "../../../lib/prisma";
import { getAuthenticatedUser } from "../../../lib/auth";

export const dynamic = "force-dynamic";

export interface FeedbackExportRecord {
  review_id: string;
  claim_id: string;
  patient_id: string;
  doctor_id: string;
  facility_id: string;
  icd10_code: string;
  service_date: string;
  ina_cbgs_tariff: number;
  fraud_scenario: string | null;
  ai_fraud_probability: number | null;
  ai_fraud_risk_index: number | null;
  ai_risk_level: string;
  ai_pre_payment_gate: string;
  reviewer_name: string;
  reviewer_role: string;
  decision: string;
  feedback_label: number | null;
  feedback_meaning: "CONFIRMED_FRAUD (1)" | "LEGITIMATE_CLAIM (0)" | "PENDING_CLARIFICATION (NULL)";
  notes: string;
  reviewed_at: string;
}

// ==============================================================================
// GET /api/feedback-export
// Controlled Feedback Loop Export for R-GCN Model Retraining (Task 2.4)
// Zero Mock Data Policy: Reads exclusively from authoritative PostgreSQL
// table `human_reviews` joined with `claims` and `risk_assessments`.
// Supports ?format=json (default) and ?format=csv
// ==============================================================================
export async function GET(request: Request) {
  const url = new URL(request.url);
  const format = (url.searchParams.get("format") || "json").toLowerCase();
  const onlyLabeled = url.searchParams.get("only_labeled") === "true";

  // Optional token inspection for audit context
  const caller = getAuthenticatedUser(request);

  try {
    const whereClause: any = {};
    if (onlyLabeled) {
      whereClause.feedbackLabel = { in: [0, 1] };
    }

    const reviews = await prisma.humanReview.findMany({
      where: whereClause,
      orderBy: { reviewedAt: "desc" },
      include: {
        claim: {
          include: {
            riskAssessment: true,
          },
        },
      },
    });

    const records: FeedbackExportRecord[] = reviews.map((r: any) => {
      const claim = r.claim;
      const ra = claim?.riskAssessment;
      const label: number | null =
        r.feedbackLabel !== undefined && r.feedbackLabel !== null
          ? Number(r.feedbackLabel)
          : r.decision === "ESCALATE_AUDIT"
          ? 1
          : r.decision === "RELEASE"
          ? 0
          : null;

      return {
        review_id: r.id,
        claim_id: r.claimId,
        patient_id: claim?.patientId || "-",
        doctor_id: claim?.doctorId || "-",
        facility_id: claim?.facilityId || "-",
        icd10_code: claim?.icd10Code || "-",
        service_date: claim?.serviceDate || "-",
        ina_cbgs_tariff: claim?.inaCbgsTariff ?? 0,
        fraud_scenario: claim?.fraudScenario ?? null,
        ai_fraud_probability: ra ? ra.fraudProbability : null,
        ai_fraud_risk_index: ra ? ra.fraudRiskIndex : null,
        ai_risk_level: ra?.riskLevel || "UNASSESSED",
        ai_pre_payment_gate: ra?.prePaymentGate || "PENDING_ASSESSMENT",
        reviewer_name: r.reviewerName,
        reviewer_role: r.reviewerRole,
        decision: r.decision,
        feedback_label: label,
        feedback_meaning:
          label === 1
            ? "CONFIRMED_FRAUD (1)"
            : label === 0
            ? "LEGITIMATE_CLAIM (0)"
            : "PENDING_CLARIFICATION (NULL)",
        notes: r.notes,
        reviewed_at: r.reviewedAt.toISOString(),
      };
    });

    const confirmedFraudCount = records.filter((rec) => rec.feedback_label === 1).length;
    const legitimateCount = records.filter((rec) => rec.feedback_label === 0).length;
    const clarificationCount = records.filter((rec) => rec.feedback_label === null).length;
    const labeledCount = confirmedFraudCount + legitimateCount;

    if (format === "csv") {
      const headers = [
        "review_id",
        "claim_id",
        "patient_id",
        "doctor_id",
        "facility_id",
        "icd10_code",
        "service_date",
        "ina_cbgs_tariff",
        "fraud_scenario",
        "ai_fraud_probability",
        "ai_fraud_risk_index",
        "ai_risk_level",
        "ai_pre_payment_gate",
        "reviewer_name",
        "reviewer_role",
        "decision",
        "feedback_label",
        "reviewed_at",
      ];

      const escapeCsv = (val: any) => {
        if (val === null || val === undefined) return "";
        const str = String(val).replace(/"/g, '""');
        return /[,"\n]/.test(str) ? `"${str}"` : str;
      };

      const rows = records.map((rec) =>
        [
          rec.review_id,
          rec.claim_id,
          rec.patient_id,
          rec.doctor_id,
          rec.facility_id,
          rec.icd10_code,
          rec.service_date,
          rec.ina_cbgs_tariff,
          rec.fraud_scenario ?? "NORMAL",
          rec.ai_fraud_probability ?? "",
          rec.ai_fraud_risk_index ?? "",
          rec.ai_risk_level,
          rec.ai_pre_payment_gate,
          rec.reviewer_name,
          rec.reviewer_role,
          rec.decision,
          rec.feedback_label ?? "",
          rec.reviewed_at,
        ]
          .map(escapeCsv)
          .join(",")
      );

      const csvContent = [headers.join(","), ...rows].join("\n");

      return new Response(csvContent, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="aura_jkn_feedback_retraining.csv"',
        },
      });
    }

    return Response.json({
      status: "SUCCESS",
      storage_source: "postgresql",
      exported_by: caller ? `${caller.fullName} (${caller.role})` : "AURA-JKN System",
      summary: {
        total_reviews: records.length,
        labeled_for_retraining_count: labeledCount,
        confirmed_fraud_label_1_count: confirmedFraudCount,
        legitimate_label_0_count: legitimateCount,
        pending_clarification_count: clarificationCount,
      },
      records,
    });
  } catch (dbErr: any) {
    return Response.json(
      {
        status: "DATA_SOURCE_UNAVAILABLE",
        storage_source: "none",
        error: `Layanan database PostgreSQL tidak dapat dihubungi: ${dbErr?.message || "Koneksi gagal"}. Sesuai Zero Mock Data Policy, data feedback tiruan tidak dikembalikan.`,
        summary: {
          total_reviews: 0,
          labeled_for_retraining_count: 0,
          confirmed_fraud_label_1_count: 0,
          legitimate_label_0_count: 0,
          pending_clarification_count: 0,
        },
        records: [],
      },
      { status: 503 }
    );
  }
}
