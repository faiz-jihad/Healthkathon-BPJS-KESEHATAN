import React, { useState, useEffect } from "react";
import { Sparkles, Send, RefreshCw, MessageSquare, ShieldCheck } from "lucide-react";

export interface AuditBriefData {
  audit_narrative: string;
  llm_provider_used: string;
  is_fallback: boolean;
}

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  provider?: string;
}

interface AuditCopilotChatProps {
  claimId: string;
  backendUrl: string;
  authToken: string;
  auditBrief?: AuditBriefData | null;
}

const QUICK_PROMPTS = [
  "Mengapa berkas klaim ini berisiko?",
  "Cek konflik lokasi & kuota harian dokter",
  "Apa rekomendasi tindak lanjut verifikator?",
];

export const AuditCopilotChat: React.FC<AuditCopilotChatProps> = ({
  claimId,
  backendUrl,
  authToken,
  auditBrief,
}) => {
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeProvider, setActiveProvider] = useState<string>(
    auditBrief?.llm_provider_used || "local_fallback"
  );

  // Reset conversation when user switches to a different claim
  useEffect(() => {
    setMessages([]);
    setInput("");
    if (auditBrief?.llm_provider_used) {
      setActiveProvider(auditBrief.llm_provider_used);
    }
  }, [claimId, auditBrief?.llm_provider_used]);

  const formatProviderLabel = (prov: string) => {
    if (prov === "groq") return "GroqCloud LLM";
    if (prov === "nvidia_nim") return "NVIDIA NIM LLM";
    return "Engine Faktual Lokal";
  };

  const sendQuestion = async (questionText: string) => {
    const trimmed = questionText.trim();
    if (!trimmed || loading || !claimId) return;

    const prevTurns = messages.slice(-5).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(
        `${backendUrl}/api/claims/${encodeURIComponent(claimId)}/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify({
            user_message: trimmed,
            chat_history: prevTurns,
          }),
        }
      );

      if (res.ok) {
        const data = await res.json();
        const prov = data.provider_used || "local_fallback";
        setActiveProvider(prov);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              data.reply ||
              "Berdasarkan data klaim, tidak ditemukan informasi tambahan.",
            provider: prov,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Tidak dapat mengambil respons Copilot saat ini. Pastikan sesi login Anda aktif.",
            provider: "local_fallback",
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Gagal menghubungi server Backend untuk Copilot Chat. Periksa koneksi jaringan Anda.",
          provider: "local_fallback",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        marginTop: "12px",
        padding: "14px 16px",
        borderRadius: "14px",
        background: "linear-gradient(180deg, #f4fbf7 0%, #ffffff 100%)",
        border: "1px solid #ccebd9",
      }}
    >
      {/* Executive Audit Brief Box */}
      {auditBrief?.audit_narrative && (
        <div
          style={{
            marginBottom: "12px",
            padding: "10px 12px",
            borderRadius: "10px",
            background: "#ffffff",
            border: "1px solid #d1fae5",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "6px",
              flexWrap: "wrap",
              gap: "6px",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "11px",
                fontWeight: 800,
                color: "#076641",
              }}
            >
              <Sparkles size={13} style={{ color: "#098a58" }} />
              RINGKASAN NARASI AUDIT (EXECUTIVE AUDIT BRIEF)
            </span>
            <span
              style={{
                fontSize: "9.5px",
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: "12px",
                background: "#e6efe6",
                color: "#076641",
              }}
            >
              {formatProviderLabel(auditBrief.llm_provider_used)}
            </span>
          </div>
          <div
            style={{
              fontSize: "11.5px",
              color: "#1e293b",
              lineHeight: 1.55,
            }}
          >
            {auditBrief.audit_narrative}
          </div>
        </div>
      )}

      {/* Interactive Copilot Chat Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "8px",
          flexWrap: "wrap",
          gap: "6px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "11.5px",
            fontWeight: 800,
            color: "#0f172a",
          }}
        >
          <MessageSquare size={14} style={{ color: "#098a58" }} />
          <span>Asisten AI Copilot Audit Klaim ({claimId})</span>
        </div>
        <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>
          Mode: {formatProviderLabel(activeProvider)}
        </span>
      </div>

      {/* Quick Prompt Chips */}
      <div
        style={{
          display: "flex",
          gap: "6px",
          flexWrap: "wrap",
          marginBottom: "10px",
        }}
      >
        {QUICK_PROMPTS.map((q) => (
          <button
            key={q}
            type="button"
            disabled={loading}
            onClick={() => sendQuestion(q)}
            style={{
              padding: "4px 10px",
              borderRadius: "12px",
              border: "1px solid #bbf7d0",
              background: "#ffffff",
              color: "#076641",
              fontSize: "10.5px",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {q}
          </button>
        ))}
      </div>

      {/* Chat Messages Container */}
      {messages.length > 0 && (
        <div
          style={{
            maxHeight: "210px",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            marginBottom: "10px",
            padding: "8px",
            borderRadius: "10px",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
          }}
        >
          {messages.map((m, idx) => (
            <div
              key={idx}
              style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "88%",
                padding: "8px 11px",
                borderRadius: "10px",
                fontSize: "11.5px",
                lineHeight: 1.5,
                whiteSpace: "pre-line",
                background: m.role === "user" ? "#098a58" : "#ffffff",
                color: m.role === "user" ? "#ffffff" : "#1e293b",
                border: m.role === "user" ? "none" : "1px solid #e2e8f0",
              }}
            >
              {m.content}
            </div>
          ))}
        </div>
      )}

      {/* Input Box */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendQuestion(input);
        }}
        style={{ display: "flex", gap: "6px" }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Tanyakan detail tarif, lokasi, kuota dokter, atau saran telaah klaim ini..."
          disabled={loading}
          style={{
            flex: 1,
            padding: "7px 11px",
            borderRadius: "10px",
            border: "1px solid #cbd5e1",
            fontSize: "11.5px",
            background: "#ffffff",
          }}
        />
        <button
          type="submit"
          className="button button-primary"
          disabled={loading || !input.trim()}
          style={{
            minHeight: "34px",
            padding: "6px 12px",
            fontSize: "11.5px",
            borderRadius: "10px",
          }}
        >
          {loading ? (
            <RefreshCw size={13} className="animate-spin" />
          ) : (
            <Send size={13} />
          )}
          <span>Tanya AI</span>
        </button>
      </form>

      <div
        style={{
          marginTop: "6px",
          fontSize: "10px",
          color: "#64748b",
          display: "flex",
          alignItems: "center",
          gap: "4px",
        }}
      >
        <ShieldCheck size={11} style={{ color: "#098a58", flexShrink: 0 }} />
        <span>
          Context Isolation Aktif: Jawaban Copilot 100% dibatasi pada fakta berkas {claimId}.
        </span>
      </div>
    </div>
  );
};
