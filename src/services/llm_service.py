"""
AURA-JKN: Generative AI Layer & Audit Copilot Service
=====================================================
Multi-tier LLM execution engine providing:
1. Executive Audit Brief generation (1-2 sentence narrative summary)
2. Interactive Copilot Chat with context isolation and sliding window
3. Multi-tier fallback (GroqCloud -> NVIDIA NIM -> Local Rule Engine)
   guaranteeing Zero HTTP 500 failure.
"""

import json
import logging
import time
from typing import Any, Callable, Dict, List, Optional, Tuple

try:
    import httpx
except ImportError:
    httpx = None

from src.config import (
    GROQ_API_KEY,
    GROQ_MODEL,
    LLM_TIMEOUT,
    NVIDIA_API_KEY,
    NVIDIA_MODEL,
)
from src.schemas.claim import AuditBrief, ClaimChatResponse

logger = logging.getLogger("aura_jkn.llm_service")

# Endpoints for OpenAI-compatible APIs
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODELS_URL = "https://api.groq.com/openai/v1/models"
NVIDIA_NIM_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
NVIDIA_MODELS_URL = "https://integrate.api.nvidia.com/v1/models"

# Excluded keywords for non-chat models
EXCLUDED_MODEL_KEYWORDS = [
    "whisper", "guard", "embed", "reward", "clip", "parse",
    "detector", "calibration", "retriever", "translate", "audio", "voice"
]

# Preferred candidates in order of priority when model is set to "auto" or on auto-recovery
GROQ_PREFERENCES = [
    "qwen/qwen3.8-27b",
    "llama-3.3-70b-versatile",
    "llama-3.1-70b-versatile",
    "llama-3.1-8b-instant",
    "llama3-70b-8192",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
]

NVIDIA_PREFERENCES = [
    "minimaxai/minimax-m3.1-flash",
    "meta/llama-3.3-70b-instruct",
    "mistralai/mistral-large-2-instruct",
    "deepseek-ai/deepseek-v4.1-flash",
    "openai/gpt-oss-20b",
]

# In-memory cache for auto-discovered models
_cached_groq_model: Optional[str] = None
_cached_nvidia_model: Optional[str] = None


async def _resolve_model(
    provider: str,
    configured_model: str,
    api_key: str,
    http_cli: httpx.AsyncClient,
    force_refresh: bool = False,
) -> str:
    """
    Dynamically resolves active model name.
    If configured_model is 'auto' (or force_refresh on 404/410),
    fetches the live model catalog from the provider and picks the optimal chat model.
    """
    global _cached_groq_model, _cached_nvidia_model

    cached = _cached_groq_model if provider == "groq" else _cached_nvidia_model
    if not force_refresh and configured_model and configured_model.lower() != "auto":
        return configured_model

    if not force_refresh and cached:
        return cached

    url = GROQ_MODELS_URL if provider == "groq" else NVIDIA_MODELS_URL
    prefs = GROQ_PREFERENCES if provider == "groq" else NVIDIA_PREFERENCES

    try:
        res = await http_cli.get(
            url,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=LLM_TIMEOUT,
        )
        if res.status_code == 200:
            data = res.json().get("data", [])
            available = [m.get("id") for m in data if m.get("id")]
            valid_chat = [
                m for m in available
                if not any(kw in m.lower() for kw in EXCLUDED_MODEL_KEYWORDS)
            ]
            for pref in prefs:
                if pref in valid_chat:
                    selected = pref
                    break
            else:
                selected = valid_chat[0] if valid_chat else (available[0] if available else configured_model)

            logger.info(f"[LLM Service] Auto-discovered optimal active model for {provider}: {selected}")
            if provider == "groq":
                _cached_groq_model = selected
            else:
                _cached_nvidia_model = selected
            return selected
    except Exception as exc:
        logger.warning(f"[LLM Service] Model discovery for {provider} encountered {exc}. Using fallback preference.")

    return prefs[0]


# System Prompt Enforcing Strict Medical Audit Persona & Zero Hallucination
SYSTEM_PROMPT_ENFORCER = """Anda adalah Asisten Audit Verifikator Klaim BPJS Kesehatan (AURA-JKN).
Tugas utama Anda adalah menganalisis klaim fasilitas kesehatan untuk verifikasi pra-pembayaran dan mendeteksi potensi kecurangan (fraud) berdasarkan data faktual yang disediakan.

ATURAN WAJIB & BATASAN PERILAKU (ZERO HALLUCINATION):
1. Anda HANYA boleh menjawab berdasarkan data fakta klaim, metrik spatiotemporal, dan bukti analitik yang diberikan dalam konteks.
2. DILARANG KERAS mengasumsikan, mengarang, atau mengekstrapolasi informasi di luar data yang tercantum.
3. Gunakan bahasa Indonesia formal, tegas, presisi, objektif, dan berstandar administrasi medis / Jaminan Kesehatan Nasional (JKN).
4. Jika ditanya mengenai hal yang tidak tercatat dalam data klaim ini, jawab secara tegas bahwa data tersebut tidak tersedia dalam rekam audit klaim terkait.
5. Sebutkan angka metrik spesifik (probabilitas fraud, jarak konflik km, kuota harian dokter, tarif INA-CBG, kode ICD-10) untuk mendukung kesimpulan audit.
"""


async def _execute_llm_call(
    messages: List[Dict[str, str]],
    fallback_generator: Callable[[], str],
    client: Optional[httpx.AsyncClient] = None,
    temperature: float = 0.2,
    max_tokens: int = 400,
) -> Tuple[str, str, bool]:
    """
    Executes multi-tier LLM call with Zero HTTP 500 Guarantee:
    - Tier 1: GroqCloud API (with dynamic auto-discovery & self-healing)
    - Tier 2: NVIDIA NIM API (with dynamic auto-discovery & self-healing)
    - Tier 3: Local Rule Engine (deterministic format from evidence reasons)

    Returns:
        Tuple of (content_str, provider_used, is_fallback)
    """
    # Helper to send request via given client with self-healing retry on 404/410
    async def _post_chat_completion(
        http_cli: httpx.AsyncClient,
        url: str,
        api_key: str,
        provider: str,
        model: str,
    ) -> Optional[str]:
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        response = await http_cli.post(
            url,
            headers=headers,
            json=payload,
            timeout=LLM_TIMEOUT,
        )
        if response.status_code == 200:
            data = response.json()
            choices = data.get("choices", [])
            if choices and "message" in choices[0]:
                msg = choices[0]["message"]
                content = (msg.get("content") or msg.get("reasoning_content") or "").strip()
                if content:
                    return content
        elif response.status_code in [404, 410]:
            # Auto-healing: Model deprecated or not found, re-discover and retry once
            logger.warning(
                f"[LLM Service] Model '{model}' on {provider} returned HTTP {response.status_code}. "
                "Triggering self-healing dynamic model discovery..."
            )
            auto_model = await _resolve_model(provider, "auto", api_key, http_cli, force_refresh=True)
            if auto_model and auto_model != model:
                logger.info(f"[LLM Service] Retrying with auto-discovered model: '{auto_model}'")
                payload["model"] = auto_model
                retry_res = await http_cli.post(url, headers=headers, json=payload, timeout=LLM_TIMEOUT)
                if retry_res.status_code == 200:
                    data = retry_res.json()
                    choices = data.get("choices", [])
                    if choices and "message" in choices[0]:
                        msg = choices[0]["message"]
                        content = (msg.get("content") or msg.get("reasoning_content") or "").strip()
                        if content:
                            return content
        else:
            logger.warning(
                f"[LLM Service] Request to {url} returned HTTP {response.status_code}: {response.text[:200]}"
            )
        return None

    # Determine whether we need to manage our own client or use the injected lifespan pool
    async def _run_tiers(http_cli: httpx.AsyncClient) -> Tuple[str, str, bool]:
        # --- Tier 1: GroqCloud API ---
        if GROQ_API_KEY and GROQ_API_KEY.strip() and not GROQ_API_KEY.startswith("gsk_placeholder"):
            try:
                t0 = time.perf_counter()
                active_groq_model = await _resolve_model("groq", GROQ_MODEL, GROQ_API_KEY.strip(), http_cli)
                content = await _post_chat_completion(
                    http_cli=http_cli,
                    url=GROQ_API_URL,
                    api_key=GROQ_API_KEY.strip(),
                    provider="groq",
                    model=active_groq_model,
                )
                if content:
                    latency_ms = (time.perf_counter() - t0) * 1000.0
                    logger.info(f"[LLM Telemetry] provider=groq model={active_groq_model} latency_ms={latency_ms:.1f} is_fallback=False")
                    return content, "groq", False
            except Exception as exc:
                logger.warning(f"[LLM Service] Groq primary provider failed ({type(exc).__name__}: {exc}). Proceeding to secondary fallback.")

        # --- Tier 2: NVIDIA NIM API ---
        if NVIDIA_API_KEY and NVIDIA_API_KEY.strip() and not NVIDIA_API_KEY.startswith("nvapi_placeholder"):
            try:
                t0 = time.perf_counter()
                active_nvidia_model = await _resolve_model("nvidia_nim", NVIDIA_MODEL, NVIDIA_API_KEY.strip(), http_cli)
                content = await _post_chat_completion(
                    http_cli=http_cli,
                    url=NVIDIA_NIM_API_URL,
                    api_key=NVIDIA_API_KEY.strip(),
                    provider="nvidia_nim",
                    model=active_nvidia_model,
                )
                if content:
                    latency_ms = (time.perf_counter() - t0) * 1000.0
                    logger.info(f"[LLM Telemetry] provider=nvidia_nim model={active_nvidia_model} latency_ms={latency_ms:.1f} is_fallback=True")
                    return content, "nvidia_nim", True
            except Exception as exc:
                logger.warning(f"[LLM Service] NVIDIA NIM fallback failed ({type(exc).__name__}: {exc}). Proceeding to tertiary fallback.")

        # --- Tier 3: Local Rule Engine (Deterministic) ---
        t0 = time.perf_counter()
        local_content = fallback_generator()
        latency_ms = (time.perf_counter() - t0) * 1000.0
        logger.info(f"[LLM Telemetry] provider=local_fallback model=rule_engine latency_ms={latency_ms:.1f} is_fallback=True")
        return local_content, "local_fallback", True

    if httpx is None:
        return fallback_generator(), "local_fallback", True

    try:
        if client is not None and not client.is_closed:
            return await _run_tiers(client)
        else:
            async with httpx.AsyncClient(timeout=LLM_TIMEOUT) as transient_cli:
                return await _run_tiers(transient_cli)
    except Exception as exc:
        logger.error(f"[LLM Service] Unexpected error in multi-tier runner ({exc}). Engaging Local Rule Engine.")
        return fallback_generator(), "local_fallback", True


# ==============================================================================
# 1. Audit Brief Generation Logic
# ==============================================================================
async def generate_audit_brief(
    claim_data: Dict[str, Any],
    fraud_prob: float,
    risk_level: str,
    pre_payment_gate: str,
    spatio_metrics: Dict[str, Any],
    evidence_reasons: List[str],
    client: Optional[httpx.AsyncClient] = None,
) -> AuditBrief:
    """
    Synthesizes a 1-2 sentence executive audit brief combining
    transaction attributes, R-GCN score, spatiotemporal metrics, and XAI rationales.
    """
    claim_id = claim_data.get("claim_id", "KLAIM")

    # Local fallback narrative generator
    def _local_brief_generator() -> str:
        first_reason = evidence_reasons[0] if evidence_reasons else "Transaksi telah diperiksa melalui sistem verifikasi."
        prob_pct = f"{fraud_prob * 100:.1f}%"

        if pre_payment_gate == "REJECT_FOR_HUMAN_REVIEW" or risk_level == "HIGH":
            return (
                f"Klaim {claim_id} ditandai RISIKO TINGGI (Putusan: REJECT FOR HUMAN REVIEW) dengan probabilitas anomali {prob_pct}. "
                f"Ditemukan indikasi penyimpangan kritis: {first_reason} sehingga klaim ditangguhkan untuk audit investigatif medis."
            )
        elif pre_payment_gate == "FLAGGED_WARNING" or risk_level == "MEDIUM":
            return (
                f"Klaim {claim_id} berstatus PERINGATAN (Putusan: FLAGGED WARNING) dengan skor anomali {prob_pct}. "
                f"Terdeteksi catatan verifikasi operasional ({first_reason}) yang memerlukan konfirmasi sebelum pencairan dana."
            )
        else:
            return (
                f"Klaim {claim_id} terverifikasi BERSIH (Putusan: AUTO APPROVE) dengan probabilitas risiko {prob_pct}. "
                f"Seluruh parameter klinis dan operasional dokter maupun faskes memenuhi standar kewajaran BPJS Kesehatan."
            )

    # Prepare prompt messages
    user_prompt = f"""Tolong buatkan Ringkasan Narasi Audit Eksekutif (Audit Brief) sepanjang 1-2 kalimat padat dan tegas untuk verifikator klaim BPJS Kesehatan.

FAKTA DATA KLAIM:
- Claim ID: {claim_id}
- Faskes: {claim_data.get("facility_id", "-")} | Dokter: {claim_data.get("doctor_id", "-")} | Pasien: {claim_data.get("patient_id", "-")}
- Diagnosa ICD-10: {claim_data.get("icd10_code", "-")}
- Tarif INA-CBG: Rp {claim_data.get("ina_cbgs_tariff", 0):,.0f} | Lama Rawat: {claim_data.get("length_of_stay", 0)} hari
- Tanggal & Waktu Layanan: {claim_data.get("service_date", "-")} {claim_data.get("service_time", "-")}

METRIK RISIKO DETERMINISTIK (PHASE 3):
- Probabilitas Fraud (R-GCN): {fraud_prob * 100:.1f}%
- Kategori Risiko: {risk_level}
- Putusan Pre-Payment Gate: {pre_payment_gate}
- Konflik Spasial: {"YA (Terdeteksi konflik lokasi geografis)" if spatio_metrics.get("spatial_conflict_detected") else "Tidak ada"}
- Volume Harian Dokter: {spatio_metrics.get("doctor_daily_volume", 0)} klaim pada hari tersebut
- Skor Risiko Spasiotemporal: {spatio_metrics.get("spatiotemporal_risk_score", 0.0):.1f}

TEMUAN BUKTI XAI (EVIDENCE RATIONALES):
{chr(10).join(f"- {r}" for r in evidence_reasons)}

INSTRUKSI OUTPUT:
Hasilkan narasi 1 sampai 2 kalimat saja. Bahasa resmi, objektif, dan tegas. Jangan berikan pembuka/penutup basa-basi. Langsung berikan narasi intinya."""

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT_ENFORCER},
        {"role": "user", "content": user_prompt},
    ]

    narrative, provider_used, is_fallback = await _execute_llm_call(
        messages=messages,
        fallback_generator=_local_brief_generator,
        client=client,
        temperature=0.2,
        max_tokens=200,
    )

    return AuditBrief(
        audit_narrative=narrative,
        llm_provider_used=provider_used,
        is_fallback=is_fallback,
    )


# ==============================================================================
# 2. Interactive Copilot Chat Logic
# ==============================================================================
async def chat_with_copilot(
    claim_context: Dict[str, Any],
    user_message: str,
    chat_history: Optional[List[Dict[str, str]]] = None,
    client: Optional[httpx.AsyncClient] = None,
) -> ClaimChatResponse:
    """
    Executes conversational copilot interaction with sliding window context management
    and strict domain fact isolation.
    """
    claim_id = claim_context.get("claim_id", "KLAIM")

    # Apply sliding window: only preserve the last 5 messages to conserve token budget
    raw_history = chat_history or []
    windowed_history = raw_history[-5:]

    # Local fallback rule generator for copilot Q&A
    def _local_chat_reply_generator() -> str:
        q_lower = user_message.lower()
        fraud_prob = claim_context.get("fraud_probability", 0.0)
        risk_level = claim_context.get("risk_level", "NORMAL")
        gate = claim_context.get("pre_payment_gate", "AUTO_APPROVE")
        spatio = claim_context.get("spatiotemporal_metrics", {})
        reasons = claim_context.get("evidence_reasons", [])
        tariff = claim_context.get("ina_cbgs_tariff", 0.0)
        icd = claim_context.get("icd10_code", "-")
        doctor = claim_context.get("doctor_id", "-")
        facility = claim_context.get("facility_id", "-")

        spatial_conflict = spatio.get("spatial_conflict_detected", False)
        doc_volume = spatio.get("doctor_daily_volume", 0)

        # Context-aware rule-based replies based on auditor intent
        if any(w in q_lower for w in ["konflik", "spasial", "jarak", "lokasi", "faskes"]):
            if spatial_conflict:
                conflict_detail = next((r for r in reasons if "berjarak" in r or "Konflik" in r), "")
                return (
                    f"Berdasarkan audit spatiotemporal klaim {claim_id}, terdeteksi konflik spasial geografis. "
                    f"{conflict_detail if conflict_detail else 'Dokter tercatat melayani klaim pada dua faskes berbeda dengan jarak mustahil pada hari yang sama.'} "
                    f"Hal ini merupakan pelanggaran integritas lokasi pelayanan."
                )
            else:
                return (
                    f"Pada klaim {claim_id}, tidak terdeteksi anomali maupun konflik jarak geografis. "
                    f"Pelayanan di faskes {facility} tercatat konsisten."
                )

        if any(w in q_lower for w in ["volume", "dokter", "kuota", "pasien", "beban"]):
            if doc_volume >= 80:
                return (
                    f"Dokter {doctor} mencatat volume pelayanan ekstrim sebanyak {doc_volume} klaim pada hari tersebut, "
                    f"melampaui batas toleransi normal BPJS Kesehatan (maksimal 45 klaim/hari). Terindikasi anomali utilisasi dokter."
                )
            elif doc_volume > 45:
                return (
                    f"Dokter {doctor} melayani {doc_volume} klaim pada tanggal pelayanan ini. Volume ini berada di atas rata-rata peer group (25 klaim/hari) "
                    f"namun masih di bawah batas kritis ekstrim 80 klaim/hari."
                )
            else:
                return (
                    f"Volume pelayanan dokter {doctor} berada pada tingkat wajar ({doc_volume} klaim pada hari pelayanan), "
                    f"tidak melanggar batas kapasitas wajar harian."
                )

        if any(w in q_lower for w in ["tarif", "biaya", "uang", "cbg", "ina"]):
            return (
                f"Klaim {claim_id} mengajukan tarif INA-CBG sebesar Rp {tariff:,.0f} dengan diagnosa ICD-10 {icd}. "
                f"Probabilitas fraud model graf R-GCN adalah {fraud_prob * 100:.1f}% dengan status {gate}."
            )

        if any(w in q_lower for w in ["mengapa", "kenapa", "alasan", "bukti", "indikasi", "fraud", "curang", "tolak"]):
            reasons_text = "\n".join(f"- {r}" for r in reasons) if reasons else "- Tidak ada anomali yang terdeteksi."
            return (
                f"Klaim {claim_id} dikategorikan {risk_level} dengan putusan {gate} (probabilitas fraud: {fraud_prob * 100:.1f}%).\n"
                f"Temuan bukti verifikasi:\n{reasons_text}\n"
                f"Disarankan verifikasi dokumen klaim fisik secara komprehensif sebelum penyelesaian pembayaran."
            )

        # Default general response
        return (
            f"Klaim {claim_id} dievaluasi dengan status {gate} dan tingkat risiko {risk_level} (skor fraud: {fraud_prob * 100:.1f}%). "
            f"Diagnosa: {icd}, Dokter: {doctor}, Faskes: {facility}, Tarif: Rp {tariff:,.0f}. "
            f"Temuan utama: {reasons[0] if reasons else 'Tidak ada pelanggaran terdeteksi'}."
        )

    # Build isolated factual context string
    context_str = f"""INFORMASI FAKTUIL KLAIM TERKAIT (KNOWLEDGE ISOLATION):
- ID Klaim: {claim_id}
- ID Pasien: {claim_context.get("patient_id", "-")}
- ID Dokter: {claim_context.get("doctor_id", "-")}
- ID Faskes: {claim_context.get("facility_id", "-")}
- Kode Diagnosa Primer ICD-10: {claim_context.get("icd10_code", "-")}
- Tanggal & Waktu Pelayanan: {claim_context.get("service_date", "-")} {claim_context.get("service_time", "-")}
- Tarif Klaim INA-CBG: Rp {claim_context.get("ina_cbgs_tariff", 0):,.0f}
- Lama Rawat Inap (LOS): {claim_context.get("length_of_stay", 0)} hari
- Probabilitas Fraud (R-GCN): {claim_context.get("fraud_probability", 0.0) * 100:.1f}%
- Kategori Risiko: {claim_context.get("risk_level", "-")}
- Putusan Pre-Payment Gate: {claim_context.get("pre_payment_gate", "-")}
- Konflik Spasial: {"YA" if claim_context.get("spatiotemporal_metrics", {}).get("spatial_conflict_detected") else "TIDAK"}
- Total Klaim Harian Dokter: {claim_context.get("spatiotemporal_metrics", {}).get("doctor_daily_volume", 0)} klaim
- Skor Risiko Spasiotemporal: {claim_context.get("spatiotemporal_metrics", {}).get("spatiotemporal_risk_score", 0.0):.1f}
- Indikator Pemicu Utama (Trigger): {claim_context.get("primary_fraud_trigger", "-")}
- Catatan Bukti XAI:
{chr(10).join(f"  * {r}" for r in claim_context.get("evidence_reasons", []))}
"""

    messages: List[Dict[str, str]] = [
        {"role": "system", "content": SYSTEM_PROMPT_ENFORCER + "\n\n" + context_str}
    ]

    # Append sliding window of conversation turns
    for turn in windowed_history:
        role = turn.get("role", "user")
        content = turn.get("content", "")
        if role in ["user", "assistant"] and content:
            messages.append({"role": role, "content": content})

    # Append current question
    messages.append({"role": "user", "content": user_message})

    reply, provider_used, is_fallback = await _execute_llm_call(
        messages=messages,
        fallback_generator=_local_chat_reply_generator,
        client=client,
        temperature=0.2,
        max_tokens=400,
    )

    return ClaimChatResponse(
        claim_id=claim_id,
        reply=reply,
        provider_used=provider_used,
        is_fallback=is_fallback,
    )
