import React from "react";

// ============================================================
// PRIMITIVE SKELETON ELEMENTS
// ============================================================

export interface SkeletonBoxProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  style?: React.CSSProperties;
  className?: string;
}

export const SkeletonBox: React.FC<SkeletonBoxProps> = ({
  width = "100%",
  height = "14px",
  borderRadius = "6px",
  style,
  className = "",
}) => (
  <span
    className={`skeleton-shimmer ${className}`}
    style={{
      width,
      height,
      borderRadius,
      display: "inline-block",
      ...style,
    }}
  />
);

export const SkeletonText: React.FC<{
  width?: string | number;
  height?: string | number;
  style?: React.CSSProperties;
}> = ({ width = "100%", height = "12px", style }) => (
  <SkeletonBox width={width} height={height} borderRadius="4px" style={style} />
);

export const SkeletonBadge: React.FC<{
  width?: string | number;
  height?: string | number;
  style?: React.CSSProperties;
}> = ({ width = "70px", height = "20px", style }) => (
  <SkeletonBox width={width} height={height} borderRadius="12px" style={style} />
);

// ============================================================
// SKELETON METRIC CARD
// ============================================================

export const SkeletonMetricCard: React.FC<{ className?: string }> = ({ className = "" }) => (
  <div
    className={`card skeleton-card ${className}`}
    style={{
      padding: "18px",
      background: "#ffffff",
      border: "1px solid var(--line)",
      borderRadius: "18px",
    }}
  >
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: "12px",
      }}
    >
      <SkeletonBox width="58%" height="11px" borderRadius="4px" />
      <SkeletonBox width="22px" height="22px" borderRadius="6px" />
    </div>
    <div style={{ marginBottom: "8px" }}>
      <SkeletonBox width="46%" height="26px" borderRadius="6px" />
    </div>
    <SkeletonBox width="78%" height="10px" borderRadius="4px" />
  </div>
);

export const SkeletonCardsGrid: React.FC<{
  count?: number;
  columns?: string;
  className?: string;
}> = ({ count = 4, columns, className = "" }) => (
  <div
    className={`grid-responsive-cards ${className}`}
    style={{
      ...(columns ? { gridTemplateColumns: columns } : {}),
    }}
  >
    {Array.from({ length: count }).map((_, i) => (
      <SkeletonMetricCard key={i} />
    ))}
  </div>
);

// ============================================================
// SKELETON TABLE
// ============================================================

export const SkeletonTable: React.FC<{
  headers?: string[];
  cols?: number;
  rows?: number;
}> = ({
  headers,
  cols = 6,
  rows = 5,
}) => {
  const columnCount = headers ? headers.length : cols;
  const sampleWidths = ["45%", "65%", "85%", "55%", "75%", "90%", "60%"];

  return (
    <div
      className="card skeleton-card table-responsive"
      style={{
        padding: 0,
        overflowX: "auto",
        background: "#ffffff",
        border: "1px solid var(--line)",
        borderRadius: "18px",
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--line)", background: "var(--surface)" }}>
            {headers
              ? headers.map((h, idx) => (
                  <th
                    key={idx}
                    style={{
                      padding: "12px 14px",
                      textAlign: "left",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "var(--muted)",
                    }}
                  >
                    {h}
                  </th>
                ))
              : Array.from({ length: columnCount }).map((_, idx) => (
                  <th key={idx} style={{ padding: "12px 14px", textAlign: "left" }}>
                    <SkeletonBox width={sampleWidths[idx % sampleWidths.length]} height="12px" />
                  </th>
                ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, rIdx) => (
            <tr key={rIdx} className="skeleton-table-row">
              {Array.from({ length: columnCount }).map((_, cIdx) => (
                <td key={cIdx} style={{ padding: "12px 14px" }}>
                  <SkeletonBox
                    width={sampleWidths[(rIdx + cIdx) % sampleWidths.length]}
                    height={cIdx === 0 ? "13px" : "11px"}
                    borderRadius="4px"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ============================================================
// SKELETON CASE QUEUE
// ============================================================

export const SkeletonCaseQueue: React.FC<{ count?: number }> = ({ count = 5 }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
    {Array.from({ length: count }).map((_, idx) => (
      <div
        key={idx}
        className="card skeleton-card"
        style={{
          padding: "16px 18px",
          borderRadius: "16px",
          background: "#ffffff",
          border: "1px solid var(--line)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "12px",
            flexWrap: "wrap",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <SkeletonBox width="130px" height="14px" borderRadius="4px" />
            <SkeletonBox width="105px" height="22px" borderRadius="12px" />
            <SkeletonBox width="90px" height="22px" borderRadius="12px" />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <SkeletonBox width="18px" height="18px" borderRadius="50%" />
            <SkeletonBox width="110px" height="12px" borderRadius="4px" />
          </div>
        </div>

        <div style={{ display: "flex", gap: "24px", marginBottom: "12px", flexWrap: "wrap" }}>
          <div>
            <SkeletonBox width="60px" height="9px" borderRadius="3px" style={{ marginBottom: "4px" }} />
            <SkeletonBox width="140px" height="13px" borderRadius="4px" />
          </div>
          <div>
            <SkeletonBox width="70px" height="9px" borderRadius="3px" style={{ marginBottom: "4px" }} />
            <SkeletonBox width="160px" height="13px" borderRadius="4px" />
          </div>
          <div>
            <SkeletonBox width="65px" height="9px" borderRadius="3px" style={{ marginBottom: "4px" }} />
            <SkeletonBox width="130px" height="13px" borderRadius="4px" />
          </div>
          <div>
            <SkeletonBox width="75px" height="9px" borderRadius="3px" style={{ marginBottom: "4px" }} />
            <SkeletonBox width="110px" height="13px" borderRadius="4px" />
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: "10px",
            borderTop: "1px solid var(--line)",
            flexWrap: "wrap",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <SkeletonBox width="120px" height="20px" borderRadius="10px" />
            <SkeletonBox width="150px" height="20px" borderRadius="10px" />
            <SkeletonBox width="95px" height="20px" borderRadius="10px" />
          </div>
          <SkeletonBox width="130px" height="28px" borderRadius="10px" />
        </div>
      </div>
    ))}
  </div>
);

// ============================================================
// SKELETON CLAIMS EXPLORER (2 COLUMNS)
// ============================================================

export const SkeletonClaimsExplorer: React.FC = () => (
  <div className="explorer-layout-grid">
    {/* Left: Claim List Pane */}
    <div
      className="card skeleton-card"
      style={{
        padding: "14px",
        maxHeight: "calc(100vh - 280px)",
        background: "#ffffff",
        border: "1px solid var(--line)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px", padding: "0 4px" }}>
        <SkeletonBox width="160px" height="11px" borderRadius="4px" />
        <SkeletonBox width="50px" height="11px" borderRadius="4px" />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {Array.from({ length: 6 }).map((_, idx) => (
          <div
            key={idx}
            style={{
              padding: "10px 12px",
              borderRadius: "12px",
              border: "1px solid var(--line)",
              background: idx === 0 ? "#f0fdf4" : "#ffffff",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <SkeletonBox width="120px" height="12px" borderRadius="3px" />
              <SkeletonBox width="55px" height="18px" borderRadius="8px" />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <SkeletonBox width="150px" height="10px" borderRadius="3px" />
              <SkeletonBox width="80px" height="10px" borderRadius="3px" />
            </div>
          </div>
        ))}
      </div>
    </div>

    {/* Right: Claim Detail & Graph Pane */}
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Detail Header Banner */}
      <div
        className="card skeleton-card"
        style={{
          padding: "18px 20px",
          background: "#ffffff",
          border: "1px solid var(--line)",
          borderRadius: "18px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <SkeletonBox width="180px" height="18px" borderRadius="4px" />
              <SkeletonBox width="80px" height="20px" borderRadius="10px" />
            </div>
            <SkeletonBox width="260px" height="11px" borderRadius="3px" />
          </div>
          <div style={{ textAlign: "right" }}>
            <SkeletonBox width="70px" height="10px" borderRadius="3px" style={{ marginBottom: "4px" }} />
            <SkeletonBox width="90px" height="24px" borderRadius="6px" />
          </div>
        </div>

        {/* 4 Mini Metric Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "10px" }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              style={{
                padding: "10px 12px",
                borderRadius: "12px",
                background: "#f8fafc",
                border: "1px solid var(--line)",
              }}
            >
              <SkeletonBox width="60px" height="9px" borderRadius="3px" style={{ marginBottom: "6px" }} />
              <SkeletonBox width="85px" height="14px" borderRadius="4px" />
            </div>
          ))}
        </div>
      </div>

      {/* Graph Visual Canvas Shimmer */}
      <div
        className="card skeleton-card"
        style={{
          padding: "20px",
          background: "#ffffff",
          border: "1px solid var(--line)",
          borderRadius: "18px",
          minHeight: "320px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <SkeletonBox width="20px" height="20px" borderRadius="50%" />
            <SkeletonBox width="190px" height="14px" borderRadius="4px" />
          </div>
          <SkeletonBox width="100px" height="22px" borderRadius="12px" />
        </div>

        {/* Shimmering Graph Nodes Silhouette */}
        <div
          style={{
            height: "200px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-around",
            padding: "20px",
            position: "relative",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
            <SkeletonBox width="54px" height="54px" borderRadius="50%" />
            <SkeletonBox width="60px" height="10px" borderRadius="3px" />
          </div>
          <div style={{ width: "80px", height: "2px", background: "#e2e8f0" }} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
            <SkeletonBox width="64px" height="64px" borderRadius="50%" />
            <SkeletonBox width="75px" height="10px" borderRadius="3px" />
          </div>
          <div style={{ width: "80px", height: "2px", background: "#e2e8f0" }} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
            <SkeletonBox width="54px" height="54px" borderRadius="50%" />
            <SkeletonBox width="65px" height="10px" borderRadius="3px" />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "12px", borderTop: "1px solid var(--line)" }}>
          <SkeletonBox width="200px" height="11px" borderRadius="3px" />
          <SkeletonBox width="120px" height="30px" borderRadius="10px" />
        </div>
      </div>
    </div>
  </div>
);

// ============================================================
// SKELETON EVIDENCE CENTER (2 COLUMNS)
// ============================================================

export const SkeletonEvidenceCenter: React.FC = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
    {/* Stepper skeleton */}
    <div
      className="card skeleton-card"
      style={{
        padding: "14px 18px",
        borderRadius: "18px",
        background: "#ffffff",
        border: "1px solid var(--line)",
      }}
    >
      <div className="case-progression-grid">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "10px", borderRadius: "12px", border: "1px solid var(--line)" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <SkeletonBox width="20px" height="20px" borderRadius="50%" />
              <SkeletonBox width="28px" height="14px" borderRadius="10px" />
            </div>
            <SkeletonBox width="85%" height="12px" borderRadius="4px" />
            <SkeletonBox width="60%" height="9px" borderRadius="4px" />
          </div>
        ))}
      </div>
    </div>

    {/* 2-Column Responsive Layout */}
    <div className="grid-responsive-2" style={{ gap: "20px" }}>
      {/* Left Column: Summary & Facts */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* Ringkasan Kasus */}
        <div className="card skeleton-card" style={{ padding: "18px", background: "#ffffff", border: "1px solid var(--line)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
            <SkeletonBox width="16px" height="16px" borderRadius="4px" />
            <SkeletonBox width="130px" height="14px" borderRadius="4px" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                <SkeletonBox width="35%" height="11px" borderRadius="3px" />
                <SkeletonBox width="45%" height="11px" borderRadius="3px" />
              </div>
            ))}
          </div>
        </div>

        {/* Fakta Pelayanan */}
        <div className="card skeleton-card" style={{ padding: "18px", background: "#ffffff", border: "1px solid var(--line)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
            <SkeletonBox width="16px" height="16px" borderRadius="4px" />
            <SkeletonBox width="160px" height="14px" borderRadius="4px" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                <SkeletonBox width="38%" height="11px" borderRadius="3px" />
                <SkeletonBox width="48%" height="11px" borderRadius="3px" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Column: Actions & Subgraph */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* Lembar Penetapan Tindakan Form */}
        <div className="card skeleton-card" style={{ padding: "18px", background: "#ffffff", border: "1px solid var(--line)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
            <SkeletonBox width="16px" height="16px" borderRadius="4px" />
            <SkeletonBox width="190px" height="14px" borderRadius="4px" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div>
              <SkeletonBox width="120px" height="10px" borderRadius="3px" style={{ marginBottom: "6px" }} />
              <SkeletonBox width="100%" height="36px" borderRadius="10px" />
            </div>
            <div>
              <SkeletonBox width="140px" height="10px" borderRadius="3px" style={{ marginBottom: "6px" }} />
              <SkeletonBox width="100%" height="70px" borderRadius="10px" />
            </div>
            <SkeletonBox width="100%" height="40px" borderRadius="12px" />
          </div>
        </div>

        {/* Topologi Subgraph Visualizer */}
        <div className="card skeleton-card" style={{ padding: "18px", background: "#ffffff", border: "1px solid var(--line)", minHeight: "240px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <SkeletonBox width="16px" height="16px" borderRadius="4px" />
              <SkeletonBox width="150px" height="14px" borderRadius="4px" />
            </div>
            <SkeletonBox width="70px" height="20px" borderRadius="10px" />
          </div>
          <div style={{ height: "180px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <SkeletonBox width="80%" height="140px" borderRadius="12px" />
          </div>
        </div>
      </div>
    </div>
  </div>
);

// ============================================================
// SKELETON GRAPH VIEW (Jejaring Faskes & Dokter)
// ============================================================

export const SkeletonGraphView: React.FC = () => (
  <div>
    {/* Ribbon selector */}
    <div
      className="card skeleton-card"
      style={{
        padding: "16px 20px",
        borderRadius: "18px",
        marginBottom: "16px",
        background: "#ffffff",
        border: "1px solid var(--line)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1 }}>
          <SkeletonBox width="130px" height="12px" borderRadius="4px" />
          <SkeletonBox width="260px" height="34px" borderRadius="12px" />
        </div>
        <SkeletonBox width="120px" height="24px" borderRadius="12px" />
      </div>
    </div>

    {/* Canvas placeholder */}
    <div
      className="card skeleton-card"
      style={{
        padding: "20px",
        borderRadius: "20px",
        marginBottom: "16px",
        background: "#ffffff",
        border: "1px solid var(--line)",
        minHeight: "420px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <SkeletonBox width="20px" height="20px" borderRadius="6px" />
          <SkeletonBox width="220px" height="14px" borderRadius="4px" />
          <SkeletonBox width="110px" height="20px" borderRadius="12px" />
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <SkeletonBox width="32px" height="32px" borderRadius="8px" />
          <SkeletonBox width="32px" height="32px" borderRadius="8px" />
        </div>
      </div>

      <div style={{ height: "260px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <SkeletonBox width="90px" height="90px" borderRadius="50%" style={{ marginBottom: "12px" }} />
          <SkeletonBox width="220px" height="12px" borderRadius="4px" />
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "12px", borderTop: "1px solid var(--line)" }}>
        <SkeletonBox width="240px" height="11px" borderRadius="4px" />
        <SkeletonBox width="140px" height="11px" borderRadius="4px" />
      </div>
    </div>

    {/* 3 Bottom Inspector Cards */}
    <div className="grid-responsive-3" style={{ gap: "16px" }}>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="card skeleton-card" style={{ padding: "18px", borderRadius: "18px", background: "#ffffff", border: "1px solid var(--line)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            <SkeletonBox width="18px" height="18px" borderRadius="4px" />
            <SkeletonBox width="140px" height="13px" borderRadius="4px" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <SkeletonBox width="100%" height="11px" borderRadius="3px" />
            <SkeletonBox width="80%" height="11px" borderRadius="3px" />
            <SkeletonBox width="90%" height="11px" borderRadius="3px" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ============================================================
// SKELETON DATA INGESTION
// ============================================================

export const SkeletonDataIngestion: React.FC = () => (
  <div>
    <SkeletonCardsGrid count={4} />
    <div
      className="card skeleton-card"
      style={{
        padding: "18px",
        background: "#ffffff",
        border: "1px solid var(--line)",
        borderRadius: "18px",
      }}
    >
      <SkeletonBox width="280px" height="15px" borderRadius="4px" style={{ marginBottom: "16px" }} />
      <SkeletonTable
        cols={5}
        rows={4}
        headers={["ID Gelombang (Batch)", "Waktu Penerimaan", "Jumlah Berkas", "Status Validasi", "Petugas Pengunggah"]}
      />
    </div>
  </div>
);

// ============================================================
// SKELETON PERFORMANCE DASHBOARD
// ============================================================

export const SkeletonPerformanceDashboard: React.FC = () => (
  <div>
    {/* Callout Info Banner Skeleton */}
    <div
      style={{
        padding: "12px 16px",
        borderRadius: "12px",
        background: "#f0f9ff",
        border: "1px solid #bae6fd",
        marginBottom: "20px",
        display: "flex",
        alignItems: "center",
        gap: "10px",
      }}
    >
      <SkeletonBox width="18px" height="18px" borderRadius="50%" />
      <SkeletonBox width="60%" height="12px" borderRadius="4px" />
    </div>

    {/* Row 1 Metrics */}
    <SkeletonCardsGrid count={4} />

    {/* Row 2 Metrics */}
    <SkeletonCardsGrid count={4} />

    {/* Distribution Card Skeleton */}
    <div
      className="card skeleton-card"
      style={{
        padding: "18px",
        borderRadius: "18px",
        background: "#ffffff",
        border: "1px solid var(--line)",
      }}
    >
      <SkeletonBox width="240px" height="14px" borderRadius="4px" style={{ marginBottom: "14px" }} />
      <div className="grid-responsive-2" style={{ gap: "12px" }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ padding: "14px 16px", borderRadius: "14px", background: "#f8fafc", border: "1px solid var(--line)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <SkeletonBox width="110px" height="12px" borderRadius="4px" />
              <SkeletonBox width="30px" height="20px" borderRadius="4px" />
            </div>
            <SkeletonBox width="100%" height="6px" borderRadius="4px" />
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ============================================================
// SKELETON USER ROWS (For <tbody> of user management table)
// ============================================================

export const SkeletonUserRows: React.FC<{ count?: number }> = ({ count = 4 }) => (
  <>
    {Array.from({ length: count }).map((_, idx) => (
      <tr key={idx} className="skeleton-table-row">
        <td style={{ padding: "12px 14px" }}>
          <SkeletonBox width="110px" height="13px" borderRadius="4px" />
        </td>
        <td style={{ padding: "12px 14px" }}>
          <SkeletonBox width="140px" height="13px" borderRadius="4px" />
        </td>
        <td style={{ padding: "12px 14px" }}>
          <SkeletonBox width="100px" height="20px" borderRadius="10px" />
        </td>
        <td style={{ padding: "12px 14px" }}>
          <SkeletonBox width="60px" height="20px" borderRadius="8px" />
        </td>
        <td style={{ padding: "12px 14px" }}>
          <SkeletonBox width="120px" height="11px" borderRadius="4px" />
        </td>
        <td style={{ padding: "12px 14px" }}>
          <SkeletonBox width="110px" height="28px" borderRadius="8px" />
        </td>
      </tr>
    ))}
  </>
);

// ============================================================
// SKELETON HEALTH STATUS
// ============================================================

export const SkeletonHealthStatus: React.FC = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
    {Array.from({ length: 3 }).map((_, i) => (
      <div
        key={i}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "10px 12px",
          borderRadius: "10px",
          background: "#f9fafb",
        }}
      >
        <SkeletonBox width="50%" height="12px" borderRadius="4px" />
        <SkeletonBox width="90px" height="20px" borderRadius="10px" />
      </div>
    ))}
  </div>
);
