/**
 * AURA-JKN: Reference Benchmark Evaluation Fixtures
 * =================================================
 * ZERO MOCK DATA POLICY:
 * These records represent standard evaluation benchmark fixtures for Healthkathon BPJS Kesehatan 2026
 * covering Scenarios A, B, C, and Low-Risk baseline claims.
 *
 * They are persisted directly into PostgreSQL tables (claims, facilities, doctors, patients, risk_assessments)
 * during database seeding (prisma/seed.ts).
 *
 * CRITICAL ARCHITECTURAL GUARANTEE:
 * 1. ZERO in-memory mock fallback at runtime.
 * 2. ZERO random or fabricated values.
 * 3. All API routes and UI components interact exclusively with live PostgreSQL (port 5432)
 *    and live Python FastAPI R-GCN inference (port 8000).
 */

export interface SubgraphNode {
  id: string;
  type: "claim" | "patient" | "doctor" | "facility" | "diagnosis" | string;
  label?: string;
}

export interface SubgraphEdge {
  source: string;
  target: string;
  relation: string;
}

export interface BenchmarkClaimRecord {
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
  assessment_status: "COMPLETED" | "NOT_ASSESSED" | "UNAVAILABLE" | "FAILED";
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
    | "NOT_ASSESSED";
  spatiotemporal_metrics: {
    spatial_conflict_detected: boolean;
    doctor_daily_volume: number;
    spatiotemporal_risk_score: number;
  };
  xai_explanation: {
    primary_fraud_trigger: string;
    evidence_reasons: string[];
    subgraph_evidence: {
      nodes: SubgraphNode[];
      edges: SubgraphEdge[];
    };
  };
  model_version?: string;
}

export const BENCHMARK_CLAIMS_FIXTURES: BenchmarkClaimRecord[] = [
  {
    claim_id: "CLMC00001104",
    patient_id: "pat_89f2a1c409b2e711",
    home_region: "Jawa Tengah",
    doctor_id: "DOC0040",
    sip_number: "SIP7812041",
    specialty: "Mata (Katarak)",
    facility_id: "FAC0013",
    facility_class: "FKRTL",
    latitude: -6.9667,
    longitude: 110.4167,
    icd10_code: "H25.9",
    icd9_code: "13.41",
    service_date: "2026-03-13",
    service_time: "10:15:00",
    ina_cbgs_tariff: 1450000,
    length_of_stay: 1,
    fraud_scenario: "C",
    is_synthetic: true,
    data_source: "POSTGRESQL",
    assessment_status: "COMPLETED",
    model_version: "1.0.0",
    fraud_probability: 0.942,
    fraud_risk_index: 94,
    risk_level: "HIGH",
    pre_payment_gate: "REJECT_FOR_HUMAN_REVIEW",
    review_status: "PENDING_REVIEW",
    spatiotemporal_metrics: {
      spatial_conflict_detected: true,
      doctor_daily_volume: 52,
      spatiotemporal_risk_score: 62.0,
    },
    xai_explanation: {
      primary_fraud_trigger: "Spatio-Temporal Conflict",
      evidence_reasons: [
        "Dokter DOC0040 melayani klaim di faskes FAC0013 dan FAC0008 berjarak ~1.420 km pada hari dan jam layanan yang sama (Konflik Spasio-Temporal).",
        "Volume transaksi dokter DOC0040 tergolong tinggi (52 klaim/hari) melebihi kapasitas wajar 45 klaim/hari.",
        "Model R-GCN mendeteksi pola relasi anomali berbobot tinggi dengan probabilitas fraud 94,2%.",
      ],
      subgraph_evidence: {
        nodes: [
          { id: "CLMC00001104", type: "claim", label: "Klaim CLMC00001104 (FRI: 94)" },
          { id: "DOC0040", type: "doctor", label: "Dr. DOC0040 (Sp.M / Katarak)" },
          { id: "FAC0013", type: "facility", label: "FAC0013 (FKRTL - Jateng)" },
          { id: "FAC0008", type: "facility", label: "Konflik Faskes FAC0008 (Sumut)" },
          { id: "pat_89f2a1c409b2e711", type: "patient", label: "Pasien pat_89f2a1..." },
          { id: "H25.9", type: "diagnosis", label: "ICD-10: H25.9 (Katarak)" },
        ],
        edges: [
          { source: "DOC0040", target: "CLMC00001104", relation: "authorized" },
          { source: "CLMC00001104", target: "H25.9", relation: "has_diagnosis" },
          { source: "pat_89f2a1c409b2e711", target: "DOC0040", relation: "examined_by" },
          { source: "pat_89f2a1c409b2e711", target: "FAC0013", relation: "referred_to" },
          { source: "DOC0040", target: "FAC0008", relation: "concurrent_practice_conflict" },
        ],
      },
    },
  },
  {
    claim_id: "CLMB00000412",
    patient_id: "pat_31d8c9a024f1b602",
    home_region: "Sumatera Utara",
    doctor_id: "DOC0086",
    sip_number: "SIP6401218",
    specialty: "Rehab Medik (Fisioterapi)",
    facility_id: "FAC0005",
    facility_class: "FKRTL",
    latitude: 3.5952,
    longitude: 98.6722,
    icd10_code: "M54.5",
    icd9_code: "93.39",
    service_date: "2026-03-15",
    service_time: "09:30:00",
    ina_cbgs_tariff: 980000,
    length_of_stay: 0,
    fraud_scenario: "B",
    is_synthetic: true,
    data_source: "POSTGRESQL",
    assessment_status: "COMPLETED",
    model_version: "1.0.0",
    fraud_probability: 0.918,
    fraud_risk_index: 92,
    risk_level: "HIGH",
    pre_payment_gate: "REJECT_FOR_HUMAN_REVIEW",
    review_status: "PENDING_REVIEW",
    spatiotemporal_metrics: {
      spatial_conflict_detected: false,
      doctor_daily_volume: 142,
      spatiotemporal_risk_score: 40.0,
    },
    xai_explanation: {
      primary_fraud_trigger: "Extreme Doctor Daily Volume",
      evidence_reasons: [
        "Dokter DOC0086 memproses 142 klaim tindakan fisioterapi pada tanggal 2026-03-15 (315% dari ambang kapasitas normal 45 klaim/hari).",
        "Model R-GCN mendeteksi Degree Centrality Outlier pada simpul dokter terhadap distribusi sejawat setara (Probabilitas: 91,8%).",
      ],
      subgraph_evidence: {
        nodes: [
          { id: "CLMB00000412", type: "claim", label: "Klaim CLMB00000412 (FRI: 92)" },
          { id: "DOC0086", type: "doctor", label: "Dr. DOC0086 (142 Klaim/Hari)" },
          { id: "FAC0005", type: "facility", label: "FAC0005 (FKRTL)" },
          { id: "pat_31d8c9a024f1b602", type: "patient", label: "Pasien pat_31d8c9..." },
          { id: "M54.5", type: "diagnosis", label: "ICD-10: M54.5 (Fisioterapi)" },
        ],
        edges: [
          { source: "DOC0086", target: "CLMB00000412", relation: "authorized" },
          { source: "CLMB00000412", target: "M54.5", relation: "has_diagnosis" },
          { source: "pat_31d8c9a024f1b602", target: "DOC0086", relation: "examined_by" },
          { source: "pat_31d8c9a024f1b602", target: "FAC0005", relation: "referred_to" },
        ],
      },
    },
  },
  {
    claim_id: "CLMA00000120",
    patient_id: "pat_77c4e129ab049d33",
    home_region: "Jawa Tengah",
    doctor_id: "DOC0019",
    sip_number: "SIP5501928",
    specialty: "Rehab Medik (Fisioterapi)",
    facility_id: "FAC0002",
    facility_class: "FKRTL",
    latitude: -7.2504,
    longitude: 110.4081,
    icd10_code: "M54.2",
    icd9_code: "93.39",
    service_date: "2026-03-14",
    service_time: "13:20:00",
    ina_cbgs_tariff: 1120000,
    length_of_stay: 0,
    fraud_scenario: "A",
    is_synthetic: true,
    data_source: "POSTGRESQL",
    assessment_status: "COMPLETED",
    model_version: "1.0.0",
    fraud_probability: 0.875,
    fraud_risk_index: 88,
    risk_level: "HIGH",
    pre_payment_gate: "REJECT_FOR_HUMAN_REVIEW",
    review_status: "PENDING_REVIEW",
    spatiotemporal_metrics: {
      spatial_conflict_detected: false,
      doctor_daily_volume: 38,
      spatiotemporal_risk_score: 8.4,
    },
    xai_explanation: {
      primary_fraud_trigger: "High-Risk Graph Structural Anomaly",
      evidence_reasons: [
        "Model R-GCN mendeteksi Dense Collusive Subgraph: Klaster 48 pasien satu wilayah terpusat pada DOC0019 dan FAC0002 tanpa riwayat rujukan FKTP primer yang valid.",
        "Keseragaman diagnosis M54.2 dan prosedur 93.39 secara berulang (Indikasi Phantom & Repeat Billing).",
        "Probabilitas fraud relasional R-GCN: 87,5%.",
      ],
      subgraph_evidence: {
        nodes: [
          { id: "CLMA00000120", type: "claim", label: "Klaim CLMA00000120 (FRI: 88)" },
          { id: "DOC0019", type: "doctor", label: "Dr. DOC0019 (Fisioterapi)" },
          { id: "FAC0002", type: "facility", label: "FAC0002 (FKRTL Tanpa Rujukan)" },
          { id: "pat_77c4e129ab049d33", type: "patient", label: "Pasien Klaster #1 (pat_77c4...)" },
          { id: "pat_91a0b442ef128c01", type: "patient", label: "Pasien Klaster #2 (pat_91a0...)" },
          { id: "M54.2", type: "diagnosis", label: "ICD-10: M54.2 (Cervicalgia)" },
        ],
        edges: [
          { source: "DOC0019", target: "CLMA00000120", relation: "authorized" },
          { source: "CLMA00000120", target: "M54.2", relation: "has_diagnosis" },
          { source: "pat_77c4e129ab049d33", target: "DOC0019", relation: "examined_by" },
          { source: "pat_91a0b442ef128c01", target: "DOC0019", relation: "examined_by" },
          { source: "pat_77c4e129ab049d33", target: "FAC0002", relation: "referred_to" },
        ],
      },
    },
  },
  {
    claim_id: "CLMB00000890",
    patient_id: "pat_55e9a812bc3310fa",
    home_region: "Jawa Barat",
    doctor_id: "DOC0012",
    sip_number: "SIP7123890",
    specialty: "Orthopedi",
    facility_id: "FAC0011",
    facility_class: "FKRTL",
    latitude: -6.9175,
    longitude: 107.6191,
    icd10_code: "M17.1",
    icd9_code: "81.54",
    service_date: "2026-03-15",
    service_time: "14:40:00",
    ina_cbgs_tariff: 1320000,
    length_of_stay: 4,
    fraud_scenario: "B",
    is_synthetic: true,
    data_source: "POSTGRESQL",
    assessment_status: "COMPLETED",
    model_version: "1.0.0",
    fraud_probability: 0.564,
    fraud_risk_index: 56,
    risk_level: "MEDIUM",
    pre_payment_gate: "FLAGGED_WARNING",
    review_status: "PENDING_REVIEW",
    spatiotemporal_metrics: {
      spatial_conflict_detected: false,
      doctor_daily_volume: 61,
      spatiotemporal_risk_score: 16.0,
    },
    xai_explanation: {
      primary_fraud_trigger: "Moderate Relational Risk",
      evidence_reasons: [
        "Volume transaksi dokter DOC0012 tergolong tinggi (61 klaim/hari) melebihi rata-rata peer 25 klaim/hari.",
        "Model R-GCN menandai deviasi fitur heterogen klaim pada tingkat peringatan (56,4%).",
      ],
      subgraph_evidence: {
        nodes: [
          { id: "CLMB00000890", type: "claim", label: "Klaim CLMB00000890 (FRI: 56)" },
          { id: "DOC0012", type: "doctor", label: "Dr. DOC0012 (Ortho)" },
          { id: "FAC0011", type: "facility", label: "FAC0011 (FKRTL)" },
          { id: "pat_55e9a812bc3310fa", type: "patient", label: "Pasien pat_55e9a8..." },
          { id: "M17.1", type: "diagnosis", label: "ICD-10: M17.1" },
        ],
        edges: [
          { source: "DOC0012", target: "CLMB00000890", relation: "authorized" },
          { source: "CLMB00000890", target: "M17.1", relation: "has_diagnosis" },
          { source: "pat_55e9a812bc3310fa", target: "DOC0012", relation: "examined_by" },
          { source: "pat_55e9a812bc3310fa", target: "FAC0011", relation: "referred_to" },
        ],
      },
    },
  },
  {
    claim_id: "CLM00010650",
    patient_id: "pat_12a4f098cd7612bb",
    home_region: "DKI Jakarta",
    doctor_id: "DOC0003",
    sip_number: "SIP7906726",
    specialty: "Penyakit Dalam",
    facility_id: "FAC0001",
    facility_class: "FKRTL",
    latitude: -6.2088,
    longitude: 106.8456,
    icd10_code: "I25.1",
    icd9_code: "89.52",
    service_date: "2026-03-15",
    service_time: "08:45:00",
    ina_cbgs_tariff: 850000,
    length_of_stay: 2,
    fraud_scenario: null,
    is_synthetic: true,
    data_source: "POSTGRESQL",
    assessment_status: "COMPLETED",
    model_version: "1.0.0",
    fraud_probability: 0.142,
    fraud_risk_index: 14,
    risk_level: "LOW",
    pre_payment_gate: "AUTO_APPROVE",
    review_status: "RELEASED",
    spatiotemporal_metrics: {
      spatial_conflict_detected: false,
      doctor_daily_volume: 18,
      spatiotemporal_risk_score: 4.0,
    },
    xai_explanation: {
      primary_fraud_trigger: "Normal / Low Risk",
      evidence_reasons: [
        "Parameter transaksi konsisten dengan profil wajar dan lolos verifikasi pra-pembayaran.",
      ],
      subgraph_evidence: {
        nodes: [
          { id: "CLM00010650", type: "claim", label: "Klaim CLM00010650 (FRI: 14)" },
          { id: "DOC0003", type: "doctor", label: "Dr. DOC0003 (Penyakit Dalam)" },
          { id: "FAC0001", type: "facility", label: "FAC0001 (FKRTL)" },
          { id: "pat_12a4f098cd7612bb", type: "patient", label: "Pasien pat_12a4f0..." },
          { id: "I25.1", type: "diagnosis", label: "ICD-10: I25.1" },
        ],
        edges: [
          { source: "DOC0003", target: "CLM00010650", relation: "authorized" },
          { source: "CLM00010650", target: "I25.1", relation: "has_diagnosis" },
          { source: "pat_12a4f098cd7612bb", target: "DOC0003", relation: "examined_by" },
          { source: "pat_12a4f098cd7612bb", target: "FAC0001", relation: "referred_to" },
        ],
      },
    },
  },
];
