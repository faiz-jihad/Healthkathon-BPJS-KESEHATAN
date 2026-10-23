import { Prisma, PrismaClient } from "@prisma/client";
import { BENCHMARK_CLAIMS_FIXTURES } from "../src/lib/benchmark-fixtures";
import { hashPassword } from "../src/lib/auth";
import { execSync } from "child_process";
import path from "path";

const prisma = new PrismaClient();

async function main() {
  console.log("=================================================================");
  console.log("   AURA-JKN: SEEDING POSTGRESQL AUTHORITATIVE DATABASE          ");
  console.log("=================================================================\n");

  // 1. Seed RBAC role accounts
  console.log("[Seed] 1/3 Mempersiapkan 4 akun RBAC bawaan BPJS Kesehatan...");
  const defaultUsers = [
    {
      username: "admin_aura",
      fullName: "Administrator Keamanan Sistem BPJS",
      role: "ADMINISTRATOR",
      password: "admin_password_2026",
    },
    {
      username: "analyst_aura",
      fullName: "Analis Investigasi Fraud BPJS",
      role: "FRAUD_ANALYST",
      password: "analyst_password_2026",
    },
    {
      username: "verifier_aura",
      fullName: "Verifikator Pra-Pembayaran Klaim BPJS",
      role: "CLAIM_VERIFIER",
      password: "verifier_password_2026",
    },
    {
      username: "auditor_aura",
      fullName: "Auditor Kepatuhan & Tata Kelola BPJS",
      role: "AUDITOR",
      password: "auditor_password_2026",
    },
  ];

  for (const u of defaultUsers) {
    const { hash, salt } = hashPassword(u.password);
    await prisma.user.upsert({
      where: { username: u.username },
      update: {
        role: u.role,
        fullName: u.fullName,
      },
      create: {
        username: u.username,
        passwordHash: hash,
        salt,
        fullName: u.fullName,
        role: u.role,
        isActive: true,
      },
    });
  }
  console.log("[Seed] -> 4 Akun RBAC aktif tersimpan di tabel 'users'.");

  // 2. Seed Reference Benchmark Evaluation Claims (Scenarios A, B, C, Normal)
  console.log("\n[Seed] 2/3 Menyimpan klaim acuan benchmark evaluasi (Skenario A, B, C, Normal)...");
  for (const item of BENCHMARK_CLAIMS_FIXTURES) {
    // 2a. Upsert Facility
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

    // 2b. Upsert Doctor
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

    // 2c. Upsert Patient
    await prisma.patient.upsert({
      where: { patientId: item.patient_id },
      update: {},
      create: {
        patientId: item.patient_id,
        homeRegion: item.home_region,
      },
    });

    // 2d. Upsert Claim & RiskAssessment
    await prisma.claim.upsert({
      where: { claimId: item.claim_id },
      update: {
        fraudScenario: item.fraud_scenario,
        isSynthetic: true,
      },
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
        isSynthetic: true,
        riskAssessment: {
          create: {
            assessmentStatus: "COMPLETED",
            fraudProbability: item.fraud_probability ?? 0,
            fraudRiskIndex: item.fraud_risk_index ?? 0,
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
            modelVersion: "1.0.0",
          },
        },
      },
    });
  }
  console.log(`[Seed] -> ${BENCHMARK_CLAIMS_FIXTURES.length} Klaim benchmark acuan tersimpan di PostgreSQL.`);

  // 3. Trigger Bulk Parquet Importer to populate full dataset from data/*.parquet
  console.log("\n[Seed] 3/3 Menjalankan impor massal dataset resmi (data/*.parquet)...");
  try {
    const rootDir = path.resolve(__dirname, "../..");
    const pythonScript = path.join(rootDir, "seed_parquet_to_db.py");
    execSync(`python "${pythonScript}"`, { stdio: "inherit", cwd: rootDir });
  } catch (pyErr: any) {
    console.warn("[Seed Warning] Gagal mengeksekusi Python bulk importer otomatis:", pyErr?.message);
    console.log("[Seed Info] Anda dapat menjalankan langsung: python seed_parquet_to_db.py");
  }

  // Summary counts
  const claimCount = await prisma.claim.count();
  const raCount = await prisma.riskAssessment.count();
  const patCount = await prisma.patient.count();
  const docCount = await prisma.doctor.count();
  const facCount = await prisma.facility.count();
  const userCount = await prisma.user.count();

  console.log("\n=================================================================");
  console.log("   DATABASE POSTGRESQL AURA-JKN BERHASIL DIISI PENUH!            ");
  console.log("=================================================================");
  console.log(`   - Total Klaim di DB:           ${claimCount.toLocaleString()}`);
  console.log(`   - Total Asesmen Risiko di DB:  ${raCount.toLocaleString()}`);
  console.log(`   - Total Pasien di DB:          ${patCount.toLocaleString()}`);
  console.log(`   - Total Dokter di DB:          ${docCount.toLocaleString()}`);
  console.log(`   - Total Faskes di DB:          ${facCount.toLocaleString()}`);
  console.log(`   - Total Akun RBAC di DB:       ${userCount}`);
  console.log("=================================================================\n");
}

main()
  .catch((e) => {
    console.error("[Seed Error]", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
