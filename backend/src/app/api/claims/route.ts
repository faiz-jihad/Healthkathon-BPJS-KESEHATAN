import { prisma } from "../../../lib/prisma";

export interface ClaimApiRecord {
  claim_id: string;
  patient_id: string;
  home_region: string;
  doctor_id: string;
  sip_number: string;
  specialty: string;
  facility_id: string;
  facility_class: string;
  latitude: number;
  longitude: number;
  icd10_code: string;
  icd9_code: string;
  service_date: string;
  service_time: string;
  ina_cbgs_tariff: number;
  length_of_stay: number;
  fraud_scenario: "A" | "B" | "C" | null;
  is_synthetic: boolean;
  data_source: "POSTGRESQL";
  analysis_status: "ANALYSIS_SUCCESS" | "NOT_ANALYZED" | "ANALYSIS_UNAVAILABLE";
  fraud_probability: number | null;
  fraud_risk_index: number | null;
  risk_level: "HIGH" | "MEDIUM" | "LOW" | "UNASSESSED";
  pre_payment_gate: "REJECT_FOR_HUMAN_REVIEW" | "FLAGGED_WARNING" | "AUTO_APPROVE" | "PENDING_ASSESSMENT";
  review_status:
    | "PENDING_REVIEW"
    | "RELEASED"
    | "CLARIFICATION_REQUESTED"
    | "ESCALATED_AUDIT"
    | "PENDING_ASSESSMENT"
    | "NOT_ANALYZED";
  spatiotemporal_metrics: {
    spatial_conflict_detected: boolean;
    doctor_daily_volume: number;
    spatiotemporal_risk_score: number;
  } | null;
  xai_explanation: {
    primary_fraud_trigger: string;
    evidence_reasons: string[];
    subgraph_evidence: {
      nodes: Array<{ id: string; type: string; label?: string }>;
      edges: Array<{ source: string; target: string; relation: string }>;
    };
  } | null;
  model_version?: string | null;
  structured_evidence?: {
    case_id: string;
    claim_id: string;
    observed_facts: {
      service_date: string;
      service_time: string;
      patient_id: string;
      doctor_id: string;
      facility_id: string;
      tariff_idr: number;
      icd10_code: string;
      length_of_stay: number;
    };
    detected_patterns: {
      spatial_conflict: boolean;
      doctor_daily_volume: number;
      pattern_label: string;
    };
    model_outputs: {
      model_name: string;
      anomaly_score: number | null;
      decision_gate: string;
      evaluation_status: string;
    };
    investigator_findings: Array<{
      reviewer_name: string;
      reviewer_role: string;
      decision: string;
      notes: string;
      reviewed_at: string;
    }>;
    confirmed_outcome: {
      status: string;
      legal_disclaimer: string;
    };
  } | null;
  human_reviews: Array<{
    id: string;
    reviewer_name: string;
    reviewer_role: string;
    decision: string;
    notes: string;
    reviewed_at: string;
  }>;
}

// ==============================================================================
// GET /api/claims
// Zero Mock Data: Only returns claims from authoritative PostgreSQL.
// If database is unavailable, returns 503 DATA_SOURCE_UNAVAILABLE.
// ==============================================================================
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const riskFilter = searchParams.get("risk_level"); // HIGH | MEDIUM | LOW | UNASSESSED | ALL
  const scenarioFilter = searchParams.get("scenario"); // A | B | C | NORMAL | ALL
  const analysisFilter = searchParams.get("analysis_status"); // ANALYSIS_SUCCESS | NOT_ANALYZED | ANALYSIS_UNAVAILABLE | ALL
  const search = (searchParams.get("search") || "").toLowerCase().trim();
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10)), 5000) : 300;

  let dbClaims: any[] = [];
  let summary = {
    total_claims: 0,
    high_risk_count: 0,
    medium_risk_count: 0,
    low_risk_count: 0,
    not_analyzed_count: 0,
    analysis_unavailable_count: 0,
    held_tariff_idr: 0,
  };

  try {
    // 1. Build database filter conditions for high-performance indexed queries
    const whereClause: any = {};

    if (riskFilter && riskFilter !== "ALL") {
      if (riskFilter === "UNASSESSED") {
        whereClause.riskAssessment = null;
      } else {
        whereClause.riskAssessment = { riskLevel: riskFilter };
      }
    }

    if (scenarioFilter && scenarioFilter !== "ALL") {
      if (scenarioFilter === "NORMAL") {
        whereClause.fraudScenario = null;
      } else {
        whereClause.fraudScenario = scenarioFilter;
      }
    }

    if (analysisFilter && analysisFilter !== "ALL") {
      if (analysisFilter === "NOT_ANALYZED") {
        whereClause.riskAssessment = null;
      } else if (analysisFilter === "ANALYSIS_SUCCESS") {
        whereClause.riskAssessment = { assessmentStatus: "COMPLETED" };
      }
    }

    if (search) {
      whereClause.OR = [
        { claimId: { contains: search, mode: "insensitive" } },
        { doctorId: { contains: search, mode: "insensitive" } },
        { facilityId: { contains: search, mode: "insensitive" } },
        { patientId: { contains: search, mode: "insensitive" } },
        { icd10Code: { contains: search, mode: "insensitive" } },
      ];
    }

    // 2. Execute parallel queries: Fast aggregate metrics across all DB records + paginated claims list
    const [
      totalClaimsCount,
      highRiskCount,
      mediumRiskCount,
      lowRiskCount,
      totalAssessedCount,
      heldTariffAgg,
      claimsResult,
    ] = await Promise.all([
      prisma.claim.count(),
      prisma.riskAssessment.count({ where: { riskLevel: "HIGH" } }),
      prisma.riskAssessment.count({ where: { riskLevel: "MEDIUM" } }),
      prisma.riskAssessment.count({ where: { riskLevel: "LOW" } }),
      prisma.riskAssessment.count({ where: { assessmentStatus: "COMPLETED" } }),
      prisma.claim.aggregate({
        _sum: { inaCbgsTariff: true },
        where: { riskAssessment: { prePaymentGate: "REJECT_FOR_HUMAN_REVIEW" } },
      }),
      prisma.claim.findMany({
        where: whereClause,
        take: limit,
        include: {
          patient: true,
          doctor: true,
          facility: true,
          riskAssessment: true,
          humanReviews: {
            orderBy: { reviewedAt: "desc" },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      }),
    ]);

    dbClaims = claimsResult;

    summary = {
      total_claims: totalClaimsCount,
      high_risk_count: highRiskCount,
      medium_risk_count: mediumRiskCount,
      low_risk_count: lowRiskCount,
      not_analyzed_count: Math.max(0, totalClaimsCount - totalAssessedCount),
      analysis_unavailable_count: 0,
      held_tariff_idr: heldTariffAgg._sum.inaCbgsTariff ?? 0,
    };
  } catch (dbError: any) {
    // ZERO MOCK POLICY: If database fails, return honest 503 without fake fallbacks
    return Response.json(
      {
        status: "DATA_SOURCE_UNAVAILABLE",
        storage_source: "none",
        data_source_label: "PostgreSQL Tidak Tersambung",
        error: `Layanan database PostgreSQL tidak dapat dihubungi: ${dbError?.message || "Koneksi gagal"}. Sesuai kebijakan Zero Mock Data, sistem tidak menyamarkan kegagalan dengan data tiruan.`,
        summary: {
          total_claims: 0,
          high_risk_count: 0,
          medium_risk_count: 0,
          low_risk_count: 0,
          not_analyzed_count: 0,
          analysis_unavailable_count: 0,
          held_tariff_idr: 0,
        },
        claims: [],
      },
      { status: 503 }
    );
  }

  // Map database entities to ClaimApiRecord
  const claims: ClaimApiRecord[] = dbClaims.map((c) => {
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

    return {
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
                "Layanan inferensi AI (FastAPI R-GCN) tidak dapat dihubungi saat evaluasi klaim ini.",
                "Tidak ada skor risiko atau graf anomali yang dibuat-buat.",
              ],
              subgraph_evidence: { nodes: [], edges: [] },
            }
          : null,
      model_version: ra?.modelVersion ?? null,
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
          model_name: "PyTorch Geometric Hetero R-GCN v1.0",
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
  });

  return Response.json({
    status: "ANALYSIS_SUCCESS",
    storage_source: "postgresql",
    is_synthetic: claims.some((c) => c.is_synthetic),
    data_source_label: "PostgreSQL Database (Prisma Live)",
    summary,
    claims,
  });
}

// ==============================================================================
// POST /api/claims
// Ingests a new claim with strict data validation.
// Calls FastAPI live inference; NEVER falls back to 0.86 or fake graph evidence.
// Persists atomically to PostgreSQL; NEVER falls back to in-memory silently.
// ==============================================================================
export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { status: "VALIDATION_ERROR", error: "Format request body harus berupa JSON yang valid." },
      { status: 400 }
    );
  }

  // --- 1. Strict Input Data Validation (Zero Fabricated Data) ---
  const validationErrors: string[] = [];

  if (!body.claim_id || typeof body.claim_id !== "string" || !body.claim_id.trim()) {
    validationErrors.push("Field 'claim_id' wajib diisi (string non-kosong).");
  }
  if (!body.patient_id || typeof body.patient_id !== "string" || !body.patient_id.trim()) {
    validationErrors.push("Field 'patient_id' wajib diisi (string non-kosong).");
  }
  if (!body.doctor_id || typeof body.doctor_id !== "string" || !body.doctor_id.trim()) {
    validationErrors.push("Field 'doctor_id' wajib diisi (string non-kosong).");
  }
  if (!body.facility_id || typeof body.facility_id !== "string" || !body.facility_id.trim()) {
    validationErrors.push("Field 'facility_id' wajib diisi (string non-kosong).");
  }
  if (!body.icd10_code || typeof body.icd10_code !== "string" || !body.icd10_code.trim()) {
    validationErrors.push("Field 'icd10_code' wajib diisi (string non-kosong).");
  }

  // Validate date format YYYY-MM-DD
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!body.service_date || !dateRegex.test(body.service_date) || isNaN(Date.parse(body.service_date))) {
    validationErrors.push("Field 'service_date' harus berformat YYYY-MM-DD dan merupakan tanggal yang valid.");
  }

  // Validate time format HH:MM:SS or HH:MM
  const timeRegex = /^\d{2}:\d{2}(:\d{2})?$/;
  if (!body.service_time || !timeRegex.test(body.service_time)) {
    validationErrors.push("Field 'service_time' harus berformat HH:MM atau HH:MM:SS.");
  }

  // Validate tariff
  const tariff = Number(body.ina_cbgs_tariff);
  if (isNaN(tariff) || tariff <= 0) {
    validationErrors.push("Field 'ina_cbgs_tariff' harus berupa angka positif lebih dari 0.");
  }

  // Validate length of stay
  const los = body.length_of_stay !== undefined ? Number(body.length_of_stay) : 0;
  if (isNaN(los) || los < 0 || !Number.isInteger(los)) {
    validationErrors.push("Field 'length_of_stay' harus berupa bilangan bulat non-negatif (>= 0).");
  }

  if (validationErrors.length > 0) {
    return Response.json(
      {
        status: "VALIDATION_ERROR",
        error: "Validasi data klaim gagal. Semua atribut harus disediakan secara valid tanpa fabrikasi.",
        details: validationErrors,
      },
      { status: 400 }
    );
  }

  const claimId = body.claim_id.trim();

  // --- 2. Check Database Connectivity & Existing Claim ---
  try {
    const existing = await prisma.claim.findUnique({
      where: { claimId },
    });
    if (existing) {
      return Response.json(
        { status: "CONFLICT", error: `Klaim dengan ID '${claimId}' sudah ada di database.` },
        { status: 409 }
      );
    }
  } catch (dbErr: any) {
    return Response.json(
      {
        status: "DATA_SOURCE_UNAVAILABLE",
        error: `Database PostgreSQL tidak tersedia: ${dbErr?.message || "Koneksi gagal"}. Klaim tidak dapat diproses tanpa penyimpanan otoritatif.`,
      },
      { status: 503 }
    );
  }

  // --- 3. Live AI Inference via FastAPI (Zero Hardcoded Fallbacks) ---
  const aiUrl = process.env.AI_SERVICE_URL || "http://127.0.0.1:8000";
  let aiResult: any = null;
  let aiErrorReason: string | null = null;

  try {
    const aiRes = await fetch(`${aiUrl}/api/v1/predict-claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        claim_id: claimId,
        patient_id: body.patient_id.trim(),
        doctor_id: body.doctor_id.trim(),
        facility_id: body.facility_id.trim(),
        icd10_code: body.icd10_code.trim(),
        service_date: body.service_date,
        service_time: body.service_time,
        ina_cbgs_tariff: tariff,
        length_of_stay: los,
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (aiRes.ok) {
      aiResult = await aiRes.json();
    } else {
      const errBody = await aiRes.text();
      aiErrorReason = `FastAPI merespon HTTP ${aiRes.status}: ${errBody}`;
    }
  } catch (aiErr: any) {
    aiErrorReason = `Gagal menghubungi service AI (${aiUrl}): ${aiErr?.message || "Timeout / Koneksi ditolak"}`;
  }

  // Determine honest assessment status
  const assessmentStatus = aiResult ? "COMPLETED" : "UNAVAILABLE";
  const fraudProbability = aiResult ? Number(aiResult.fraud_probability) : 0;
  const fraudRiskIndex = aiResult ? Math.round(fraudProbability * 100) : 0;
  const riskLevel = aiResult ? aiResult.risk_level : "UNASSESSED";
  const prePaymentGate = aiResult ? aiResult.pre_payment_gate : "PENDING_ASSESSMENT";

  const spatiotemporalMetrics = aiResult?.spatiotemporal_metrics ?? {
    spatial_conflict_detected: false,
    doctor_daily_volume: 0,
    spatiotemporal_risk_score: 0,
  };

  const xaiExplanation = aiResult?.xai_explanation ?? {
    primary_fraud_trigger: "Asesmen AI Tidak Tersedia",
    evidence_reasons: [
      aiErrorReason || "Service AI tidak dapat dihubungi saat evaluasi klaim.",
      "Sesuai Zero Mock Data Policy, tidak ada skor risiko atau bukti graf yang dibuat-buat.",
    ],
    subgraph_evidence: { nodes: [], edges: [] },
  };

  // --- 4. Atomic PostgreSQL Transaction ---
  try {
    const result = await prisma.$transaction(async (tx : any) => {
      // Upsert parent entities if not present to prevent foreign key violations
      await tx.facility.upsert({
        where: { facilityId: body.facility_id.trim() },
        update: {},
        create: {
          facilityId: body.facility_id.trim(),
          facilityClass: body.facility_class || "FKRTL",
          latitude: Number(body.latitude) || 0.0,
          longitude: Number(body.longitude) || 0.0,
        },
      });

      await tx.doctor.upsert({
        where: { doctorId: body.doctor_id.trim() },
        update: {},
        create: {
          doctorId: body.doctor_id.trim(),
          sipNumber: body.sip_number || "SIP-REGISTERED",
          specialty: body.specialty || "Umum",
          homeFacilityId: body.facility_id.trim(),
          scheduleHours: 40,
        },
      });

      await tx.patient.upsert({
        where: { patientId: body.patient_id.trim() },
        update: {},
        create: {
          patientId: body.patient_id.trim(),
          homeRegion: body.home_region || "Indonesia",
        },
      });

      // Insert Claim
      const createdClaim = await tx.claim.create({
        data: {
          claimId,
          patientId: body.patient_id.trim(),
          doctorId: body.doctor_id.trim(),
          facilityId: body.facility_id.trim(),
          icd10Code: body.icd10_code.trim(),
          icd9Code: body.icd9_code ? String(body.icd9_code).trim() : null,
          serviceDate: body.service_date,
          serviceTime: body.service_time,
          inaCbgsTariff: tariff,
          lengthOfStay: los,
          fraudScenario: body.fraud_scenario || null,
          isSynthetic: body.is_synthetic !== undefined ? Boolean(body.is_synthetic) : true,
          riskAssessment: {
            create: {
              assessmentStatus,
              fraudProbability,
              fraudRiskIndex,
              riskLevel,
              prePaymentGate,
              spatialConflictDetected: spatiotemporalMetrics.spatial_conflict_detected,
              doctorDailyVolume: spatiotemporalMetrics.doctor_daily_volume,
              spatiotemporalRiskScore: spatiotemporalMetrics.spatiotemporal_risk_score,
              primaryFraudTrigger: xaiExplanation.primary_fraud_trigger,
              evidenceReasons: xaiExplanation.evidence_reasons,
              subgraphEvidence: xaiExplanation.subgraph_evidence,
              modelVersion: aiResult ? "1.0.0" : null,
            },
          },
        },
        include: {
          patient: true,
          doctor: true,
          facility: true,
          riskAssessment: true,
        },
      });

      // Insert Audit Log for Claim Ingestion
      await tx.auditLog.create({
        data: {
          actorName: "AURA-JKN Ingestion Gate",
          actorRole: "SYSTEM",
          action: "CLAIM_INGESTED",
          targetId: claimId,
          metadata: {
            assessmentStatus,
            aiEngineConnected: Boolean(aiResult),
            aiErrorReason,
          },
        },
      });

      return createdClaim;
    });

    const isAssessed = assessmentStatus === "COMPLETED";

    return Response.json(
      {
        status: isAssessed ? "ANALYSIS_SUCCESS" : "ANALYSIS_UNAVAILABLE",
        storage_source: "postgresql",
        saved_to_postgres: true,
        claim_id: result.claimId,
        analysis_status: isAssessed ? "ANALYSIS_SUCCESS" : "ANALYSIS_UNAVAILABLE",
        ai_service_connected: Boolean(aiResult),
        ai_error: aiErrorReason,
        record: {
          claim_id: result.claimId,
          patient_id: result.patientId,
          home_region: result.patient?.homeRegion,
          doctor_id: result.doctorId,
          facility_id: result.facilityId,
          icd10_code: result.icd10Code,
          service_date: result.serviceDate,
          service_time: result.serviceTime,
          ina_cbgs_tariff: result.inaCbgsTariff,
          fraud_probability: isAssessed ? fraudProbability : null,
          fraud_risk_index: isAssessed ? fraudRiskIndex : null,
          risk_level: riskLevel,
          pre_payment_gate: prePaymentGate,
          spatiotemporal_metrics: isAssessed ? spatiotemporalMetrics : null,
          xai_explanation: xaiExplanation,
        },
      },
      { status: 201 }
    );
  } catch (txErr: any) {
    return Response.json(
      {
        status: "DATABASE_WRITE_FAILED",
        error: `Gagal menyimpan klaim ke basis data PostgreSQL: ${txErr?.message || "Transaksi gagal"}.`,
        saved_to_postgres: false,
      },
      { status: 500 }
    );
  }
}
