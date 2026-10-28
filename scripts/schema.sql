-- ==============================================================================
-- AURA-JKN: PostgreSQL Database Schema
-- Task: BPJS Kesehatan Fraud Detection & Decision Audit System
-- ==============================================================================

-- 1. Healthcare Facilities (Faskes)
CREATE TABLE IF NOT EXISTS facilities (
    facility_id VARCHAR(50) PRIMARY KEY,
    facility_class VARCHAR(20) NOT NULL, -- FKTP / FKRTL
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    region_name VARCHAR(100),
    dati2 INT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Doctors (Tenaga Medis)
CREATE TABLE IF NOT EXISTS doctors (
    doctor_id VARCHAR(50) PRIMARY KEY,
    sip_number VARCHAR(50) NOT NULL,
    specialty VARCHAR(50) NOT NULL,
    home_facility_id VARCHAR(50) REFERENCES facilities(facility_id) ON DELETE SET NULL,
    schedule_hours INT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Patients (Peserta Pseudonim)
CREATE TABLE IF NOT EXISTS patients (
    patient_id VARCHAR(100) PRIMARY KEY,
    nik VARCHAR(50),
    name VARCHAR(100),
    home_region VARCHAR(50),
    referral_history_id VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Claims & AURA-JKN Decision Audits
CREATE TABLE IF NOT EXISTS claims (
    claim_id VARCHAR(50) PRIMARY KEY,
    patient_id VARCHAR(100) REFERENCES patients(patient_id) ON DELETE CASCADE,
    doctor_id VARCHAR(50) REFERENCES doctors(doctor_id) ON DELETE CASCADE,
    facility_id VARCHAR(50) REFERENCES facilities(facility_id) ON DELETE CASCADE,
    icd10_code TEXT NOT NULL,
    icd9_code TEXT,
    service_date DATE NOT NULL,
    service_time TIME NOT NULL,
    ina_cbgs_tariff NUMERIC(14, 2) NOT NULL,
    length_of_stay INT DEFAULT 0,
    fktp_referral_id VARCHAR(100),
    referral_facility_id VARCHAR(50),
    dati2 INT,
    referral_distance_to_fktp DOUBLE PRECISION DEFAULT 0.0,
    referral_distance_missing BOOLEAN DEFAULT TRUE,
    
    -- Ground Truth Label (for training/evaluation)
    is_fraud INT DEFAULT 0,
    fraud_scenario VARCHAR(50),
    
    -- AURA-JKN Real-Time Inference Results
    fraud_probability DOUBLE PRECISION,
    risk_level VARCHAR(20),                -- HIGH, MEDIUM, LOW
    pre_payment_gate VARCHAR(50),           -- REJECT_FOR_HUMAN_REVIEW, FLAGGED_WARNING, AUTO_APPROVE
    spatiotemporal_risk_score DOUBLE PRECISION,
    spatial_conflict_detected BOOLEAN DEFAULT FALSE,
    doctor_daily_volume INT,
    primary_fraud_trigger VARCHAR(100),
    evidence_reasons JSONB,                -- Array of textual explanations
    subgraph_evidence JSONB,               -- Graph nodes and edges for UI visualization
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================================
-- Performance Indexes for Fast Spatiotemporal Queries
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_claims_doctor_date ON claims (doctor_id, service_date);
CREATE INDEX IF NOT EXISTS idx_claims_patient_date ON claims (patient_id, service_date);
CREATE INDEX IF NOT EXISTS idx_claims_facility ON claims (facility_id);
CREATE INDEX IF NOT EXISTS idx_claims_gate ON claims (pre_payment_gate);
CREATE INDEX IF NOT EXISTS idx_claims_risk ON claims (risk_level);
