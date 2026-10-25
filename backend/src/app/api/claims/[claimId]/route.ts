import { prisma } from "../../../../lib/prisma";
import { getAuthenticatedUser, hasPermission, PERMISSIONS } from "../../../../lib/auth";
import { ClaimApiRecord } from "../route";
import { buildEvidenceChain } from "../../../../lib/evidence-chain";

// ==============================================================================
// GET /api/claims/[claimId]
// Zero Mock Data Policy: Queries only authoritative PostgreSQL.
// Rejects fabricated/mock entity lookups.
// ==============================================================================
export async function GET(
  request: Request,
  { params }: { params: { claimId: string } }
) {
  // P0 Security Fix: Enforce authentication and authorization
  const user = getAuthenticatedUser(request);
  if (!user) {
    return Response.json(
      {
        status: "UNAUTHENTICATED",
        error: "Akses ditolak. Sesi otorisasi atau token Bearer yang valid wajib disertakan.",
      },
      { status: 401 }
    );
  }

  const canView =
    hasPermission(user.role, PERMISSIONS.VIEW_CLAIMS) ||
    hasPermission(user.role, PERMISSIONS.VIEW_CLAIMS_READONLY);
  if (!canView) {
    return Response.json(
      {
        status: "UNAUTHORIZED_ROLE",
        error: `Role '${user.role}' tidak memiliki kewenangan melihat data klaim ini.`,
      },
      { status: 403 }
    );
  }
  const { claimId } = params;

  if (!claimId || !claimId.trim()) {
    return Response.json(
      { status: "VALIDATION_ERROR", error: "Parameter claimId tidak boleh kosong." },
      { status: 400 }
    );
  }

  let c: any = null;

  try {
    c = await (prisma.claim as any).findUnique({
      where: { claimId: claimId.trim() },
      include: {
        patient: true,
        doctor: true,
        facility: true,
        riskAssessment: true,
        caseInvestigation: true,
        humanReviews: {
          orderBy: { reviewedAt: "desc" },
        },
      },
    });
  } catch (dbErr: any) {
    return Response.json(
      {
        status: "DATA_SOURCE_UNAVAILABLE",
        storage_source: "none",
        error: `Database PostgreSQL tidak dapat dihubungi: ${dbErr?.message || "Koneksi gagal"}. Tidak ada data tiruan yang dikembalikan.`,
      },
      { status: 503 }
    );
  }

  if (!c) {
    return Response.json(
      {
        status: "NOT_FOUND",
        error: `Klaim '${claimId}' tidak ditemukan pada basis data otoritatif.`,
      },
      { status: 404 }
    );
  }

  const ra = c.riskAssessment;
  const latestReview = c.humanReviews[0];

  let analysisStatus: ClaimApiRecord["analysis_status"] = "NOT_ANALYZED";
  let reviewStatus: ClaimApiRecord["review_status"] = "NOT_ANALYZED";

  if (!ra) {
    analysisStatus = "NOT_ANALYZED";
    reviewStatus = "NOT_ANALYZED";
  } else if (ra.assessmentStatus === "UNAVAILABLE" || ra.assessmentStatus === "FAILED") {
    analysisStatus = "ANALYSIS_UNAVAILABLE";
    reviewStatus = "PENDING_ASSESSMENT";
  } else {
    analysisStatus = "ANALYSIS_SUCCESS";
    if (latestReview?.decision === "RELEASE") reviewStatus = "RELEASED";
    else if (latestReview?.decision === "CLARIFY") reviewStatus = "CLARIFICATION_REQUESTED";
    else if (latestReview?.decision === "ESCALATE_AUDIT") reviewStatus = "ESCALATED_AUDIT";
    else if (ra.prePaymentGate === "AUTO_APPROVE") reviewStatus = "RELEASED";
    else reviewStatus = "PENDING_REVIEW";
  }

  const responsePayload: ClaimApiRecord = {
    claim_id: c.claimId,
    patient_id: c.patientId,
    home_region: c.patient?.homeRegion || "-",
    doctor_id: c.doctorId,
    sip_number: c.doctor?.sipNumber || "-",
    specialty: c.doctor?.specialty || "-",
    facility_id: c.facilityId,
    facility_class: c.facility?.facilityClass || "-",
    latitude: c.facility?.latitude || 0,
    longitude: c.facility?.longitude || 0,
    icd10_code: c.icd10Code,
    icd9_code: c.icd9Code || "-",
    service_date: c.serviceDate,
    service_time: c.serviceTime,
    ina_cbgs_tariff: c.inaCbgsTariff,
    length_of_stay: c.lengthOfStay,
    fraud_scenario: (c.fraudScenario as "A" | "B" | "C" | null) || null,
    is_synthetic: c.isSynthetic ?? true,
    data_source: "POSTGRESQL",
    analysis_status: analysisStatus,
    fraud_probability: analysisStatus === "ANALYSIS_SUCCESS" ? ra.fraudProbability : null,
    fraud_risk_index: analysisStatus === "ANALYSIS_SUCCESS" ? ra.fraudRiskIndex : null,
    risk_level:
      analysisStatus === "ANALYSIS_SUCCESS"
        ? ((ra.riskLevel as "HIGH" | "MEDIUM" | "LOW") ?? "LOW")
        : "UNASSESSED",
    pre_payment_gate:
      analysisStatus === "ANALYSIS_SUCCESS"
        ? (ra.prePaymentGate as ClaimApiRecord["pre_payment_gate"])
        : "PENDING_ASSESSMENT",
    review_status: reviewStatus,
    spatiotemporal_metrics:
      analysisStatus === "ANALYSIS_SUCCESS"
        ? {
            spatial_conflict_detected: ra.spatialConflictDetected ?? false,
            doctor_daily_volume: ra.doctorDailyVolume ?? 0,
            spatiotemporal_risk_score: ra.spatiotemporalRiskScore ?? 0,
          }
        : null,
    xai_explanation:
      analysisStatus === "ANALYSIS_SUCCESS"
        ? {
            primary_fraud_trigger: ra.primaryFraudTrigger ?? "Tidak Ada Data Pemicu",
            evidence_reasons: (ra.evidenceReasons as unknown as string[]) ?? [],
            subgraph_evidence: (ra.subgraphEvidence as unknown as NonNullable<ClaimApiRecord["xai_explanation"]>["subgraph_evidence"]) ?? {
              nodes: [],
              edges: [],
            },
          }
        : analysisStatus === "ANALYSIS_UNAVAILABLE"
        ? {
            primary_fraud_trigger: "Asesmen AI Tidak Tersedia",
            evidence_reasons: [
              "Layanan inferensi AI tidak dapat dihubungi saat evaluasi klaim.",
              "Sesuai Zero Mock Data Policy, tidak ada skor atau bukti graf yang dibuat-buat.",
            ],
            subgraph_evidence: { nodes: [], edges: [] },
          }
        : null,
    model_version: ra?.modelVersion ?? null,
    evidence_chain: buildEvidenceChain(c, ra, c.humanReviews, c.caseInvestigation),
    triage_category: buildEvidenceChain(c, ra, c.humanReviews, c.caseInvestigation).triage_profile.triage_category,
    structured_evidence: {
      case_id: `CASE-${c.claimId}`,
      claim_id: c.claimId,
      observed_facts: {
        service_date: c.serviceDate,
        service_time: c.serviceTime,
        patient_id: c.patientId,
        doctor_id: c.doctorId,
        facility_id: c.facilityId,
        tariff_idr: c.inaCbgsTariff,
        icd10_code: c.icd10Code,
        length_of_stay: c.lengthOfStay,
      },
      detected_patterns: {
        spatial_conflict: ra?.spatialConflictDetected ?? false,
        doctor_daily_volume: ra?.doctorDailyVolume ?? 0,
        pattern_label: ra?.primaryFraudTrigger ?? (c.fraudScenario ? `Skenario ${c.fraudScenario}` : "Pola Wajar"),
      },
      model_outputs: {
        model_name: "PyTorch Geometric Hetero GraphSAGE v1.0",
        anomaly_score: ra?.fraudProbability ?? null,
        decision_gate: ra?.prePaymentGate ?? "PENDING_ASSESSMENT",
        evaluation_status: analysisStatus,
      },
      investigator_findings: c.humanReviews.map((r: any) => ({
        reviewer_name: r.reviewerName,
        reviewer_role: r.reviewerRole,
        decision: r.decision,
        notes: r.notes,
        reviewed_at: r.reviewedAt.toISOString(),
      })),
      confirmed_outcome: {
        status: reviewStatus,
        legal_disclaimer: "Skor anomali dan topologi graf merupakan alat bantu analitis pra-pembayaran, bukan pembuktian mutlak fraud yuridis.",
      },
    },
    human_reviews: c.humanReviews.map((r: any) => ({
      id: r.id,
      reviewer_name: r.reviewerName,
      reviewer_role: r.reviewerRole,
      decision: r.decision,
      notes: r.notes,
      reviewed_at: r.reviewedAt.toISOString(),
    })),
  };

  return Response.json(responsePayload);
}
