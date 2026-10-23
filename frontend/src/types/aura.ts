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

export interface ClaimRecord {
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
  data_source: "POSTGRESQL" | "SYNTHETIC_DEMO";
  assessment_status: "COMPLETED" | "NOT_ASSESSED" | "UNAVAILABLE" | "FAILED";
  analysis_status?: "ANALYSIS_SUCCESS" | "ANALYSIS_UNAVAILABLE" | "NOT_ANALYZED";
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
  human_reviews: Array<{
    id: string;
    reviewer_name: string;
    reviewer_role: string;
    decision: string;
    notes: string;
    reviewed_at: string;
  }>;
}

export interface ClaimsListResponse {
  storage_source: "postgresql" | "in_memory_demonstration" | string;
  is_synthetic: boolean;
  data_source_label: string;
  summary: {
    total_claims: number;
    high_risk_count: number;
    medium_risk_count: number;
    low_risk_count: number;
    unassessed_count: number;
    held_tariff_idr: number;
  };
  claims: ClaimRecord[];
}
