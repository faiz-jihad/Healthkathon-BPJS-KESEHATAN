import React from "react";

export default function BackendHomePage() {
  return (
    <main style={{ maxWidth: 820, margin: "48px auto", padding: "0 24px" }}>
      <div
        style={{
          padding: 28,
          borderRadius: 12,
          backgroundColor: "#1e293b",
          border: "1px solid #334155",
        }}
      >
        <h1 style={{ margin: "0 0 8px", color: "#38bdf8" }}>
          AURA-JKN Next.js Backend API
        </h1>
        <p style={{ margin: "0 0 24px", color: "#94a3b8" }}>
          Layanan Backend Pre-Payment Risk Gate, XAI Evidence & PostgreSQL Audit Trail
        </p>

        <h3 style={{ color: "#e2e8f0" }}>Daftar Endpoint Tersedia:</h3>
        <ul style={{ lineHeight: 1.9, color: "#cbd5e1" }}>
          <li>
            <code>GET /api/health</code> — Status koneksi PostgreSQL (Prisma) &amp; Python R-GCN FastAPI
          </li>
          <li>
            <code>GET /api/claims</code> — Daftar antrean klaim berperingkat Fraud Risk Index (FRI 0–100)
          </li>
          <li>
            <code>POST /api/claims</code> — Evaluasi klaim baru ke Pre-Payment Risk Gate
          </li>
          <li>
            <code>GET /api/claims/[claimId]</code> — Detail klaim, metrik Spatiotemporal &amp; Subgraf XAI
          </li>
          <li>
            <code>POST /api/claims/[claimId]/review</code> — Simpan keputusan Verifikator (Release / Clarify / Escalate) ke Audit Trail
          </li>
        </ul>
      </div>
    </main>
  );
}
