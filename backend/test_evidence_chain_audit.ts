/**
 * AURA-JKN: Evidence Chain Independent Audit & Negative Test Suite
 * ================================================================
 * Validates Section C of PHASE 3 INDEPENDENT REPRODUCIBILITY AUDIT:
 * - Negative tests: missing sources, invalid IDs, Null Island coords, unexplained alerts, AI failures.
 * - Confirms that traceability is NOT hardcoded and false evidence is rejected.
 */
import { buildEvidenceChain } from "./src/lib/evidence-chain";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`[FAIL] ${msg}`);
    process.exit(1);
  }
  console.log(`[PASS] ${msg}`);
}

console.log("=================================================================");
console.log("  AURA-JKN: EVIDENCE CHAIN INDEPENDENT NEGATIVE & AUDIT SUITE    ");
console.log("=================================================================\n");

// ---------------------------------------------------------------------------
// TEST 1: Baseline Valid Claim (Full Provenance without Human Review)
// ---------------------------------------------------------------------------
console.log("[Test 1] Testing baseline complete claim with completed AI assessment...");
const validClaim = {
  claimId: "CLM00000001",
  serviceDate: "2024-05-10",
  serviceTime: "10:30:00",
  patientId: "PAT0001",
  doctorId: "DOC0001",
  facilityId: "FAC0001",
  icd10Code: "I10",
  icd9Code: "88.72",
  inaCbgsTariff: 4500000,
  lengthOfStay: 2,
  facility: { facilityClass: "FKRTL", latitude: -6.2088, longitude: 106.8456 },
  doctor: { sipNumber: "SIP/123/2020", specialty: "Sp.PD", homeFacilityId: "FAC0001" },
  patient: { homeRegion: "KOTA_JAKARTA_PUSAT" },
};
const validRa = {
  assessmentStatus: "COMPLETED",
  fraudProbability: 0.15,
  fraudRiskIndex: 15,
  riskLevel: "LOW",
  spatialConflictDetected: false,
  doctorDailyVolume: 12,
  spatiotemporalRiskScore: 0.1,
  primaryFraudTrigger: "Pola Layanan Wajar",
  evidenceReasons: ["Volume praktik dalam batas wajar"],
  subgraphEvidence: { nodes: [{ id: "CLM00000001", type: "claim" }], edges: [] },
};
const chain1 = buildEvidenceChain(validClaim, validRa, []);
assert(chain1.traceability_metrics.is_traceable === true, "Valid claim must be marked traceable");
assert(chain1.traceability_metrics.unexplained_alert === false, "Valid claim must have unexplained_alert = false");
assert(chain1.traceability_metrics.evidence_completeness_pct === 75, "Valid claim without human review must have completeness = 75% (Layers 1-3)");
assert(chain1.temporal_spatial_context.coordinates.is_valid === true, "Coordinates must be marked valid");

// ---------------------------------------------------------------------------
// TEST 2: Negative Test — Missing Source Entity / Malformed Intake Facts
// ---------------------------------------------------------------------------
console.log("\n[Test 2] Testing negative scenario: Missing source entity (null patient ID & empty facility ID)...");
const brokenClaim = {
  ...validClaim,
  patientId: "", // Missing patient
  facilityId: null as any, // Missing facility
};
const chain2 = buildEvidenceChain(brokenClaim, validRa, []);
assert(chain2.traceability_metrics.is_traceable === false, "Claim with missing primary entities must NOT be traceable");
assert(chain2.traceability_metrics.evidence_completeness_pct < 75, "Completeness must drop when Layer 1 observed facts are missing");
assert(chain2.traceability_metrics.analysis_limitations.some(l => l.includes("Data primer")), "Explicit limitation must be recorded for missing intake facts");

// ---------------------------------------------------------------------------
// TEST 3: Negative Test — Null Island Coordinates with Spatial Alert
// ---------------------------------------------------------------------------
console.log("\n[Test 3] Testing negative scenario: Null Island coordinates (0,0) flagged for spatial conflict...");
const nullIslandClaim = {
  ...validClaim,
  facility: { facilityClass: "FKRTL", latitude: 0.0, longitude: 0.0 }, // Null Island
};
const spatialConflictRa = {
  ...validRa,
  spatialConflictDetected: true,
  primaryFraudTrigger: "Konflik Spasiotemporal",
};
const chain3 = buildEvidenceChain(nullIslandClaim, spatialConflictRa, []);
assert(chain3.temporal_spatial_context.coordinates.is_valid === false, "Null Island (0,0) coordinates must be identified as invalid");
assert(chain3.traceability_metrics.is_traceable === false, "Spatial conflict alert on invalid coordinates cannot be traceable");
assert(chain3.triage_profile.triage_category === "INSUFFICIENT_EVIDENCE", "Unverifiable spatial alert must be categorized as INSUFFICIENT_EVIDENCE");
assert(chain3.triage_profile.uncertainty_type === "MISSING_COORDINATES", "Uncertainty type must be MISSING_COORDINATES");

// ---------------------------------------------------------------------------
// TEST 4: Negative Test — Unexplained Alert (High FRI without Trigger Rationale)
// ---------------------------------------------------------------------------
console.log("\n[Test 4] Testing negative scenario: High risk alert without trigger reason (Unexplained Alert)...");
const unexplainedRa = {
  ...validRa,
  fraudRiskIndex: 88,
  fraudProbability: 0.88,
  primaryFraudTrigger: "", // EMPTY TRIGGER REASON
  spatialConflictDetected: false,
  doctorDailyVolume: 10,
};
const chain4 = buildEvidenceChain(validClaim, unexplainedRa, []);
assert(chain4.traceability_metrics.unexplained_alert === true, "Alert without trigger reason must be flagged as unexplained");
assert(chain4.traceability_metrics.is_traceable === false, "Unexplained alert must NOT be traceable");
assert(chain4.traceability_metrics.analysis_limitations.some(l => l.includes("tidak memiliki rujukan alasan")), "Limitation must explain lack of rationale");

// ---------------------------------------------------------------------------
// TEST 5: Negative Test — AI Service Failure / Timeout
// ---------------------------------------------------------------------------
console.log("\n[Test 5] Testing negative scenario: AI service failure / timeout...");
const failedRa = {
  assessmentStatus: "FAILED",
  fraudProbability: null,
  fraudRiskIndex: null,
  riskLevel: "UNASSESSED",
  spatialConflictDetected: false,
  doctorDailyVolume: 0,
  spatiotemporalRiskScore: 0,
  primaryFraudTrigger: "Asesmen AI Gagal",
};
const chain5 = buildEvidenceChain(validClaim, failedRa, []);
assert(chain5.triage_profile.triage_category === "ANALYSIS_FAILED", "Failed AI assessment must be categorized as ANALYSIS_FAILED");
assert(chain5.triage_profile.priority === "HIGH", "ANALYSIS_FAILED must have HIGH triage priority (fail-safe human review)");
assert(chain5.triage_profile.uncertainty_type === "SERVICE_TIMEOUT", "Uncertainty type must be SERVICE_TIMEOUT");

// ---------------------------------------------------------------------------
// TEST 6: Unindexed Claim (Novel Claim arriving before batch graph indexing)
// ---------------------------------------------------------------------------
console.log("\n[Test 6] Testing unindexed claim (arrives before offline graph training)...");
const chain6 = buildEvidenceChain(validClaim, null, []);
assert(chain6.triage_profile.triage_category === "NOT_ANALYZED", "Claim without AI assessment must be NOT_ANALYZED");
assert(chain6.triage_profile.priority === "MEDIUM", "NOT_ANALYZED claim must NOT be treated as safe; priority must be MEDIUM");
assert(chain6.triage_profile.uncertainty_type === "UNINDEXED_NEW_CLAIM", "Uncertainty type must be UNINDEXED_NEW_CLAIM");
assert(chain6.four_layer_provenance.layer_3_graph_prediction.relational_probability === null, "Unindexed claim must NOT have fabricated probability");

// ---------------------------------------------------------------------------
// TEST 7: Completed Human Review with Override Rationale
// ---------------------------------------------------------------------------
console.log("\n[Test 7] Testing completed human review with structured rationale...");
const review = [
  {
    decision: "RELEASED",
    reviewerName: "dr. Andi Pratama",
    reviewerRole: "VERIFIKATOR_MEDIS",
    notes: "override: Dokumen tindakan lengkap dan terverifikasi secara klinis",
    reviewedAt: new Date(),
  },
];
const chain7 = buildEvidenceChain(validClaim, validRa, review);
assert(chain7.four_layer_provenance.layer_4_human_decision.current_status === "RELEASED", "Layer 4 must reflect reviewed decision");
assert(chain7.triage_profile.triage_category === "REVIEWED", "Reviewed claim must transition to REVIEWED triage category");
assert(chain7.triage_profile.priority === "LOW", "Reviewed claim must have LOW triage priority");
assert(chain7.traceability_metrics.evidence_completeness_pct === 100, "Claim with all 4 layers complete must have 100% completeness");

console.log("\n=================================================================");
console.log("  ALL 7 EVIDENCE CHAIN AUDIT & NEGATIVE TESTS PASSED (100%)       ");
console.log("=================================================================");
