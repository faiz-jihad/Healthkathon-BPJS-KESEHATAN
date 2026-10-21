import React, { useEffect, useState } from "react";
import {
  ShieldAlert,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Search,
  MapPin,
  Users,
  FileWarning,
  Database,
  RefreshCw,
} from "lucide-react";
import { ClaimRecord, ClaimsListResponse } from "./types/aura";
import { SubgraphViewer } from "./components/SubgraphViewer";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

export function App() {
  const [data, setData] = useState<ClaimsListResponse | null>(null);
  const [selectedClaim, setSelectedClaim] = useState<ClaimRecord | null>(null);
  const [riskFilter, setRiskFilter] = useState<string>("ALL");
  const [scenarioFilter, setScenarioFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [reviewNotes, setReviewNotes] = useState<string>("");
  const [submittingReview, setSubmittingReview] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const fetchClaims = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (riskFilter !== "ALL") params.set("risk_level", riskFilter);
      if (scenarioFilter !== "ALL") params.set("scenario", scenarioFilter);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());

      const res = await fetch(`${BACKEND_URL}/api/claims?${params.toString()}`);
      const json: ClaimsListResponse = await res.json();
      setData(json);

      if (json.claims.length > 0) {
        if (!selectedClaim) {
          setSelectedClaim(json.claims[0]);
        } else {
          const updated = json.claims.find(
            (c) => c.claim_id === selectedClaim.claim_id
          );
          setSelectedClaim(updated || json.claims[0]);
        }
      } else {
        setSelectedClaim(null);
      }
    } catch (err) {
      console.error("Failed to fetch claims from Next.js backend:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClaims();
  }, [riskFilter, scenarioFilter]);

  const handleReviewDecision = async (
    decision: "RELEASE" | "CLARIFY" | "ESCALATE_AUDIT"
  ) => {
    if (!selectedClaim) return;
    setSubmittingReview(true);
    setStatusBanner(null);

    try {
      const res = await fetch(
        `${BACKEND_URL}/api/claims/${selectedClaim.claim_id}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reviewer_name: "Tim Verifikator Anti-Fraud BPJS",
            reviewer_role: "VERIFIKATOR_BPJS",
            decision,
            notes:
              reviewNotes.trim() ||
              `Keputusan ${decision} dicatat melalui Dashboard AURA-JKN.`,
          }),
        }
      );

      if (res.ok) {
        setReviewNotes("");
        setStatusBanner(
          `Keputusan [${decision}] untuk klaim ${selectedClaim.claim_id} berhasil disimpan ke Audit Trail!`
        );
        await fetchClaims();
      }
    } catch (err) {
      console.error("Error submitting review:", err);
    } finally {
      setSubmittingReview(false);
    }
  };

  const formatIDR = (num: number) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(num);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-[1440px] mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-white">
                  AURA-JKN
                </h1>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  Pre-Payment Risk Gate &amp; XAI Dashboard
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Autonomous Relational Anti-Fraud — Deteksi Risiko Klaim Fiktif Berbasis Graf Heterogen &amp; R-GCN
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300">
              <Database className="w-3.5 h-3.5 text-sky-400" />
              Storage:{" "}
              <strong className="text-white">
                {data?.storage_source === "postgresql"
                  ? "PostgreSQL (Prisma Live)"
                  : "PostgreSQL Ready (Resilient Store)"}
              </strong>
            </span>
            <button
              onClick={fetchClaims}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-medium transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Segarkan Data
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1440px] w-full mx-auto px-6 py-6 flex-1 space-y-6">
        {/* Top KPI Summary Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Total Klaim Dianalisis</span>
              <Activity className="w-4 h-4 text-sky-400" />
            </div>
            <div className="text-2xl font-bold text-white">
              {data?.summary.total_claims ?? 0}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Melewati pipa R-GCN &amp; Spatiotemporal
            </p>
          </div>

          <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-800/50">
            <div className="flex items-center justify-between text-xs text-rose-300 mb-1">
              <span>Prioritas Tinggi (FRI &ge; 70)</span>
              <ShieldAlert className="w-4 h-4 text-rose-400" />
            </div>
            <div className="text-2xl font-bold text-rose-400">
              {data?.summary.high_risk_count ?? 0} Klaim
            </div>
            <p className="text-[11px] text-rose-300/80 mt-1">
              Status: REJECT_FOR_HUMAN_REVIEW
            </p>
          </div>

          <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/50">
            <div className="flex items-center justify-between text-xs text-amber-300 mb-1">
              <span>Peringatan Sedang (FRI 40–69)</span>
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-bold text-amber-400">
              {data?.summary.medium_risk_count ?? 0} Klaim
            </div>
            <p className="text-[11px] text-amber-300/80 mt-1">
              Status: FLAGGED_WARNING
            </p>
          </div>

          <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-800/50">
            <div className="flex items-center justify-between text-xs text-emerald-300 mb-1">
              <span>Potensi Dana DJS Diamankan</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-emerald-400">
              {formatIDR(data?.summary.held_tariff_idr ?? 0)}
            </div>
            <p className="text-[11px] text-emerald-300/80 mt-1">
              Ditahan sementara sebelum pembayaran
            </p>
          </div>
        </section>

        {/* Workspace Grid: Left Queue Table (5 cols) + Right XAI & Review Inspector (7 cols) */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Pre-Payment Risk Gate Queue */}
          <div className="lg:col-span-5 flex flex-col rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                  Antrean Prioritas Klaim (FRI 0–100)
                </h2>
                <span className="text-xs text-slate-400">
                  {data?.claims.length ?? 0} ditampilkan
                </span>
              </div>

              {/* Search & Filter Controls */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && fetchClaims()}
                    placeholder="Cari ID Klaim, Dokter, Faskes..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-slate-950 border border-slate-700 text-slate-100 focus:outline-none focus:border-teal-500"
                  />
                </div>
                <select
                  value={riskFilter}
                  onChange={(e) => setRiskFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-lg bg-slate-950 border border-slate-700 text-slate-200"
                >
                  <option value="ALL">Semua Risiko</option>
                  <option value="HIGH">HIGH (FRI &ge; 70)</option>
                  <option value="MEDIUM">MEDIUM (40–69)</option>
                  <option value="LOW">LOW (&lt; 40)</option>
                </select>
                <select
                  value={scenarioFilter}
                  onChange={(e) => setScenarioFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-lg bg-slate-950 border border-slate-700 text-slate-200"
                >
                  <option value="ALL">Semua Skenario</option>
                  <option value="A">Skenario A (Klaster)</option>
                  <option value="B">Skenario B (Volume)</option>
                  <option value="C">Skenario C (Spasial)</option>
                  <option value="NORMAL">Normal / Sah</option>
                </select>
              </div>
            </div>

            {/* Claims List */}
            <div className="divide-y divide-slate-800 max-h-[680px] overflow-y-auto">
              {data?.claims.map((claim) => {
                const isSelected = selectedClaim?.claim_id === claim.claim_id;
                const badgeColor =
                  claim.risk_level === "HIGH"
                    ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                    : claim.risk_level === "MEDIUM"
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                    : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";

                return (
                  <button
                    key={claim.claim_id}
                    onClick={() => {
                      setSelectedClaim(claim);
                      setStatusBanner(null);
                    }}
                    className={`w-full text-left p-4 transition flex items-start justify-between gap-3 ${
                      isSelected
                        ? "bg-slate-800/90 border-l-4 border-l-teal-400"
                        : "hover:bg-slate-800/40"
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-white">
                          {claim.claim_id}
                        </span>
                        {claim.fraud_scenario && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            Skenario {claim.fraud_scenario}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-300">
                        {claim.doctor_id} ({claim.specialty}) &bull;{" "}
                        <span className="text-sky-300">{claim.facility_id}</span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        ICD-10: {claim.icd10_code} &bull; {claim.service_date}{" "}
                        {claim.service_time} &bull;{" "}
                        {formatIDR(claim.ina_cbgs_tariff)}
                      </div>
                      <div className="text-[11px] font-medium text-teal-300/90 pt-0.5">
                        Trigger: {claim.xai_explanation.primary_fraud_trigger}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <div
                        className={`px-2.5 py-1 rounded-lg border text-xs font-bold ${badgeColor}`}
                      >
                        FRI: {claim.fraud_risk_index}/100
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {claim.review_status}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: XAI Evidence, Subgraph & Human-in-the-Loop Decision */}
          <div className="lg:col-span-7 space-y-5">
            {selectedClaim ? (
              <>
                {/* Claim Detail Header Card */}
                <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-4">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <h2 className="text-lg font-bold text-white font-mono">
                          {selectedClaim.claim_id}
                        </h2>
                        <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                          {selectedClaim.pre_payment_gate}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        Pasien (Salted SHA-256):{" "}
                        <code className="text-purple-300">
                          {selectedClaim.patient_id}
                        </code>{" "}
                        ({selectedClaim.home_region})
                      </p>
                    </div>

                    <div className="text-right">
                      <div className="text-xs text-slate-400">
                        Fraud Risk Index (FRI)
                      </div>
                      <div className="text-3xl font-extrabold text-teal-400">
                        {selectedClaim.fraud_risk_index}
                        <span className="text-sm font-normal text-slate-400">
                          /100
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Spatiotemporal & Relational Signals */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                      <div className="text-slate-400 flex items-center gap-1.5 mb-1">
                        <MapPin className="w-3.5 h-3.5 text-rose-400" />
                        Konflik Spasial-Temporal
                      </div>
                      <div className="font-bold text-sm">
                        {selectedClaim.spatiotemporal_metrics
                          .spatial_conflict_detected ? (
                          <span className="text-rose-400">
                            TERDETEKSI (&gt;400 km)
                          </span>
                        ) : (
                          <span className="text-emerald-400">
                            Tidak Ada Konflik
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                      <div className="text-slate-400 flex items-center gap-1.5 mb-1">
                        <Users className="w-3.5 h-3.5 text-amber-400" />
                        Volume Harian Dokter
                      </div>
                      <div className="font-bold text-sm text-white">
                        {
                          selectedClaim.spatiotemporal_metrics
                            .doctor_daily_volume
                        }{" "}
                        klaim/hari{" "}
                        <span className="text-[11px] font-normal text-slate-400">
                          (Batas: 45)
                        </span>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                      <div className="text-slate-400 flex items-center gap-1.5 mb-1">
                        <FileWarning className="w-3.5 h-3.5 text-sky-400" />
                        Skor Spatiotemporal
                      </div>
                      <div className="font-bold text-sm text-sky-300">
                        {
                          selectedClaim.spatiotemporal_metrics
                            .spatiotemporal_risk_score
                        }{" "}
                        / 100
                      </div>
                    </div>
                  </div>

                  {/* XAI Narrative Evidence */}
                  <div className="p-3.5 rounded-lg bg-slate-950/90 border border-slate-800 space-y-2">
                    <div className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                      Bukti Penjelasan XAI ({selectedClaim.xai_explanation.primary_fraud_trigger})
                    </div>
                    <ul className="space-y-1.5 text-xs text-slate-200 list-disc list-inside">
                      {selectedClaim.xai_explanation.evidence_reasons.map(
                        (reason, i) => (
                          <li key={i} className="leading-relaxed">
                            {reason}
                          </li>
                        )
                      )}
                    </ul>
                  </div>

                  {/* Interactive Subgraph Visualizer */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                        Visualisasi Subgraf Relasional (5 Simpul &amp; 4 Relasi)
                      </h3>
                      <span className="text-[11px] text-slate-400">
                        React Flow Interactive Graph
                      </span>
                    </div>
                    <SubgraphViewer
                      nodes={
                        selectedClaim.xai_explanation.subgraph_evidence.nodes
                      }
                      edges={
                        selectedClaim.xai_explanation.subgraph_evidence.edges
                      }
                    />
                  </div>
                </div>

                {/* Human-in-the-Loop Verifier Decision Panel */}
                <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      Keputusan Verifikator &amp; Dokter Penasihat (Human-in-the-Loop)
                    </h3>
                    <p className="text-xs text-slate-400">
                      AURA-JKN tidak memvonis secara otomatis. Setiap keputusan dicatat ke PostgreSQL Audit Trail dan menjadi label umpan balik pelatihan ulang model.
                    </p>
                  </div>

                  {statusBanner && (
                    <div className="p-3 rounded-lg bg-teal-500/20 border border-teal-500/40 text-xs text-teal-200 font-medium">
                      {statusBanner}
                    </div>
                  )}

                  <textarea
                    rows={2}
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder="Tambahkan catatan investigasi verifikator atau nomor surat audit..."
                    className="w-full p-3 text-xs rounded-lg bg-slate-950 border border-slate-700 text-slate-100 focus:outline-none focus:border-teal-500"
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <button
                      disabled={submittingReview}
                      onClick={() => handleReviewDecision("RELEASE")}
                      className="py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition"
                    >
                      Setujui Klaim (Release)
                    </button>
                    <button
                      disabled={submittingReview}
                      onClick={() => handleReviewDecision("CLARIFY")}
                      className="py-2.5 px-4 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition"
                    >
                      Minta Klarifikasi RS (CPPT)
                    </button>
                    <button
                      disabled={submittingReview}
                      onClick={() => handleReviewDecision("ESCALATE_AUDIT")}
                      className="py-2.5 px-4 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition"
                    >
                      Tahan &amp; Eskalasi Audit Fraud
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-12 rounded-xl bg-slate-900 border border-slate-800 text-center text-sm text-slate-400">
                Pilih salah satu klaim di panel kiri untuk melihat Subgraf XAI dan mengambil keputusan verifikasi.
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
