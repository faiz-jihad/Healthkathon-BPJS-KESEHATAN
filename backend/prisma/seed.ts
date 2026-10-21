import { Prisma, PrismaClient } from "@prisma/client";
import { INITIAL_CLAIMS_DATASET } from "../src/lib/mock-store";

const prisma = new PrismaClient();

async function main() {
  console.log("[Seed] Memulai proses seeding database PostgreSQL AURA-JKN...");

  for (const item of INITIAL_CLAIMS_DATASET) {
    // 1. Upsert Facility
    await prisma.facility.upsert({
      where: { facilityId: item.facility_id },
      update: {},
      create: {
        facilityId: item.facility_id,
        facilityClass: item.facility_class,
        latitude: item.latitude,
        longitude: item.longitude,
      },
    });

    // 2. Upsert Doctor
    await prisma.doctor.upsert({
      where: { doctorId: item.doctor_id },
      update: {},
      create: {
        doctorId: item.doctor_id,
        sipNumber: item.sip_number,
        specialty: item.specialty,
        homeFacilityId: item.facility_id,
        scheduleHours: 40,
      },
    });

    // 3. Upsert Patient (Pseudonymized)
    await prisma.patient.upsert({
      where: { patientId: item.patient_id },
      update: {},
      create: {
        patientId: item.patient_id,
        homeRegion: item.home_region,
      },
    });

    // 4. Upsert Claim & RiskAssessment
    await prisma.claim.upsert({
      where: { claimId: item.claim_id },
      update: {},
      create: {
        claimId: item.claim_id,
        patientId: item.patient_id,
        doctorId: item.doctor_id,
        facilityId: item.facility_id,
        icd10Code: item.icd10_code,
        icd9Code: item.icd9_code,
        serviceDate: item.service_date,
        serviceTime: item.service_time,
        inaCbgsTariff: item.ina_cbgs_tariff,
        lengthOfStay: item.length_of_stay,
        fraudScenario: item.fraud_scenario,
        riskAssessment: {
          create: {
            fraudProbability: item.fraud_probability,
            fraudRiskIndex: item.fraud_risk_index,
            riskLevel: item.risk_level,
            prePaymentGate: item.pre_payment_gate,
            spatialConflictDetected: item.spatiotemporal_metrics.spatial_conflict_detected,
            doctorDailyVolume: item.spatiotemporal_metrics.doctor_daily_volume,
            spatiotemporalRiskScore: item.spatiotemporal_metrics.spatiotemporal_risk_score,
            primaryFraudTrigger: item.xai_explanation.primary_fraud_trigger,
            evidenceReasons:
              item.xai_explanation.evidence_reasons as unknown as Prisma.InputJsonValue,
            subgraphEvidence:
              item.xai_explanation.subgraph_evidence as unknown as Prisma.InputJsonValue,
          },
        },
      },
    });
  }

  console.log(`[Seed] Berhasil menyimpan ${INITIAL_CLAIMS_DATASET.length} klaim sampel ke PostgreSQL!`);
}

main()
  .catch((e) => {
    console.error("[Seed Error]", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
