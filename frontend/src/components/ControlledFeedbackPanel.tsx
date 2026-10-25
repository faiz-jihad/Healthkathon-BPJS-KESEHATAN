import React, { useEffect, useState } from "react";
import { RefreshCw, Download, CheckCircle2, AlertTriangle, Database, Target } from "lucide-react";
import { FeedbackExportResponse } from "../types/aura";

interface ControlledFeedbackPanelProps {
  backendUrl: string;
  authToken?: string;
}

export const ControlledFeedbackPanel: React.FC<ControlledFeedbackPanelProps> = ({
  backendUrl,
  authToken,
}) => {
  const [feedbackData, setFeedbackData] = useState<FeedbackExportResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFeedback = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${backendUrl}/api/feedback-export`, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Gagal memuat data Controlled Feedback Loop.");
      } else {
        setFeedbackData(json);
      }
    } catch (err: any) {
      setError(`Koneksi ke backend gagal: ${err?.message || "Terputus"}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeedback();
  }, [authToken]);

  const handleDownload = (format: "csv" | "json") => {
    const url = `${backendUrl}/api/feedback-export?format=${format}`;
    window.open(url, "_blank");
  };

  const vm = feedbackData?.summary?.verified_metrics;

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* Top Info & Export Buttons */}
      <div
        className="card-interactive"
        style={{
          padding: "12px 16px",
          borderRadius: "16px",
          background: "#f1f8f4",
          border: "1px solid #cbe3d7",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "10px",
        }}
      >
        <div style={{ fontSize: "12px", color: "var(--dark-green)" }}>
          <strong>Controlled Feedback Loop (Retraining Model R-GCN)</strong>
          <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "2px" }}>
            Label ground-truth dari keputusan verifikator: <code>0</code> = Klaim Sah (RELEASE),{" "}
            <code>1</code> = Konfirmasi Fraud (ESCALATE_AUDIT)
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            type="button"
            onClick={fetchFeedback}
            className="button button-secondary"
            style={{ minHeight: "32px", padding: "6px 10px", fontSize: "11.5px", borderRadius: "16px" }}
            title="Segarkan Data Feedback"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            type="button"
            onClick={() => handleDownload("csv")}
            className="button button-primary"
            style={{ minHeight: "32px", padding: "6px 12px", fontSize: "11.5px", borderRadius: "16px" }}
          >
            <Download size={14} />
            Unduh CSV Retraining
          </button>
          <button
            type="button"
            onClick={() => handleDownload("json")}
            className="button button-secondary"
            style={{ minHeight: "32px", padding: "6px 12px", fontSize: "11.5px", borderRadius: "16px" }}
          >
            <Download size={14} />
            JSON
          </button>
        </div>
      </div>

      {/* Summary Metrics */}
      {feedbackData && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
          <div className="card-interactive" style={{ padding: "10px 14px", borderRadius: "14px", border: "1px solid var(--line)", background: "var(--surface)" }}>
            <small className="muted" style={{ fontSize: "10px", display: "block" }}>TOTAL REVIEW</small>
            <strong style={{ fontSize: "18px" }}>{feedbackData.summary.total_reviews}</strong>
          </div>
          <div className="card-interactive" style={{ padding: "10px 14px", borderRadius: "14px", border: "1px solid var(--line)", background: "var(--surface)" }}>
            <small className="muted" style={{ fontSize: "10px", display: "block" }}>SIAP RETRAINING (0/1)</small>
            <strong style={{ fontSize: "18px", color: "var(--dark-green)" }}>
              {feedbackData.summary.labeled_for_retraining_count}
            </strong>
          </div>
          <div className="card-interactive" style={{ padding: "10px 14px", borderRadius: "14px", border: "1px solid var(--line)", background: "#faecec" }}>
            <small style={{ fontSize: "10px", display: "block", color: "#a53e3e" }}>LABEL 1 (FRAUD)</small>
            <strong style={{ fontSize: "18px", color: "#c95353" }}>
              {feedbackData.summary.confirmed_fraud_label_1_count}
            </strong>
          </div>
          <div className="card-interactive" style={{ padding: "10px 14px", borderRadius: "14px", border: "1px solid var(--line)", background: "#e5f4ec" }}>
            <small style={{ fontSize: "10px", display: "block", color: "var(--dark-green)" }}>LABEL 0 (SAH)</small>
            <strong style={{ fontSize: "18px", color: "var(--dark-green)" }}>
              {feedbackData.summary.legitimate_label_0_count}
            </strong>
          </div>
        </div>
      )}

      {/* Verified Ground-Truth Evaluation Metrics (when human reviews exist) */}
      {vm && vm.evaluated_reviews_count > 0 && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "14px",
            border: "1px solid var(--line)",
            background: "#f9fafb",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px", fontSize: "11px", fontWeight: 700, color: "#374151" }}>
            <Target size={14} style={{ color: "var(--green)" }} />
            METRIK EVALUASI BERBASIS KEPUTUSAN VERIFIKATOR ({vm.evaluated_reviews_count} Klaim Tervalidasi)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", fontSize: "11px" }}>
            <div style={{ padding: "8px 10px", borderRadius: "10px", background: "#fff", border: "1px solid var(--line)" }}>
              <span style={{ color: "var(--muted)", display: "block", fontSize: "10px" }}>Verified Precision</span>
              <strong style={{ fontSize: "15px", color: "#0284c7" }}>
                {vm.verified_precision_pct !== null ? `${vm.verified_precision_pct}%` : "N/A"}
              </strong>
            </div>
            <div style={{ padding: "8px 10px", borderRadius: "10px", background: "#fff", border: "1px solid var(--line)" }}>
              <span style={{ color: "var(--muted)", display: "block", fontSize: "10px" }}>Verified Recall</span>
              <strong style={{ fontSize: "15px", color: "#059669" }}>
                {vm.verified_recall_pct !== null ? `${vm.verified_recall_pct}%` : "N/A"}
              </strong>
            </div>
            <div style={{ padding: "8px 10px", borderRadius: "10px", background: "#fff", border: "1px solid var(--line)" }}>
              <span style={{ color: "var(--muted)", display: "block", fontSize: "10px" }}>Agreement Rate</span>
              <strong style={{ fontSize: "15px", color: "#7c3aed" }}>
                {vm.agreement_rate_pct !== null ? `${vm.agreement_rate_pct}%` : "N/A"}
              </strong>
            </div>
            <div style={{ padding: "8px 10px", borderRadius: "10px", background: "#fff", border: "1px solid var(--line)" }}>
              <span style={{ color: "var(--muted)", display: "block", fontSize: "10px" }}>Confusion Matrix</span>
              <span style={{ fontWeight: 700, fontSize: "11px" }}>
                TP:{vm.true_positives} FP:{vm.false_positives} TN:{vm.true_negatives} FN:{vm.false_negatives}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Records List */}
      {loading ? (
        <div style={{ padding: "36px", textAlign: "center", color: "var(--muted)", fontSize: "12px" }}>
          <RefreshCw size={20} className="animate-spin text-green" style={{ margin: "0 auto 8px" }} />
          Memuat dataset feedback dari PostgreSQL...
        </div>
      ) : error ? (
        <div style={{ padding: "16px", background: "#faecec", color: "#a53e3e", borderRadius: "14px", fontSize: "12px" }}>
          {error}
        </div>
      ) : !feedbackData || feedbackData.records.length === 0 ? (
        <div style={{ padding: "36px", textAlign: "center", color: "var(--muted)", fontSize: "12px" }}>
          Belum ada klaim yang direview verifikator di tabel <code>human_reviews</code>. Silakan pilih klaim di <strong>Alert Explorer</strong> dan simpan keputusan untuk membangun dataset ground truth.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "360px", overflowY: "auto" }}>
          {feedbackData.records.map((item) => (
            <div
              key={item.review_id}
              style={{
                padding: "12px 16px",
                borderRadius: "14px",
                border: "1px solid var(--line)",
                background: "var(--surface)",
                fontSize: "12px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <strong style={{ fontFamily: "monospace", fontSize: "13px" }}>{item.claim_id}</strong>
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 800,
                      padding: "2px 8px",
                      borderRadius: "10px",
                      background:
                        item.feedback_label === 1
                          ? "#faecec"
                          : item.feedback_label === 0
                          ? "#e5f4ec"
                          : "#f8ecd4",
                      color:
                        item.feedback_label === 1
                          ? "#c95353"
                          : item.feedback_label === 0
                          ? "var(--dark-green)"
                          : "#b38432",
                    }}
                  >
                    {item.feedback_meaning}
                  </span>
                  {item.ai_fraud_risk_index !== null && (
                    <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                      Prediksi AI: FRI {item.ai_fraud_risk_index} ({item.ai_risk_level})
                    </span>
                  )}
                </div>
                <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "3px" }}>
                  Verifikator: <strong>{item.reviewer_name}</strong> ({item.decision}) &bull; Dokter: {item.doctor_id} &bull; Faskes: {item.facility_id}
                </div>
              </div>
              <span style={{ fontSize: "11px", color: "var(--muted)", fontFamily: "monospace", whiteSpace: "nowrap" }}>
                {new Date(item.reviewed_at).toLocaleString("id-ID")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
