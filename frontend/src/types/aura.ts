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
    | "NOT_ASSESSED"
    | "NOT_ANALYZED";
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
  structured_evidence?: {
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
  };
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
    unassessed_count?: number;
    not_analyzed_count?: number;
    held_tariff_idr: number;
    avg_fri?: number;
  };
  claims: ClaimRecord[];
}

export interface FeedbackExportItem {
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
  feedback_meaning: string;
  notes: string;
  reviewed_at: string;
}

export interface FeedbackExportResponse {
  status: string;
  storage_source: string;
  summary: {
    total_reviews: number;
    labeled_for_retraining_count: number;
    confirmed_fraud_label_1_count: number;
    legitimate_label_0_count: number;
    pending_clarification_count: number;
  };
  records: FeedbackExportItem[];
}
