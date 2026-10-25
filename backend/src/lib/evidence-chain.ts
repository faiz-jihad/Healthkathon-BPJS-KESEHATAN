/**
 * AURA-JKN: Evidence Chain Engine & Uncertainty-Aware Triage Utility
 * ===================================================================
 * Fulfills Pengembangan A & Pengembangan B of MASTER NOVELTY ENGINEERING:
 * 1. Connects every alert to inspectable, multi-layer evidence.
 * 2. Explicit 4-Layer Provenance:
 *    - Layer 1: Fakta Teramati (Authentic PostgreSQL Intake)
 *    - Layer 2: Hasil Aturan Spasiotemporal & Kuota (Deterministic Rules)
 *    - Layer 3: Prediksi Model Graf (PyG Hetero GraphSAGE Message Passing)
 *    - Layer 4: Keputusan Petugas (Human-in-the-Loop Reviews & Audit)
 * 3. Traceability Metrics (Completeness Score %, Unexplained Alert check).
 * 4. Uncertainty-Aware Triage Classification:
 *    - HIGH_RISK_REVIEW | NEEDS_CLARIFICATION | INSUFFICIENT_EVIDENCE
 *    - NOT_ANALYZED | ANALYSIS_FAILED | REVIEWED
 */

export interface EvidenceChain {
  claim_id: string;
  case_number: string;
  signal_type:
    | "RELATIONAL_COLLUSION_CLUSTER"
    | "PRACTITIONER_VOLUME_OVERCAPACITY"
    | "SPATIOTEMPORAL_CONFLICT"
    | "UNINDEXED_NEW_CLAIM"
    | "AI_INFERENCE_UNAVAILABLE"
    | "NOMINAL_CLAIM";
  signal_label: string;
  temporal_spatial_context: {
    service_date: string;
    service_time: string;
    facility_id: string;
    facility_class: string;
    coordinates: {
      latitude: number;
      longitude: number;
      is_valid: boolean;
    };
    doctor_home_facility: string;
    spatial_conflict_flag: boolean;
    doctor_daily_volume: number;
  };
  graph_entities_and_relations: {
    entities: {
      patient: { id: string; pseudonymized: boolean; home_region: string };
      doctor: { id: string; sip: string; specialty: string };
      facility: { id: string; class: string };
      claim: { id: string; tariff_idr: number; los_days: number; icd10: string; icd9: string };
    };
    relations: Array<{
      relation_type: "REGISTRATION" | "EXAMINATION" | "AUTHORIZATION" | "REFERRAL";
      source: string;
      target: string;
      description: string;
    }>;
  };
  four_layer_provenance: {
    layer_1_observed_facts: {
      service_timestamp: string;
      patient_id: string;
      doctor_sip: string;
      facility_id: string;
      tariff_idr: number;
      length_of_stay: number;
      icd10_code: string;
      icd9_code: string;
    };
    layer_2_rule_evaluation: {
      rules_checked: Array<{
        rule_id: string;
        rule_name: string;
        threshold_applied: string;
        observed_value: string | number;
        triggered: boolean;
        evidence_text: string;
      }>;
      spatiotemporal_score: number;
    };
    layer_3_graph_prediction: {
      architecture: string;
      relational_probability: number | null;
      fraud_risk_index: number | null;
      risk_level: string;
      topological_trigger: string;
      subgraph_nodes_count: number;
      subgraph_edges_count: number;
      is_transductive_offline: boolean;
    };
    layer_4_human_decision: {
      current_status: string;
      review_count: number;
      latest_decision: string | null;
      latest_reviewer_name: string | null;
      latest_reviewer_role: string | null;
      latest_notes: string | null;
      override_reason: string | null;
      evidence_inspected: string[];
      reviewed_at: string | null;
    };
  };
  traceability_metrics: {
    evidence_completeness_pct: number;
    is_traceable: boolean;
    unexplained_alert: boolean;
    analysis_limitations: string[];
  };
  triage_profile: {
    triage_category:
      | "HIGH_RISK_REVIEW"
      | "NEEDS_CLARIFICATION"
      | "INSUFFICIENT_EVIDENCE"
      | "NOT_ANALYZED"
      | "ANALYSIS_FAILED"
      | "REVIEWED";
    priority: "HIGH" | "MEDIUM" | "LOW";
    priority_score: number;
    priority_reasons: string[];
    uncertainty_type:
      | "NONE"
      | "MODEL_MARGINAL"
      | "UNINDEXED_NEW_CLAIM"
      | "SERVICE_TIMEOUT"
      | "MISSING_COORDINATES";
  };
}

/**
 * Validates coordinate pair ensuring it's within world boundaries and not Null Island (0,0)
 */
function isValidCoord(lat: number | null | undefined, lon: number | null | undefined): boolean {
  if (lat == null || lon == null) return false;
  if (Math.abs(lat) < 0.0001 && Math.abs(lon) < 0.0001) return false; // Null Island
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

/**
 * Builds the authoritative Evidence Chain from PostgreSQL entities
 */
export function buildEvidenceChain(
  claim: any,
  riskAssessment: any | null,
  humanReviews: any[] = [],
  caseInvestigation: any | null = null
): EvidenceChain {
  const claimId = claim.claimId;
  const caseNumber = caseInvestigation?.caseNumber || `CASE-${claimId}`;
  const ra = riskAssessment;
  const latestReview = humanReviews && humanReviews.length > 0 ? humanReviews[0] : null;

  // 1. Determine Signal Type with exact taxonomy
  let signalType: EvidenceChain["signal_type"] = "NOMINAL_CLAIM";
  let signalLabel = "Klaim Nominal Wajar";

  if (!ra) {
    signalType = "UNINDEXED_NEW_CLAIM";
    signalLabel = "Klaim Baru Belum Terindeks Graf";
  } else if (ra.assessmentStatus === "UNAVAILABLE" || ra.assessmentStatus === "FAILED") {
    signalType = "AI_INFERENCE_UNAVAILABLE";
    signalLabel = "Layanan AI Tidak Tersedia";
  } else if (ra.spatialConflictDetected) {
    signalType = "SPATIOTEMPORAL_CONFLICT";
    signalLabel = "Benturan Waktu & Lokasi Praktik Dokter";
  } else if (ra.doctorDailyVolume > 30) {
    signalType = "PRACTITIONER_VOLUME_OVERCAPACITY";
    signalLabel = "Beban Volume Dokter Melebihi Kuota Harian";
  } else if (ra.fraudProbability >= 0.50 || claim.fraudScenario === "A") {
    signalType = "RELATIONAL_COLLUSION_CLUSTER";
    signalLabel = "Klaster Relasional Kolusif Multi-Hop";
  }

  // 2. Spatial Context & Coordinate Quality
  const lat = claim.facility?.latitude ?? 0;
  const lon = claim.facility?.longitude ?? 0;
  const coordValid = isValidCoord(lat, lon);

  // 3. Four-Layer Provenance Construction
  // Layer 1: Observed Facts
  const layer1 = {
    service_timestamp: `${claim.serviceDate} ${claim.serviceTime}`,
    patient_id: claim.patientId,
    doctor_sip: claim.doctor?.sipNumber || claim.doctorId,
    facility_id: claim.facilityId,
    tariff_idr: claim.inaCbgsTariff,
    length_of_stay: claim.lengthOfStay ?? 0,
    icd10_code: claim.icd10Code,
    icd9_code: claim.icd9Code || "-",
  };

  // Layer 2: Rule Evaluation
  const rulesChecked = [
    {
      rule_id: "RULE_SPATIAL_01",
      rule_name: "Deteksi Konflik Spasiotemporal Antar-Faskes",
      threshold_applied: "Jarak > 100 km & Interval < 2 Jam",
      observed_value: ra?.spatialConflictDetected ? "Konflik Terdeteksi" : "Sesuai Jadwal",
      triggered: ra?.spatialConflictDetected ?? false,
      evidence_text: ra?.spatialConflictDetected
        ? "Dokter tercatat melayani klaim di faskes berbeda pada rentang waktu yang mustahil ditempuh."
        : "Tidak terdeteksi benturan waktu layanan faskes berjarak jauh.",
    },
    {
      rule_id: "RULE_VOLUME_02",
      rule_name: "Batas Beban Layanan Harian Dokter",
      threshold_applied: "Maksimal 30 Klaim/Hari per DPJP",
      observed_value: `${ra?.doctorDailyVolume ?? 0} Klaim/Hari`,
      triggered: (ra?.doctorDailyVolume ?? 0) > 30,
      evidence_text: (ra?.doctorDailyVolume ?? 0) > 30
        ? `Volume dokter mencapai ${ra?.doctorDailyVolume} klaim pada tanggal yang sama, melebihi kuota 30 klaim.`
        : "Beban layanan harian dokter berada dalam batas wajar.",
    },
    {
      rule_id: "RULE_TARIFF_03",
      rule_name: "Ambang Batas Tarif Tunggal Klaim",
      threshold_applied: "Tarif > Rp 15.000.000",
      observed_value: `Rp ${claim.inaCbgsTariff.toLocaleString("id-ID")}`,
      triggered: claim.inaCbgsTariff > 15000000,
      evidence_text: claim.inaCbgsTariff > 15000000
        ? "Nilai klaim termasuk kategori tarif tinggi yang memerlukan telaah rincian tindakan INA-CBGs."
        : "Nilai tarif berada dalam rentang klaim standar.",
    },
  ];

  const layer2 = {
    rules_checked: rulesChecked,
    spatiotemporal_score: ra?.spatiotemporalRiskScore ?? 0,
  };

  // Layer 3: Graph Prediction
  const subgraphData = ra?.subgraphEvidence as any;
  const nodesCount = Array.isArray(subgraphData?.nodes) ? subgraphData.nodes.length : 0;
  const edgesCount = Array.isArray(subgraphData?.edges) ? subgraphData.edges.length : 0;

  const layer3 = {
    architecture: "PyTorch Geometric Hetero GraphSAGE (HeteroConv + SAGEConv)",
    relational_probability: ra?.fraudProbability ?? null,
    fraud_risk_index: ra?.fraudRiskIndex ?? null,
    risk_level: ra?.riskLevel || (ra ? "LOW" : "UNASSESSED"),
    topological_trigger: ra?.primaryFraudTrigger || (ra ? "Pola Graf Wajar" : "Belum Dianalisis"),
    subgraph_nodes_count: nodesCount,
    subgraph_edges_count: edgesCount,
    is_transductive_offline: true,
  };

  // Layer 4: Human Decision
  const reviewMetadata = (latestReview?.notes && latestReview.notes.includes("override:")) ? latestReview.notes : null;
  const layer4 = {
    current_status: caseInvestigation?.status || (latestReview ? latestReview.decision : "PENDING_REVIEW"),
    review_count: humanReviews.length,
    latest_decision: latestReview?.decision || null,
    latest_reviewer_name: latestReview?.reviewerName || null,
    latest_reviewer_role: latestReview?.reviewerRole || null,
    latest_notes: latestReview?.notes || null,
    override_reason: reviewMetadata,
    evidence_inspected: ["OBSERVED_FACTS", "RELATIONAL_SUBGRAPH", "SPATIOTEMPORAL_CONTEXT"],
    reviewed_at: latestReview?.reviewedAt ? new Date(latestReview.reviewedAt).toISOString() : null,
  };

  // 4. Graph Entities and Relations
  const graphEntitiesAndRelations: EvidenceChain["graph_entities_and_relations"] = {
    entities: {
      patient: {
        id: claim.patientId,
        pseudonymized: true,
        home_region: claim.patient?.homeRegion || "Wilayah Terdaftar",
      },
      doctor: {
        id: claim.doctorId,
        sip: claim.doctor?.sipNumber || "-",
        specialty: claim.doctor?.specialty || "-",
      },
      facility: {
        id: claim.facilityId,
        class: claim.facility?.facilityClass || "-",
      },
      claim: {
        id: claim.claimId,
        tariff_idr: claim.inaCbgsTariff,
        los_days: claim.lengthOfStay ?? 0,
        icd10: claim.icd10Code,
        icd9: claim.icd9Code || "-",
      },
    },
    relations: [
      {
        relation_type: "REGISTRATION",
        source: claim.patientId,
        target: claim.facilityId,
        description: "Pasien terdaftar dan menerbitkan SEP di fasilitas kesehatan",
      },
      {
        relation_type: "EXAMINATION",
        source: claim.patientId,
        target: claim.doctorId,
        description: "Pemeriksaan medis oleh dokter penanggung jawab pelayanan (DPJP)",
      },
      {
        relation_type: "AUTHORIZATION",
        source: claim.doctorId,
        target: claim.claimId,
        description: "Dokter mengesahkan resume medis dan penagihan berkas klaim",
      },
      {
        relation_type: "REFERRAL",
        source: claim.patientId,
        target: claim.facilityId,
        description: "Rujukan FKTP ke Fasilitas Kesehatan Rujukan Tingkat Lanjut (FKRTL)",
      },
    ],
  };

  // 5. Independent Traceability Verification & Completeness Scoring
  const limitations: string[] = [];

  // Layer 1 Verification (Observed facts integrity)
  const hasValidLayer1 = Boolean(
    claim?.claimId &&
    claim?.serviceDate &&
    claim?.serviceTime &&
    claim?.patientId &&
    claim?.doctorId &&
    claim?.facilityId &&
    typeof claim?.inaCbgsTariff === "number" &&
    claim.inaCbgsTariff >= 0
  );
  if (!hasValidLayer1) {
    limitations.push("Data primer berkas klaim tidak lengkap atau memiliki atribut identitas/tarif kosong.");
  }

  // Layer 2 Verification (Deterministic business rules & spatial integrity)
  const rulesEvaluated = Boolean(ra != null || (claim && claim.inaCbgsTariff != null));
  const spatialEvidenceValid = !ra?.spatialConflictDetected || coordValid;
  if (ra?.spatialConflictDetected && !coordValid) {
    limitations.push("Konflik spasiotemporal ditandai namun koordinat GPS faskes tidak sah (Null Island / Data Kosong).");
  } else if (!coordValid) {
    limitations.push("Koordinat GPS faskes tidak lengkap atau berada pada Null Island (0,0); perhitungan jarak dinonaktifkan.");
  }
  const hasValidLayer2 = rulesEvaluated && spatialEvidenceValid;

  // Layer 3 Verification (AI inference outcome)
  const hasValidLayer3 = Boolean(ra && ra.assessmentStatus === "COMPLETED" && typeof ra.fraudProbability === "number");
  if (!ra) {
    limitations.push("Klaim belum terindeks dalam topologi graf heterogen (menunggu siklus batch offline).");
  } else if (ra.assessmentStatus !== "COMPLETED") {
    limitations.push("Layanan inferensi AI mengalami gangguan konektivitas atau timeout.");
  }

  // Layer 4 Verification (Human-in-the-loop review)
  const hasValidLayer4 = Boolean(
    (latestReview && latestReview.decision) ||
    (caseInvestigation && caseInvestigation.status)
  );

  // Strict completeness score (0 - 100%)
  let completenessScore = 0;
  if (hasValidLayer1) completenessScore += 25;
  if (hasValidLayer2) completenessScore += 25;
  if (hasValidLayer3) completenessScore += 25;
  if (hasValidLayer4) completenessScore += 25;

  // Unexplained alert check: Flagged HIGH without any graph trigger or rule rationale
  const hasRiskFlag = (ra?.fraudRiskIndex ?? 0) >= 60 || Boolean(ra?.spatialConflictDetected) || (ra?.doctorDailyVolume ?? 0) > 30;
  const hasTriggerExplanation = Boolean(ra?.primaryFraudTrigger && ra.primaryFraudTrigger.trim().length > 0 && ra.primaryFraudTrigger !== "Tidak Ada Data Pemicu") || Boolean(ra?.spatialConflictDetected) || (ra?.doctorDailyVolume ?? 0) > 30;
  const unexplainedAlert = hasRiskFlag && !hasTriggerExplanation;
  if (unexplainedAlert) {
    limitations.push("Alert risiko tinggi tidak memiliki rujukan alasan pemicu graf atau aturan yang terverifikasi.");
  }

  // Dynamic Traceability: All required evidence layers must be verifiable
  let isTraceable = hasValidLayer1 && !unexplainedAlert;
  if (ra?.spatialConflictDetected && !coordValid) {
    isTraceable = false;
  }

  // 6. Uncertainty-Aware Triage Category
  let triageCategory: EvidenceChain["triage_profile"]["triage_category"] = "NOT_ANALYZED";
  let priority: "HIGH" | "MEDIUM" | "LOW" = "LOW";
  let priorityScore = 30;
  const priorityReasons: string[] = [];
  let uncertaintyType: EvidenceChain["triage_profile"]["uncertainty_type"] = "NONE";

  if (latestReview || caseInvestigation?.status === "RESOLVED" || caseInvestigation?.status === "CLOSED") {
    triageCategory = "REVIEWED";
    priority = "LOW";
    priorityScore = 10;
    priorityReasons.push("Telah selesai ditelaah oleh verifikator resmi");
  } else if (!ra) {
    triageCategory = "NOT_ANALYZED";
    priority = "MEDIUM";
    priorityScore = 55;
    uncertaintyType = "UNINDEXED_NEW_CLAIM";
    priorityReasons.push("Klaim baru belum terindeks graf: wajib verifikasi manual pra-pembayaran (Fail-Safe)");
  } else if (ra.assessmentStatus === "UNAVAILABLE" || ra.assessmentStatus === "FAILED") {
    triageCategory = "ANALYSIS_FAILED";
    priority = "HIGH";
    priorityScore = 75;
    uncertaintyType = "SERVICE_TIMEOUT";
    priorityReasons.push("Layanan AI gagal merespons: penanganan teknis dan telaah berkas manual diperlukan");
  } else if (!coordValid && ra.spatialConflictDetected) {
    triageCategory = "INSUFFICIENT_EVIDENCE";
    priority = "MEDIUM";
    priorityScore = 45;
    uncertaintyType = "MISSING_COORDINATES";
    priorityReasons.push("Bukti geospasial tidak lengkap: koordinat faskes tidak memenuhi kualifikasi");
  } else if (ra.fraudRiskIndex >= 70 || ra.spatialConflictDetected || (ra.doctorDailyVolume > 35 && claim.inaCbgsTariff > 10000000)) {
    triageCategory = "HIGH_RISK_REVIEW";
    priority = "HIGH";
    priorityScore = Math.max(80, ra.fraudRiskIndex);
    if (ra.fraudRiskIndex >= 70) priorityReasons.push(`Sinyal Relasional GNN Tinggi (FRI: ${ra.fraudRiskIndex})`);
    if (ra.spatialConflictDetected) priorityReasons.push("Benturan Spasiotemporal Antar-Faskes");
    if (ra.doctorDailyVolume > 30) priorityReasons.push(`Volume Dokter Ekstrem (${ra.doctorDailyVolume} Klaim/Hari)`);
  } else if (ra.fraudRiskIndex >= 40 || ra.doctorDailyVolume > 25) {
    triageCategory = "NEEDS_CLARIFICATION";
    priority = "MEDIUM";
    priorityScore = 50;
    uncertaintyType = "MODEL_MARGINAL";
    priorityReasons.push("Sinyal anomali marginal: klarifikasi berkas medis dan surat tugas DPJP");
  } else {
    triageCategory = "INSUFFICIENT_EVIDENCE";
    priority = "LOW";
    priorityScore = Math.max(15, ra.fraudRiskIndex);
    priorityReasons.push("Sinyal risiko rendah: prioritas verifikasi rutin standar");
  }

  return {
    claim_id: claimId,
    case_number: caseNumber,
    signal_type: signalType,
    signal_label: signalLabel,
    temporal_spatial_context: {
      service_date: claim.serviceDate,
      service_time: claim.serviceTime,
      facility_id: claim.facilityId,
      facility_class: claim.facility?.facilityClass || "-",
      coordinates: { latitude: lat, longitude: lon, is_valid: coordValid },
      doctor_home_facility: claim.doctor?.homeFacilityId || claim.facilityId,
      spatial_conflict_flag: ra?.spatialConflictDetected ?? false,
      doctor_daily_volume: ra?.doctorDailyVolume ?? 0,
    },
    graph_entities_and_relations: graphEntitiesAndRelations,
    four_layer_provenance: {
      layer_1_observed_facts: layer1,
      layer_2_rule_evaluation: layer2,
      layer_3_graph_prediction: layer3,
      layer_4_human_decision: layer4,
    },
    traceability_metrics: {
      evidence_completeness_pct: completenessScore,
      is_traceable: isTraceable,
      unexplained_alert: unexplainedAlert,
      analysis_limitations: limitations,
    },
    triage_profile: {
      triage_category: triageCategory,
      priority,
      priority_score: priorityScore,
      priority_reasons: priorityReasons,
      uncertainty_type: uncertaintyType,
    },
  };
}
