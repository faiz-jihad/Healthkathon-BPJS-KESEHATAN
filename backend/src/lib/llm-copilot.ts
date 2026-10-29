/**
 * AURA-JKN: Generative AI Layer & Audit Copilot Bridge (Backend Service)
 * ======================================================================
 * Connects Backend API routes with:
 * 1. FastAPI Generative AI Layer (`POST /api/v1/claims/{claimId}/chat` & `audit_brief`)
 * 2. Direct Multi-Tier LLM Fallback (GroqCloud -> NVIDIA NIM -> Local Factual Rule Engine)
 *    guaranteeing Zero HTTP 500 Failure even when external APIs or keys are unavailable.
 */

export interface AuditBriefPayload {
  audit_narrative: string;
  llm_provider_used: "groq" | "nvidia_nim" | "local_fallback" | string;
  is_fallback: boolean;
}

export interface CopilotChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CopilotChatResponsePayload {
  claim_id: string;
  reply: string;
  provider_used: "groq" | "nvidia_nim" | "local_fallback" | string;
  is_fallback: boolean;
}

export interface ClaimContextData {
  claim_id: string;
  patient_id: string;
  doctor_id: string;
  facility_id: string;
  facility_class?: string;
  specialty?: string;
  icd10_code: string;
  service_date: string;
  service_time: string;
  ina_cbgs_tariff: number;
  length_of_stay: number;
  fraud_probability: number | null;
  fraud_risk_index?: number | null;
  risk_level: string;
  pre_payment_gate: string;
  spatial_conflict_detected: boolean;
  doctor_daily_volume: number;
  spatiotemporal_risk_score: number;
  primary_fraud_trigger: string;
  evidence_reasons: string[];
}

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const NVIDIA_NIM_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

/**
 * Generates deterministic, factual 1-2 sentence Indonesian Executive Audit Brief
 * grounded strictly in the claim's PostgreSQL & R-GCN metrics.
 */
export function buildLocalAuditBrief(ctx: ClaimContextData): AuditBriefPayload {
  const probPct =
    ctx.fraud_probability !== null && ctx.fraud_probability !== undefined
      ? (Number(ctx.fraud_probability) * 100).toFixed(1)
      : null;
  const tariffStr = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(ctx.ina_cbgs_tariff || 0));

  if (ctx.risk_level === "UNASSESSED" || probPct === null) {
    const spatioNote = ctx.spatial_conflict_detected
      ? `namun terdeteksi indikasi konflik lokasi praktik dokter ${ctx.doctor_id} (${ctx.doctor_daily_volume} klaim/hari)`
      : `dengan volume harian dokter ${ctx.doctor_id} tercatat ${ctx.doctor_daily_volume} klaim/hari`;
    return {
      audit_narrative: `Klaim ${ctx.claim_id} di faskes ${ctx.facility_id} (diagnosis ${ctx.icd10_code}, tarif ${tariffStr}) belum terindeks pada graf offline R-GCN (${spatioNote}). Sesuai protokol kehati-hatian pra-pembayaran, berkas diarahkan ke telaah manual verifikator.`,
      llm_provider_used: "local_fallback",
      is_fallback: true,
    };
  }

  if (ctx.pre_payment_gate === "REJECT_FOR_HUMAN_REVIEW" || ctx.risk_level === "HIGH") {
    const findings: string[] = [];
    if (ctx.spatial_conflict_detected) {
      findings.push("konflik spasiotemporal praktik dokter lintas faskes berjauhan pada hari yang sama");
    }
    if (ctx.doctor_daily_volume >= 80) {
      findings.push(`lonjakan ekstrem beban pelayanan dokter (${ctx.doctor_daily_volume} klaim/hari)`);
    } else if (ctx.doctor_daily_volume > 45) {
      findings.push(`volume harian dokter melampaui batas normal (${ctx.doctor_daily_volume} klaim/hari)`);
    }
    if (findings.length === 0) {
      findings.push(`anomali topologi relasi graf R-GCN (${ctx.primary_fraud_trigger})`);
    }
    return {
      audit_narrative: `Klaim ${ctx.claim_id} ditahan pada gerbang pra-pembayaran dengan probabilitas anomali ${probPct}% (Risiko Tinggi) akibat terdeteksinya ${findings.join(" serta ")}. Direkomendasikan audit dokumen rekam medis dan konfirmasi surat rujukan pada faskes ${ctx.facility_id} sebelum pencairan tarif ${tariffStr}.`,
      llm_provider_used: "local_fallback",
      is_fallback: true,
    };
  }

  if (ctx.pre_payment_gate === "FLAGGED_WARNING" || ctx.risk_level === "MEDIUM") {
    return {
      audit_narrative: `Klaim ${ctx.claim_id} (${ctx.facility_id}, ICD-10 ${ctx.icd10_code}) memiliki tingkat risiko sedang dengan skor anomali ${probPct}% dan volume praktik dokter ${ctx.doctor_daily_volume} klaim/hari. Disarankan klarifikasi kelengkapan resume medis sebelum persetujuan klaim senilai ${tariffStr}.`,
      llm_provider_used: "local_fallback",
      is_fallback: true,
    };
  }

  return {
    audit_narrative: `Klaim ${ctx.claim_id} di faskes ${ctx.facility_id} (DPJP ${ctx.doctor_id}, diagnosis ${ctx.icd10_code}) menunjukkan profil relasi wajar dengan probabilitas anomali rendah (${probPct}%) tanpa konflik lokasi maupun lonjakan kuota dokter (${ctx.doctor_daily_volume} klaim/hari). Berkas memenuhi syarat kelayakan pra-pembayaran.`,
    llm_provider_used: "local_fallback",
    is_fallback: true,
  };
}

/**
 * Deterministic, factual Indonesian Copilot answer engine when cloud LLM keys are not configured.
 */
export function buildLocalCopilotReply(ctx: ClaimContextData, userMessage: string): string {
  const q = (userMessage || "").toLowerCase();
  const probPct =
    ctx.fraud_probability !== null && ctx.fraud_probability !== undefined
      ? `${(Number(ctx.fraud_probability) * 100).toFixed(1)}%`
      : "Belum Dianalisis (NOT_ANALYZED)";
  const tariffStr = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(ctx.ina_cbgs_tariff || 0));

  if (q.includes("lokasi") || q.includes("jarak") || q.includes("spasio") || q.includes("dokter") || q.includes("kuota") || q.includes("volume")) {
    const conflictText = ctx.spatial_conflict_detected
      ? "TERDETEKSI konflik lokasi praktik (dokter tercatat melayani di faskes lain yang berjarak jauh pada tanggal pelayanan yang sama)."
      : "TIDAK ditemukan konflik jarak antar-faskes pada tanggal pelayanan tersebut.";
    return (
      `Berdasarkan evaluasi spasiotemporal pada berkas **${ctx.claim_id}** (tanggal ${ctx.service_date} pukul ${ctx.service_time}):\n` +
      `• **Status Konflik Lokasi:** ${conflictText}\n` +
      `• **Volume Harian Dokter (${ctx.doctor_id}):** ${ctx.doctor_daily_volume} klaim/hari (Skor risiko spasiotemporal: ${ctx.spatiotemporal_risk_score}/100).\n` +
      `• **Faskes Pelayanan:** ${ctx.facility_id} (${ctx.facility_class || "FKRTL"}).`
    );
  }

  if (q.includes("tarif") || q.includes("biaya") || q.includes("diagnos") || q.includes("icd") || q.includes("rawat") || q.includes("los")) {
    return (
      `Rincian klinis dan tarif INA-CBG untuk berkas **${ctx.claim_id}**:\n` +
      `• **Kode Diagnosis Primer (ICD-10):** ${ctx.icd10_code}\n` +
      `• **Nilai Klaim Diajukan:** ${tariffStr}\n` +
      `• **Lama Rawat Inap (LOS):** ${ctx.length_of_stay} hari\n` +
      `• **DPJP & Faskes:** Dokter ${ctx.doctor_id} (${ctx.specialty || "Spesialis"}) di Faskes ${ctx.facility_id}.`
    );
  }

  if (q.includes("rekomendasi") || q.includes("tindak") || q.includes("keputusan") || q.includes("saran") || q.includes("langkah")) {
    const recAction =
      ctx.risk_level === "HIGH" || ctx.pre_payment_gate === "REJECT_FOR_HUMAN_REVIEW"
        ? "Tahan pembayaran sementara (`REJECT_FOR_HUMAN_REVIEW`), lakukan verifikasi berkas rekam medis serta surat perintah rawat inap/rujukan di Faskes, atau eskalasikan ke Tim Audit Anti-Fraud."
        : ctx.risk_level === "MEDIUM"
        ? "Minta klarifikasi kelengkapan resume medis (`CLARIFY`) kepada pihak Faskes mitra sebelum menyetujui pembayaran."
        : "Berkas memiliki profil risiko wajar (`AUTO_APPROVE`) dan dapat disetujui (`RELEASE`) apabila kelengkapan administratif sah.";
    return (
      `Rekomendasi tindak lanjut verifikator untuk klaim **${ctx.claim_id}** (Probabilitas Anomali: **${probPct}**, Tingkat Risiko: **${ctx.risk_level}**):\n` +
      `• **Saran Tindakan:** ${recAction}\n` +
      `• **Indikasi Utama:** ${ctx.primary_fraud_trigger}.`
    );
  }

  const reasonsList =
    ctx.evidence_reasons && ctx.evidence_reasons.length > 0
      ? ctx.evidence_reasons.map((r) => `• ${r}`).join("\n")
      : "• Tidak ada temuan anomali spesifik pada berkas ini.";

  return (
    `Ringkasan Analisis Audit untuk Berkas **${ctx.claim_id}**:\n` +
    `• **Probabilitas Anomali (R-GCN):** ${probPct} (Kategori: **${ctx.risk_level}** | Gate: \`${ctx.pre_payment_gate}\`)\n` +
    `• **Pemicu Utama:** ${ctx.primary_fraud_trigger}\n` +
    `• **Pelayanan:** Pasien ${ctx.patient_id} oleh Dokter ${ctx.doctor_id} di Faskes ${ctx.facility_id} pada ${ctx.service_date} (ICD-10: ${ctx.icd10_code}, Tarif: ${tariffStr}, LOS: ${ctx.length_of_stay} hari)\n` +
    `• **Bukti Pendukung:**\n${reasonsList}`
  );
}

/**
 * Interactive Copilot Chat handler with 4-tier resolution:
 * 1. Python FastAPI AI Service (`POST /api/v1/claims/{claimId}/chat`)
 * 2. GroqCloud API (`GROQ_API_KEY`)
 * 3. NVIDIA NIM API (`NVIDIA_API_KEY`)
 * 4. Local Factual Rule Engine (`local_fallback`)
 */
export async function chatWithClaimCopilot(
  ctx: ClaimContextData,
  userMessage: string,
  chatHistory: CopilotChatMessage[] = []
): Promise<CopilotChatResponsePayload> {
  const trimmedHistory = chatHistory.slice(-5);
  const aiUrl = process.env.AI_SERVICE_URL || "http://127.0.0.1:8000";
  const timeoutMs = Number(process.env.LLM_TIMEOUT || "3.0") * 1000;

  // Tier 1: Try FastAPI AI Service (/api/v1/claims/{claim_id}/chat)
  try {
    const fastApiRes = await fetch(`${aiUrl}/api/v1/claims/${encodeURIComponent(ctx.claim_id)}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_message: userMessage,
        chat_history: trimmedHistory,
      }),
      signal: AbortSignal.timeout(Math.max(3500, timeoutMs)),
    });
    if (fastApiRes.ok) {
      const json = await fastApiRes.json();
      if (json && typeof json.reply === "string" && json.reply.trim().length > 0) {
        return {
          claim_id: ctx.claim_id,
          reply: json.reply,
          provider_used: json.provider_used || "fastapi_ai_service",
          is_fallback: Boolean(json.is_fallback),
        };
      }
    }
  } catch {
    // Proceed to direct Cloud LLM / Local Fallback
  }

  const systemPrompt = [
    "Anda adalah AURA-JKN Audit Copilot, asisten AI resmi verifikator klaim BPJS Kesehatan.",
    "Jawab pertanyaan secara ringkas, objektif, dan 100% berdasarkan data fakta berkas klaim berikut (dilarang mengarang angka):",
    JSON.stringify(ctx),
  ].join("\n");

  const messages = [
    { role: "system", content: systemPrompt },
    ...trimmedHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];

  // Tier 2: Direct GroqCloud API if GROQ_API_KEY is configured
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (groqKey && !groqKey.endsWith("...")) {
    try {
      const groqModel =
        process.env.GROQ_MODEL && process.env.GROQ_MODEL !== "auto"
          ? process.env.GROQ_MODEL
          : "llama-3.3-70b-versatile";
      const groqRes = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: groqModel,
          messages,
          temperature: 0.2,
          max_tokens: 350,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (groqRes.ok) {
        const data = await groqRes.json();
        const content = data?.choices?.[0]?.message?.content?.trim();
        if (content) {
          return {
            claim_id: ctx.claim_id,
            reply: content,
            provider_used: "groq",
            is_fallback: false,
          };
        }
      }
    } catch {
      // Fall through to Tier 3
    }
  }

  // Tier 3: Direct NVIDIA NIM API if NVIDIA_API_KEY is configured
  const nvidiaKey = process.env.NVIDIA_API_KEY?.trim();
  if (nvidiaKey && !nvidiaKey.endsWith("...")) {
    try {
      const nvidiaModel =
        process.env.NVIDIA_MODEL && process.env.NVIDIA_MODEL !== "auto"
          ? process.env.NVIDIA_MODEL
          : "meta/llama-3.3-70b-instruct";
      const nvRes = await fetch(NVIDIA_NIM_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${nvidiaKey}`,
        },
        body: JSON.stringify({
          model: nvidiaModel,
          messages,
          temperature: 0.2,
          max_tokens: 350,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (nvRes.ok) {
        const data = await nvRes.json();
        const content = data?.choices?.[0]?.message?.content?.trim();
        if (content) {
          return {
            claim_id: ctx.claim_id,
            reply: content,
            provider_used: "nvidia_nim",
            is_fallback: true,
          };
        }
      }
    } catch {
      // Fall through to Tier 4
    }
  }

  // Tier 4: Deterministic Local Factual Rule Engine (Zero HTTP 500 Guarantee)
  return {
    claim_id: ctx.claim_id,
    reply: buildLocalCopilotReply(ctx, userMessage),
    provider_used: "local_fallback",
    is_fallback: true,
  };
}
