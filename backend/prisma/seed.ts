import { Prisma, PrismaClient } from "@prisma/client";
import { BENCHMARK_CLAIMS_FIXTURES } from "../src/lib/benchmark-fixtures";
import { hashPassword } from "../src/lib/auth";

const prisma = new PrismaClient();

async function main() {
  console.log("=================================================================");
  console.log("   AURA-JKN: SEEDING POSTGRESQL AUTHORITATIVE DATABASE          ");
  console.log("=================================================================\n");

  // 1. Seed RBAC role accounts (5 roles aligned with PRD Section C + legacy aliases)
  console.log("[Seed] 1/5 Mempersiapkan 5 akun RBAC resmi BPJS Kesehatan...");
  const defaultUsers = [
    {
      username: "admin_aura",
      fullName: "Administrator Keamanan Sistem BPJS",
      role: "ADMINISTRATOR",
      password: "admin_password_2026",
    },
    {
      username: "verifier_aura",
      fullName: "Verifikator Pra-Pembayaran Klaim BPJS",
      role: "VERIFIKATOR",
      password: "verifier_password_2026",
    },
    {
      username: "investigator_aura",
      fullName: "Investigator Anomali Klaim BPJS",
      role: "INVESTIGATOR",
      password: "investigator_password_2026",
    },
    {
      username: "supervisor_aura",
      fullName: "Supervisor Antrean & Eskalasi BPJS",
      role: "SUPERVISOR",
      password: "supervisor_password_2026",
    },
    {
      username: "analyst_aura",
      fullName: "Analis Kualitas Data & Model AI BPJS",
      role: "DATA_ANALYST",
      password: "analyst_password_2026",
    },
    // Backward compatibility aliases
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
  console.log("[Seed] -> 5 Akun RBAC resmi + 1 kompatibilitas aktif tersimpan di tabel 'users'.");

  // 2. Seed Reference Benchmark Evaluation Claims (Scenarios A, B, C, Normal)
  console.log("\n[Seed] 2/5 Menyimpan klaim acuan benchmark evaluasi (Skenario A, B, C, Normal)...");
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

  // 3. Seed Benchmark Cases & State Machine Transitions (Phase 6)
  console.log("\n[Seed] 3/5 Menyiapkan antrean kasus investigasi awal dari klaim berisiko...");
  const benchmarkClaimsToCase = BENCHMARK_CLAIMS_FIXTURES.filter(
    (b) => b.risk_level === "HIGH" || b.risk_level === "MEDIUM"
  );

  const caseStatuses = [
    { status: "FLAGGED_FOR_REVIEW", assignedTo: null, assignedRole: null, outcome: null },
    { status: "UNDER_REVIEW", assignedTo: "investigator_aura", assignedRole: "INVESTIGATOR", outcome: null },
    { status: "AWAITING_EVIDENCE", assignedTo: "verifier_aura", assignedRole: "VERIFIKATOR", outcome: null },
    { status: "ESCALATED", assignedTo: "supervisor_aura", assignedRole: "SUPERVISOR", outcome: null },
    { status: "RESOLVED", assignedTo: "investigator_aura", assignedRole: "INVESTIGATOR", outcome: "REFERRED_FOR_ACTION" },
  ];

  for (let i = 0; i < benchmarkClaimsToCase.length; i++) {
    const claim = benchmarkClaimsToCase[i];
    const caseMeta = caseStatuses[i % caseStatuses.length];
    const caseNumber = `CASE-20261024-${String(i + 1).padStart(4, "0")}`;

    const priorityScore = claim.fraud_risk_index ?? 75;
    const priority = priorityScore >= 70 ? "HIGH" : priorityScore >= 40 ? "MEDIUM" : "LOW";

    await prisma.caseInvestigation.upsert({
      where: { claimId: claim.claim_id },
      update: {
        status: caseMeta.status,
        priority,
        priorityScore,
        assignedTo: caseMeta.assignedTo,
        assignedRole: caseMeta.assignedRole,
        outcome: caseMeta.outcome,
      },
      create: {
        claimId: claim.claim_id,
        caseNumber,
        status: caseMeta.status,
        priority,
        priorityScore,
        assignedTo: caseMeta.assignedTo,
        assignedRole: caseMeta.assignedRole,
        assignedAt: caseMeta.assignedTo ? new Date() : null,
        reviewStartedAt: caseMeta.status !== "FLAGGED_FOR_REVIEW" ? new Date(Date.now() - 3600000 * 3) : null,
        resolvedAt: caseMeta.status === "RESOLVED" ? new Date() : null,
        slaDeadline: new Date(Date.now() + 86400000 * 2), // 48 jam ke depan
        outcome: caseMeta.outcome,
        outcomeNotes: caseMeta.status === "RESOLVED" ? "Temuan anomali spasiotemporal/volume dikonfirmasi tim verifikasi." : null,
        transitions: {
          create: [
            {
              fromStatus: "NEW",
              toStatus: "FLAGGED_FOR_REVIEW",
              actorName: "SYSTEM_PRE_PAYMENT_GATE",
              actorRole: "SYSTEM",
              notes: `Auto-flagged berdasarkan evaluasi AI R-GCN (FRI: ${priorityScore})`,
            },
            ...(caseMeta.status !== "FLAGGED_FOR_REVIEW"
              ? [
                  {
                    fromStatus: "FLAGGED_FOR_REVIEW",
                    toStatus: caseMeta.status,
                    actorName: caseMeta.assignedTo || "petugas_bpjs",
                    actorRole: caseMeta.assignedRole || "VERIFIKATOR",
                    notes: `Status transisi ke ${caseMeta.status} untuk pemeriksaan operasional.`,
                  },
                ]
              : []),
          ],
        },
      },
    });
  }
  console.log(`[Seed] -> ${benchmarkClaimsToCase.length} Kasus investigasi terhubung berhasil disiapkan.`);

  // 4. Seed Initial Human Reviews & Audit Logs (Controlled Feedback Loop)
  console.log("\n[Seed] 4/5 Menyiapkan sampel Human Review & Audit Trail awal...");
  const existingReviewsCount = await prisma.humanReview.count();
  if (existingReviewsCount === 0 && BENCHMARK_CLAIMS_FIXTURES.length > 0) {
    for (const item of BENCHMARK_CLAIMS_FIXTURES.slice(0, 3)) {
      const isHighRisk = item.risk_level === "HIGH";
      const decision = isHighRisk ? "ESCALATE_AUDIT" : "RELEASE";
      const feedbackLabel = isHighRisk ? 1 : 0;
      const notes = isHighRisk
        ? `Verifikasi pra-pembayaran menemukan indikasi kuat anomali (${item.xai_explanation.primary_fraud_trigger}). Dieskalasi untuk audit.`
        : "Dokumen klaim dan CPPT sesuai prosedur standar INA-CBGs. Pembayaran dapat diteruskan.";

      const rev = await prisma.humanReview.create({
        data: {
          claimId: item.claim_id,
          reviewerName: "Verifikator Pra-Pembayaran Klaim BPJS",
          reviewerRole: "VERIFIKATOR",
          decision,
          notes,
          feedbackLabel,
        },
      });

      await prisma.auditLog.create({
        data: {
          actorName: "Verifikator Pra-Pembayaran Klaim BPJS",
          actorRole: "VERIFIKATOR",
          action: `HUMAN_REVIEW_${decision}`,
          targetId: item.claim_id,
          metadata: {
            decision,
            feedbackLabel,
            reviewId: rev.id,
            seeded: true,
          },
        },
      });
    }
  }
  console.log("[Seed] -> Sampel Human Review (Controlled Feedback Loop) & Audit Log tercatat.");

  // 5. Seed Initial Ingestion Batch (Phase 1)
  console.log("\n[Seed] 5/5 Merekam catatan riwayat ingestion batch awal...");
  await prisma.ingestionBatch.upsert({
    where: { batchId: "BATCH-20261024-HEALTHKATHON-INIT" },
    update: {},
    create: {
      batchId: "BATCH-20261024-HEALTHKATHON-INIT",
      sourceDataset: "competition_official_parquet",
      datasetType: "MIXED",
      totalRead: 25000,
      totalValid: 24988,
      totalRejected: 12,
      totalDuplicates: 0,
      status: "COMPLETED",
      startedAt: new Date(Date.now() - 3600000 * 4),
      completedAt: new Date(Date.now() - 3600000 * 3),
      durationMs: 42000,
      initiatedBy: "SYSTEM_AUTO_SEED",
      notes: "Inisialisasi dataset resmi BPJS Kesehatan Healthkathon 2026 via seed runner.",
      rejectionReasons: [
        { reason: "INVALID_ICD10_FORMAT", count: 7 },
        { reason: "OUT_OF_BOUNDS_COORDINATES", count: 5 },
      ],
    },
  });
  console.log("[Seed] -> Batch Ingestion resmi tercatat di PostgreSQL.");

  // Summary counts
  const caseCount = await prisma.caseInvestigation.count();
  const batchCount = await prisma.ingestionBatch.count();
  const claimCount = await prisma.claim.count();
  const raCount = await prisma.riskAssessment.count();
  const revCount = await prisma.humanReview.count();
  const auditCount = await prisma.auditLog.count();
  const patCount = await prisma.patient.count();
  const docCount = await prisma.doctor.count();
  const facCount = await prisma.facility.count();
  const userCount = await prisma.user.count();

  console.log("\n=================================================================");
  console.log("   DATABASE POSTGRESQL AURA-JKN BERHASIL DIISI PENUH!            ");
  console.log("=================================================================");
  console.log(`   - Total Klaim di DB:           ${claimCount.toLocaleString()}`);
  console.log(`   - Total Asesmen Risiko di DB:  ${raCount.toLocaleString()}`);
  console.log(`   - Total Kasus Investigasi:     ${caseCount.toLocaleString()}`);
  console.log(`   - Total Human Reviews (Loop):  ${revCount.toLocaleString()}`);
  console.log(`   - Total Audit Logs:            ${auditCount.toLocaleString()}`);
  console.log(`   - Total Batch Ingestion:       ${batchCount.toLocaleString()}`);
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
