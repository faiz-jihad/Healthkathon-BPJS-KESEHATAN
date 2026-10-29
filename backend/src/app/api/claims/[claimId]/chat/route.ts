import { prisma } from "../../../../../lib/prisma";
import { getAuthenticatedUser, hasPermission, PERMISSIONS } from "../../../../../lib/auth";
import { chatWithClaimCopilot, ClaimContextData, CopilotChatMessage } from "../../../../../lib/llm-copilot";

// ==============================================================================
// POST /api/claims/[claimId]/chat
// Interactive AI Audit Copilot Chat Proxy & Multi-Tier LLM Endpoint
// Routes: Frontend -> Next.js Backend -> FastAPI AI Service / Groq / NVIDIA NIM / Local Rule Engine
// ==============================================================================
export async function POST(
  request: Request,
  { params }: { params: { claimId: string } }
) {
  const user = getAuthenticatedUser(request);
  if (!user) {
    return Response.json(
      {
        status: "UNAUTHENTICATED",
        error: "Akses ditolak. Sesi otorisasi atau token Bearer yang valid wajib disertakan.",
      },
      { status: 401 }
    );
  }

  const canView =
    hasPermission(user.role, PERMISSIONS.VIEW_CLAIMS) ||
    hasPermission(user.role, PERMISSIONS.VIEW_CLAIMS_READONLY);
  if (!canView) {
    return Response.json(
      {
        status: "UNAUTHORIZED_ROLE",
        error: `Role '${user.role}' tidak memiliki kewenangan mengakses Copilot Audit Klaim.`,
      },
      { status: 403 }
    );
  }

  const claimId = params?.claimId?.trim();
  if (!claimId) {
    return Response.json(
      { status: "VALIDATION_ERROR", error: "Parameter claimId tidak boleh kosong." },
      { status: 400 }
    );
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { status: "VALIDATION_ERROR", error: "Body request harus berformat JSON yang valid." },
      { status: 400 }
    );
  }

  const userMessage = typeof body.user_message === "string" ? body.user_message.trim() : "";
  if (!userMessage) {
    return Response.json(
      { status: "VALIDATION_ERROR", error: "Pesan pertanyaan (user_message) tidak boleh kosong." },
      { status: 400 }
    );
  }

  const rawHistory = Array.isArray(body.chat_history) ? body.chat_history : [];
  const chatHistory: CopilotChatMessage[] = rawHistory
    .filter((m: any) => m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant"))
    .map((m: any) => ({ role: m.role as "user" | "assistant", content: String(m.content) }));

  let c: any = null;
  try {
    c = await (prisma.claim as any).findUnique({
      where: { claimId },
      include: {
        patient: true,
        doctor: true,
        facility: true,
        riskAssessment: true,
      },
    });
  } catch (dbErr: any) {
    return Response.json(
      {
        status: "DATA_SOURCE_UNAVAILABLE",
        error: `Database PostgreSQL tidak dapat dihubungi: ${dbErr?.message || "Koneksi gagal"}.`,
      },
      { status: 503 }
    );
  }

  if (!c) {
    return Response.json(
      {
        status: "NOT_FOUND",
        error: `Klaim '${claimId}' tidak ditemukan pada pangkalan data otoritatif.`,
      },
      { status: 404 }
    );
  }

  const ra = c.riskAssessment;
  const ctx: ClaimContextData = {
    claim_id: c.claimId,
    patient_id: c.patientId,
    doctor_id: c.doctorId,
    facility_id: c.facilityId,
    facility_class: c.facility?.facilityClass || "FKRTL",
    specialty: c.doctor?.specialty || "Spesialis",
    icd10_code: c.icd10Code,
    service_date: c.serviceDate,
    service_time: c.serviceTime,
    ina_cbgs_tariff: Number(c.inaCbgsTariff || 0),
    length_of_stay: Number(c.lengthOfStay || 0),
    fraud_probability: ra?.fraudProbability ?? null,
    fraud_risk_index: ra?.fraudRiskIndex ?? null,
    risk_level: ra?.riskLevel || "UNASSESSED",
    pre_payment_gate: ra?.prePaymentGate || "PENDING_ASSESSMENT",
    spatial_conflict_detected: Boolean(ra?.spatialConflictDetected),
    doctor_daily_volume: Number(ra?.doctorDailyVolume || 0),
    spatiotemporal_risk_score: Number(ra?.spatiotemporalRiskScore || 0),
    primary_fraud_trigger: ra?.primaryFraudTrigger || "Tidak Ada Indikasi Spesifik",
    evidence_reasons: Array.isArray(ra?.evidenceReasons) ? (ra.evidenceReasons as string[]) : [],
  };

  const chatRes = await chatWithClaimCopilot(ctx, userMessage, chatHistory);

  try {
    await prisma.auditLog.create({
      data: {
        actorName: user.fullName || user.username,
        actorRole: user.role,
        action: "COPILOT_CHAT_QUERY",
        targetId: claimId,
        metadata: {
          provider_used: chatRes.provider_used,
          is_fallback: chatRes.is_fallback,
          question_preview: userMessage.substring(0, 120),
        },
      },
    });
  } catch {
    // Non-blocking audit log write
  }

  return Response.json(chatRes, { status: 200 });
}
