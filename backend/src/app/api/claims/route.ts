import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getInMemoryClaimsStore, ClaimRecord } from "@/lib/mock-store";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const riskFilter = searchParams.get("risk_level"); // HIGH | MEDIUM | LOW | ALL
  const scenarioFilter = searchParams.get("scenario"); // A | B | C | NORMAL | ALL
  const search = (searchParams.get("search") || "").toLowerCase().trim();

  let claims: ClaimRecord[] = [];
  let storageSource = "in_memory_fallback";

  // Attempt to load from PostgreSQL via Prisma first
  try {
    const dbClaims = await prisma.claim.findMany({
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
        riskAssessment: {
          fraudRiskIndex: "desc",
        },
      },
    });

    if (dbClaims.length > 0) {
      storageSource = "postgresql";
      claims = dbClaims.map((c) => {
        const ra = c.riskAssessment;
        const latestReview = c.humanReviews[0];
        let reviewStatus: ClaimRecord["review_status"] = "PENDING_REVIEW";
        if (latestReview?.decision === "RELEASE") reviewStatus = "RELEASED";
        else if (latestReview?.decision === "CLARIFY") reviewStatus = "CLARIFICATION_REQUESTED";
        else if (latestReview?.decision === "ESCALATE_AUDIT") reviewStatus = "ESCALATED_AUDIT";
        else if (ra?.prePaymentGate === "AUTO_APPROVE") reviewStatus = "RELEASED";

        return {
          claim_id: c.claimId,
          patient_id: c.patientId,
          home_region: c.patient.homeRegion,
          doctor_id: c.doctorId,
          sip_number: c.doctor.sipNumber,
          specialty: c.doctor.specialty,
          facility_id: c.facilityId,
          facility_class: c.facility.facilityClass,
          latitude: c.facility.latitude,
          longitude: c.facility.longitude,
          icd10_code: c.icd10Code,
          icd9_code: c.icd9Code || "-",
          service_date: c.serviceDate,
          service_time: c.serviceTime,
          ina_cbgs_tariff: c.inaCbgsTariff,
          length_of_stay: c.lengthOfStay,
          fraud_scenario: (c.fraudScenario as "A" | "B" | "C" | null) || null,
          fraud_probability: ra?.fraudProbability ?? 0,
          fraud_risk_index: ra?.fraudRiskIndex ?? 0,
          risk_level: (ra?.riskLevel as "HIGH" | "MEDIUM" | "LOW") ?? "LOW",
          pre_payment_gate:
            (ra?.prePaymentGate as
              | "REJECT_FOR_HUMAN_REVIEW"
              | "FLAGGED_WARNING"
              | "AUTO_APPROVE") ?? "AUTO_APPROVE",
          review_status: reviewStatus,
          spatiotemporal_metrics: {
            spatial_conflict_detected: ra?.spatialConflictDetected ?? false,
            doctor_daily_volume: ra?.doctorDailyVolume ?? 1,
            spatiotemporal_risk_score: ra?.spatiotemporalRiskScore ?? 0,
          },
          xai_explanation: {
            primary_fraud_trigger: ra?.primaryFraudTrigger ?? "Normal / Low Risk",
            evidence_reasons: (ra?.evidenceReasons as unknown as string[]) ?? [],
            subgraph_evidence: (ra?.subgraphEvidence as unknown as ClaimRecord["xai_explanation"]["subgraph_evidence"]) ?? {
              nodes: [],
              edges: [],
            },
          },
          human_reviews: c.humanReviews.map((r) => ({
            id: r.id,
            reviewer_name: r.reviewerName,
            reviewer_role: r.reviewerRole,
            decision: r.decision,
            notes: r.notes,
            reviewed_at: r.reviewedAt.toISOString(),
          })),
        };
      });
    }
  } catch {
    // Fallback to in-memory store seamlessly if PostgreSQL is not running yet
  }

  if (claims.length === 0) {
    claims = getInMemoryClaimsStore();
  }

  // Compute global KPI summary before filtering
  const summary = {
    total_claims: claims.length,
    high_risk_count: claims.filter((c) => c.risk_level === "HIGH").length,
    medium_risk_count: claims.filter((c) => c.risk_level === "MEDIUM").length,
    low_risk_count: claims.filter((c) => c.risk_level === "LOW").length,
    held_tariff_idr: claims
      .filter((c) => c.pre_payment_gate === "REJECT_FOR_HUMAN_REVIEW")
      .reduce((acc, c) => acc + c.ina_cbgs_tariff, 0),
  };

  // Apply filters
  const filtered = claims
    .filter((c) => {
      if (riskFilter && riskFilter !== "ALL" && c.risk_level !== riskFilter) return false;
      if (scenarioFilter && scenarioFilter !== "ALL") {
        if (scenarioFilter === "NORMAL" && c.fraud_scenario !== null) return false;
        if (scenarioFilter !== "NORMAL" && c.fraud_scenario !== scenarioFilter) return false;
      }
      if (search) {
        const hay = `${c.claim_id} ${c.doctor_id} ${c.facility_id} ${c.patient_id} ${c.icd10_code} ${c.specialty}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    })
    .sort((a, b) => b.fraud_risk_index - a.fraud_risk_index);

  return NextResponse.json({
    storage_source: storageSource,
    summary,
    claims: filtered,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const aiUrl = process.env.AI_SERVICE_URL || "http://127.0.0.1:8000";

    // Try calling Python FastAPI Service (app.py POST /api/v1/predict-claim)
    let aiResult: any = null;
    try {
      const res = await fetch(`${aiUrl}/api/v1/predict-claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        aiResult = await res.json();
      }
    } catch {
      // Fallback calculation if Python AI server is offline
    }

    const fraudProba = aiResult?.fraud_probability ?? 0.86;
    const fri = Math.round(fraudProba * 100);
    const riskLevel = fri >= 70 ? "HIGH" : fri >= 40 ? "MEDIUM" : "LOW";
    const gate =
      fri >= 70
        ? "REJECT_FOR_HUMAN_REVIEW"
        : fri >= 40
        ? "FLAGGED_WARNING"
        : "AUTO_APPROVE";

    const newRecord: ClaimRecord = {
      claim_id: body.claim_id || `CLM_${Date.now()}`,
      patient_id: body.patient_id || "pat_simulated_hash",
      home_region: body.home_region || "Jawa Barat",
      doctor_id: body.doctor_id || "DOC0040",
      sip_number: "SIP7812041",
      specialty: body.specialty || "Umum",
      facility_id: body.facility_id || "FAC0013",
      facility_class: "FKRTL",
      latitude: -6.9,
      longitude: 107.6,
      icd10_code: body.icd10_code || "M54.5",
      icd9_code: body.icd9_code || "93.39",
      service_date: body.service_date || "2026-03-15",
      service_time: body.service_time || "10:00:00",
      ina_cbgs_tariff: Number(body.ina_cbgs_tariff || 1200000),
      length_of_stay: Number(body.length_of_stay || 1),
      fraud_scenario: "C",
      fraud_probability: fraudProba,
      fraud_risk_index: fri,
      risk_level: riskLevel,
      pre_payment_gate: gate,
      review_status: gate === "AUTO_APPROVE" ? "RELEASED" : "PENDING_REVIEW",
      spatiotemporal_metrics: aiResult?.spatiotemporal_metrics ?? {
        spatial_conflict_detected: true,
        doctor_daily_volume: 64,
        spatiotemporal_risk_score: 71.0,
      },
      xai_explanation: aiResult?.xai_explanation ?? {
        primary_fraud_trigger: "Spatio-Temporal Conflict",
        evidence_reasons: [
          "Simulasi klaim baru dievaluasi oleh Pre-Payment Risk Gate AURA-JKN.",
        ],
        subgraph_evidence: {
          nodes: [
            { id: body.claim_id, type: "claim", label: `Klaim ${body.claim_id}` },
            { id: body.doctor_id, type: "doctor", label: `Dr. ${body.doctor_id}` },
            { id: body.facility_id, type: "facility", label: `Faskes ${body.facility_id}` },
            { id: body.patient_id, type: "patient", label: `Pasien ${body.patient_id}` },
            { id: body.icd10_code, type: "diagnosis", label: `ICD-10: ${body.icd10_code}` },
          ],
          edges: [
            { source: body.doctor_id, target: body.claim_id, relation: "authorized" },
            { source: body.claim_id, target: body.icd10_code, relation: "has_diagnosis" },
            { source: body.patient_id, target: body.doctor_id, relation: "examined_by" },
            { source: body.patient_id, target: body.facility_id, relation: "referred_to" },
          ],
        },
      },
      human_reviews: [],
    };

    const store = getInMemoryClaimsStore();
    store.unshift(newRecord);

    return NextResponse.json(newRecord, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Invalid payload" }, { status: 400 });
  }
}
