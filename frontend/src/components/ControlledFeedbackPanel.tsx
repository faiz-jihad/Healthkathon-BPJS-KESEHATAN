import React, { useEffect, useState } from "react";
import { RefreshCw, Download, CheckCircle2, AlertTriangle, Database, Target } from "lucide-react";
import { FeedbackExportResponse } from "../types/aura";
import { SkeletonBox } from "./SkeletonLoaders";

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
      const isJson = res.headers.get("content-type")?.includes("application/json");
      let json: any = null;
      if (isJson) {
        try {
          json = await res.json();
        } catch {
          json = null;
        }
      }

      if (!res.ok) {
        const defaultErr = res.status >= 500
          ? `Layanan sedang memuat ulang data telaah (HTTP ${res.status}). Silakan coba sesaat lagi.`
          : "Gagal memuat data Controlled Feedback Loop.";
        setError(json?.error || defaultErr);
      } else if (json) {
        setFeedbackData(json);
      } else {
        setError("Format data dari server tidak valid.");
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
          <strong>Perekaman Putusan Verifikator (Umpan Balik Akurasi Sistem)</strong>
          <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "2px" }}>
            Hasil telaah resmi verifikator menjadi dasar pembelajaran sistem: <code>0</code> = Berkas Sah (Disetujui Pembayaran),{" "}
            <code>1</code> = Anomali Terbukti (Rekomendasi Audit Investigasi)
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            type="button"
            onClick={fetchFeedback}
            className="button button-secondary"
            style={{ minHeight: "32px", padding: "6px 10px", fontSize: "11.5px", borderRadius: "16px" }}
            title="Segarkan Data Hasil Telaah"
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
            Unduh Data Pembelajaran (CSV)
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px" }}>
          <div className="card-interactive" style={{ padding: "10px 14px", borderRadius: "14px", border: "1px solid var(--line)", background: "var(--surface)" }}>
            <small className="muted" style={{ fontSize: "10px", display: "block" }}>TOTAL TELAAH PETUGAS</small>
            <strong style={{ fontSize: "18px" }}>{feedbackData.summary.total_reviews}</strong>
          </div>
          <div className="card-interactive" style={{ padding: "10px 14px", borderRadius: "14px", border: "1px solid var(--line)", background: "var(--surface)" }}>
            <small className="muted" style={{ fontSize: "10px", display: "block" }}>DATA TERVALIDASI PETUGAS (0/1)</small>
            <strong style={{ fontSize: "18px", color: "var(--dark-green)" }}>
              {feedbackData.summary.labeled_for_retraining_count}
            </strong>
          </div>
          <div className="card-interactive" style={{ padding: "10px 14px", borderRadius: "14px", border: "1px solid var(--line)", background: "#faecec" }}>
            <small style={{ fontSize: "10px", display: "block", color: "#a53e3e" }}>ANOMALI TERBUKTI (LABEL 1)</small>
            <strong style={{ fontSize: "18px", color: "#c95353" }}>
              {feedbackData.summary.confirmed_fraud_label_1_count}
            </strong>
          </div>
          <div className="card-interactive" style={{ padding: "10px 14px", borderRadius: "14px", border: "1px solid var(--line)", background: "#e5f4ec" }}>
            <small style={{ fontSize: "10px", display: "block", color: "var(--dark-green)" }}>BERKAS LAYAK BAYAR (LABEL 0)</small>
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
            EVALUASI KESESUAIAN PENAPISAN DENGAN KEPUTUSAN VERIFIKATOR ({vm.evaluated_reviews_count} Berkas Tervalidasi)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px", fontSize: "11px" }}>
            <div style={{ padding: "10px 12px", borderRadius: "12px", background: "#fff", border: "1px solid var(--line)" }}>
              <span style={{ color: "var(--muted)", display: "block", fontSize: "10px", marginBottom: "4px" }}>Presisi Penapisan (Kesesuaian Fraud)</span>
              <strong style={{ fontSize: "18px", color: "#0284c7" }}>
                {vm.verified_precision_pct !== null ? `${vm.verified_precision_pct}%` : "Belum Tersedia"}
              </strong>
              <div style={{ fontSize: "10px", color: "var(--muted)", marginTop: "2px" }}>Klaim yang ditahan dan terbukti tepat</div>
            </div>
            <div style={{ padding: "10px 12px", borderRadius: "12px", background: "#fff", border: "1px solid var(--line)" }}>
              <span style={{ color: "var(--muted)", display: "block", fontSize: "10px", marginBottom: "4px" }}>Sensitivitas Penapisan (Cakupan Fraud)</span>
              <strong style={{ fontSize: "18px", color: "#059669" }}>
                {vm.verified_recall_pct !== null ? `${vm.verified_recall_pct}%` : "Belum Tersedia"}
              </strong>
              <div style={{ fontSize: "10px", color: "var(--muted)", marginTop: "2px" }}>Anomali yang berhasil tertangkap sistem</div>
            </div>
            <div style={{ padding: "10px 12px", borderRadius: "12px", background: "#fff", border: "1px solid var(--line)" }}>
              <span style={{ color: "var(--muted)", display: "block", fontSize: "10px", marginBottom: "4px" }}>Keselarasan Petugas &amp; Sistem</span>
              <strong style={{ fontSize: "18px", color: "#7c3aed" }}>
                {vm.agreement_rate_pct !== null ? `${vm.agreement_rate_pct}%` : "Belum Tersedia"}
              </strong>
              <div style={{ fontSize: "10px", color: "var(--muted)", marginTop: "2px" }}>Kesesuaian keputusan keseluruhan</div>
            </div>
            {/* Visual 2x2 Matrix Card */}
            <div style={{ padding: "10px 12px", borderRadius: "12px", background: "#ffffff", border: "1px solid #cbe3d7" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--dark-green)" }}>Matriks Hasil Verifikasi Petugas</span>
                <span style={{ fontSize: "9px", color: "var(--muted)" }}>2x2 Grid</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px", fontSize: "10px" }}>
                <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "4px 6px", borderRadius: "8px", textAlign: "center" }}>
                  <div style={{ fontSize: "9px", color: "#166534", fontWeight: 600 }}>TP (Tepat Fraud)</div>
                  <strong style={{ fontSize: "13px", color: "#15803d" }}>{vm.true_positives}</strong>
                </div>
                <div style={{ background: "#fef3c7", border: "1px solid #fde68a", padding: "4px 6px", borderRadius: "8px", textAlign: "center" }}>
                  <div style={{ fontSize: "9px", color: "#92400e", fontWeight: 600 }}>FP (Klaim Wajar)</div>
                  <strong style={{ fontSize: "13px", color: "#b45309" }}>{vm.false_positives}</strong>
                </div>
                <div style={{ background: "#fee2e2", border: "1px solid #fecaca", padding: "4px 6px", borderRadius: "8px", textAlign: "center" }}>
                  <div style={{ fontSize: "9px", color: "#991b1b", fontWeight: 600 }}>FN (Terlewat)</div>
                  <strong style={{ fontSize: "13px", color: "#dc2626" }}>{vm.false_negatives}</strong>
                </div>
                <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "4px 6px", borderRadius: "8px", textAlign: "center" }}>
                  <div style={{ fontSize: "9px", color: "#166534", fontWeight: 600 }}>TN (Sesuai Sah)</div>
                  <strong style={{ fontSize: "13px", color: "#15803d" }}>{vm.true_negatives}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Records List */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="card skeleton-card"
              style={{
                padding: "12px 16px",
                borderRadius: "14px",
                background: "#ffffff",
                border: "1px solid var(--line)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <SkeletonBox width="140px" height="12px" borderRadius="3px" />
                <SkeletonBox width="80px" height="18px" borderRadius="10px" />
              </div>
              <SkeletonBox width="85%" height="11px" borderRadius="3px" style={{ marginBottom: "6px" }} />
              <div style={{ display: "flex", gap: "14px" }}>
                <SkeletonBox width="110px" height="10px" borderRadius="3px" />
                <SkeletonBox width="90px" height="10px" borderRadius="3px" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div style={{ padding: "16px", background: "#faecec", color: "#a53e3e", borderRadius: "14px", fontSize: "12px" }}>
          {error}
        </div>
      ) : !feedbackData || feedbackData.records.length === 0 ? (
        <div style={{ padding: "36px", textAlign: "center", color: "var(--muted)", fontSize: "12px" }}>
          Belum ada berkas klaim yang ditelaah petugas di buku catatan <code>human_reviews</code>. Silakan buka menu <strong>Penyaringan &amp; Daftar Klaim</strong> dan simpan putusan telaah verifikator untuk melatih keakuratan sistem cerdas.
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
                flexWrap: "wrap",
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
                      Skrining Sistem: Indeks FRI {item.ai_fraud_risk_index} ({item.ai_risk_level === "HIGH" ? "Risiko Tinggi" : item.ai_risk_level === "MEDIUM" ? "Risiko Sedang" : "Risiko Wajar"})
                    </span>
                  )}
                </div>
                <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "3px" }}>
                  Petugas Verifikator: <strong>{item.reviewer_name}</strong> ({item.decision === "RELEASE" ? "Klaim Sah" : item.decision === "CLARIFY" ? "Konfirmasi Faskes" : "Eskalasi ke Audit"}) &bull; Dokter: {item.doctor_id} &bull; Fasilitas Kesehatan: {item.facility_id}
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

