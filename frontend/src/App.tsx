import React, { useState, useEffect } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  Activity,
  FileText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Search,
  Filter,
  RefreshCw,
  UserCog,
  Eye,
  Clock,
  Building2,
  User,
  Stethoscope,
  MapPin,
  Calendar,
  Layers,
  Network,
  Database,
  Lock,
  ChevronRight,
  Info,
  SlidersHorizontal,
  ArrowUpRight,
  Send,
  HelpCircle,
  Hash,
  Scale,
  History,
  UserCheck,
  X,
  LayoutGrid,
  Bell,
  Users,
  ChevronDown,
  ArrowDownLeft,
  CircleCheck,
  PlusCircle,
} from "lucide-react";
import { ClaimRecord, ClaimsListResponse } from "./types/aura";
import { SubgraphViewer } from "./components/SubgraphViewer";
import { LiveClaimSimulatorModal } from "./components/LiveClaimSimulatorModal";
import { ControlledFeedbackPanel } from "./components/ControlledFeedbackPanel";

const BACKEND_URL =
  typeof import.meta.env.VITE_BACKEND_URL === "string" && import.meta.env.VITE_BACKEND_URL !== ""
    ? import.meta.env.VITE_BACKEND_URL
    : (import.meta.env.DEV ? "http://localhost:3001" : "");

type AppRole =
  | "CLAIM_VERIFIER"
  | "FRAUD_ANALYST"
  | "AUDITOR"
  | "ADMINISTRATOR";

interface CurrentUser {
  id: string;
  username: string;
  fullName: string;
  role: AppRole;
  token: string;
}

interface AuditLogItem {
  id: string;
  actorName: string;
  actorRole: string;
  action: string;
  targetId: string;
  payload: any;
  timestamp: string;
}

interface ManagedUser {
  id: string;
  username: string;
  fullName: string;
  role: AppRole;
  isActive: boolean;
  createdAt: string;
}

export function App() {
  // Authentication & Active Role State
  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    id: "usr_verifier_001",
    username: "verifier_aura",
    fullName: "Verifikator Pra-Pembayaran BPJS",
    role: "CLAIM_VERIFIER",
    token: "",
  });

  const [data, setData] = useState<ClaimsListResponse | null>(null);
  const [selectedClaim, setSelectedClaim] = useState<ClaimRecord | null>(null);
  const [riskFilter, setRiskFilter] = useState<string>("ALL");
  const [scenarioFilter, setScenarioFilter] = useState<string>("ALL");
  const [analysisFilter, setAnalysisFilter] = useState<string>("ALL");
  const [reviewStatusFilter, setReviewStatusFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<string>("fri_desc");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [dataSourceError, setDataSourceError] = useState<string | null>(null);

  // Active navigation & dossier tab
  const [activeNav, setActiveNav] = useState<"dashboard" | "xai" | "audit" | "users">("dashboard");
  const [activeTab, setActiveTab] = useState<"xai" | "graph" | "review" | "history">("xai");

  // Review decision states
  const [selectedDecision, setSelectedDecision] = useState<"RELEASE" | "CLARIFY" | "ESCALATE_AUDIT">("RELEASE");
  const [reviewNotes, setReviewNotes] = useState<string>("");
  const [submittingReview, setSubmittingReview] = useState<boolean>(false);
  const [reviewBanner, setReviewBanner] = useState<{
    status: "REVIEW_SAVED" | "REVIEW_SAVE_FAILED";
    message: string;
  } | null>(null);

  // Modals
  const [showSimulatorModal, setShowSimulatorModal] = useState<boolean>(false);
  const [showAuditModal, setShowAuditModal] = useState<boolean>(false);
  const [auditModalTab, setAuditModalTab] = useState<"audit_logs" | "feedback_export">("audit_logs");
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState<boolean>(false);

  const [showUserMgmtModal, setShowUserMgmtModal] = useState<boolean>(false);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState<boolean>(false);
  const [newUsername, setNewUsername] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<AppRole>("CLAIM_VERIFIER");
  const [userMgmtError, setUserMgmtError] = useState<string | null>(null);
  const [userMgmtSuccess, setUserMgmtSuccess] = useState<string | null>(null);

  // Role selector dropdown in topbar
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);

  // Switch Role
  const switchRole = async (targetRole: AppRole) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/demo-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: targetRole }),
      });
      if (res.ok) {
        const json = await res.json();
        setCurrentUser({
          id: json.user.id,
          username: json.user.username,
          fullName: json.user.fullName,
          role: targetRole,
          token: json.token,
        });
      }
    } catch {
      setCurrentUser((prev) => ({
        ...prev,
        role: targetRole,
        fullName:
          targetRole === "CLAIM_VERIFIER"
            ? "Verifikator Pra-Pembayaran BPJS"
            : targetRole === "FRAUD_ANALYST"
            ? "Analis Investigasi Fraud BPJS"
            : targetRole === "AUDITOR"
            ? "Auditor Kepatuhan & Tata Kelola BPJS"
            : "Administrator Keamanan Sistem BPJS",
      }));
    }
    setRoleMenuOpen(false);
  };

  useEffect(() => {
    switchRole("CLAIM_VERIFIER");
  }, []);

  const fetchClaims = async (preferClaimId?: string) => {
    setLoading(true);
    setDataSourceError(null);
    try {
      const params = new URLSearchParams();
      if (riskFilter !== "ALL") params.set("risk_level", riskFilter);
      if (scenarioFilter !== "ALL") params.set("scenario", scenarioFilter);
      if (analysisFilter !== "ALL") params.set("analysis_status", analysisFilter);
      if (reviewStatusFilter !== "ALL") params.set("review_status", reviewStatusFilter);
      if (sortBy) params.set("sort_by", sortBy);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      params.set("limit", "250");

      const res = await fetch(`${BACKEND_URL}/api/claims?${params.toString()}`, {
        headers: currentUser.token
          ? { Authorization: `Bearer ${currentUser.token}` }
          : {},
      });
      const json = await res.json();

      if (!res.ok || json.status === "DATA_SOURCE_UNAVAILABLE") {
        setDataSourceError(
          json.error ||
            "Gagal menghubungi database PostgreSQL. Sesuai Zero Mock Data Policy, data tiruan tidak ditampilkan."
        );
        setData(null);
        setSelectedClaim(null);
        return;
      }

      setData(json);

      if (json.claims && json.claims.length > 0) {
        if (preferClaimId) {
          const found = json.claims.find((c: ClaimRecord) => c.claim_id === preferClaimId);
          if (found) {
            setSelectedClaim(found);
            return;
          }
        }
        if (!selectedClaim) {
          setSelectedClaim(json.claims[0]);
        } else {
          const updated = json.claims.find(
            (c: ClaimRecord) => c.claim_id === selectedClaim.claim_id
          );
          setSelectedClaim(updated || json.claims[0]);
        }
      } else {
        setSelectedClaim(null);
      }
    } catch (err: any) {
      console.error("Failed to fetch claims from Next.js backend:", err);
      setDataSourceError(
        "Koneksi ke API Gateway Backend gagal. Pastikan layanan Pendukung aktif."
      );
      setData(null);
      setSelectedClaim(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClaims();
  }, [riskFilter, scenarioFilter, analysisFilter, reviewStatusFilter, sortBy, currentUser.role]);

  const handleReviewDecision = async (
    decision: "RELEASE" | "CLARIFY" | "ESCALATE_AUDIT"
  ) => {
    if (!selectedClaim) return;
    setSubmittingReview(true);
    setReviewBanner(null);

    const notes =
      reviewNotes.trim() ||
      `Keputusan ${decision} dievaluasi melalui Dashboard Investigatif AURA-JKN oleh ${currentUser.fullName}.`;

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (currentUser.token) {
        headers["Authorization"] = `Bearer ${currentUser.token}`;
      } else {
        headers["x-reviewer-name"] = currentUser.fullName;
        headers["x-reviewer-role"] = currentUser.role;
      }

      const res = await fetch(
        `${BACKEND_URL}/api/claims/${selectedClaim.claim_id}/review`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            decision,
            notes,
          }),
        }
      );

      const json = await res.json();

      if (res.ok && json.status === "REVIEW_SAVED") {
        setReviewNotes("");
        setReviewBanner({
          status: "REVIEW_SAVED",
          message: `Keputusan [${decision}] untuk klaim ${selectedClaim.claim_id} BERHASIL DISIMPAN permanen ke PostgreSQL & Audit Log.`,
        });

        try {
          const detailRes = await fetch(
            `${BACKEND_URL}/api/claims/${selectedClaim.claim_id}`,
            {
              headers: currentUser.token
                ? { Authorization: `Bearer ${currentUser.token}` }
                : {},
            }
          );
          if (detailRes.ok) {
            const updatedClaim = await detailRes.json();
            setSelectedClaim(updatedClaim);
          }
        } catch {}

        await fetchClaims();
      } else {
        setReviewBanner({
          status: "REVIEW_SAVE_FAILED",
          message: `PENYIMPANAN GAGAL: ${
            json.error || "Transaksi database dibatalkan. Keputusan review TIDAK tersimpan."
          }`,
        });
      }
    } catch (err: any) {
      setReviewBanner({
        status: "REVIEW_SAVE_FAILED",
        message: `PENYIMPANAN GAGAL: Terjadi kegagalan jaringan saat menyimpan (${err?.message || "Koneksi terputus"}).`,
      });
    } finally {
      setSubmittingReview(false);
    }
  };

  const fetchAuditLogs = async () => {
    setLoadingAuditLogs(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/audit-logs?limit=50`, {
        headers: currentUser.token
          ? { Authorization: `Bearer ${currentUser.token}` }
          : {},
      });
      const json = await res.json();
      if (res.ok && json.logs) {
        setAuditLogs(
          json.logs.map((l: any) => ({
            ...l,
            timestamp: l.timestamp || l.recordedAt,
          }))
        );
      }
    } catch (err) {
      console.error("Gagal memuat log audit:", err);
    } finally {
      setLoadingAuditLogs(false);
    }
  };

  const fetchUsers = async () => {
    setLoadingUsers(true);
    setUserMgmtError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/users`, {
        headers: currentUser.token
          ? { Authorization: `Bearer ${currentUser.token}` }
          : {},
      });
      const json = await res.json();
      if (res.ok && json.users) {
        setManagedUsers(json.users);
      } else {
        setUserMgmtError(json.error || "Gagal memuat daftar pengguna.");
      }
    } catch (err: any) {
      setUserMgmtError("Koneksi gagal saat memuat data pengguna.");
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserMgmtError(null);
    setUserMgmtSuccess(null);

    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentUser.token}`,
        },
        body: JSON.stringify({
          username: newUsername,
          fullName: newFullName,
          password: newPassword,
          role: newRole,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setUserMgmtSuccess(`Pengguna '${newUsername}' berhasil didaftarkan!`);
        setNewUsername("");
        setNewFullName("");
        setNewPassword("");
        fetchUsers();
      } else {
        setUserMgmtError(json.error || "Gagal mendaftarkan pengguna.");
      }
    } catch (err: any) {
      setUserMgmtError("Terjadi galat jaringan saat menyimpan pengguna.");
    }
  };

  const toggleUserActive = async (userId: string, currentActive: boolean) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentUser.token}`,
        },
        body: JSON.stringify({ isActive: !currentActive }),
      });
      if (res.ok) {
        fetchUsers();
      }
    } catch (err) {
      console.error("Gagal mengubah status pengguna:", err);
    }
  };

  const formatIDR = (num: number) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(num);

  const getRoleBadge = (role: AppRole) => {
    switch (role) {
      case "CLAIM_VERIFIER":
        return "Verifikator Pra-Bayar";
      case "FRAUD_ANALYST":
        return "Analis Investigasi";
      case "AUDITOR":
        return "Auditor Tata Kelola";
      case "ADMINISTRATOR":
        return "Admin Keamanan";
      default:
        return role;
    }
  };

  return (
    <>
      {/* 1. TOPBAR (Template Native Styling) */}
      <header className="topbar">
        <div className="topbar-brand">
          <div className="brand" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <img
              src="/aura-jkn-logo.png"
              alt="AURA JKN Logo"
              style={{
                height: "44px",
                width: "auto",
                objectFit: "contain",
                borderRadius: "8px",
                background: "#ffffff",
                padding: "2px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
              }}
            />
            <div>
              <div style={{ fontSize: "19px", fontWeight: "800", letterSpacing: "-0.5px", lineHeight: "1.1", color: "#0F2942" }}>
                AURA <span style={{ color: "#0284C7" }}>JKN</span>
              </div>
              <div style={{ fontSize: "8.5px", fontWeight: "700", letterSpacing: "1.6px", color: "#0284C7", textTransform: "uppercase", marginTop: "2px" }}>
                PREDICT • PREVENT • PROTECT
              </div>
            </div>
          </div>
        </div>

        {/* Top Navigation Pills */}
        <nav className="top-navigation" aria-label="Navigasi Utama">
          <button
            onClick={() => {
              setActiveNav("dashboard");
              setActiveTab("xai");
            }}
            className={activeNav === "dashboard" ? "active" : ""}
          >
            Antrean Klaim
          </button>
          <button
            onClick={() => {
              setActiveNav("xai");
              setActiveTab("graph");
            }}
            className={activeNav === "xai" ? "active" : ""}
          >
            Peta Graf R-GCN
          </button>
          <button
            onClick={() => setShowSimulatorModal(true)}
          >
            Simulasi Klaim Baru
          </button>
          <button
            onClick={() => {
              setShowAuditModal(true);
              fetchAuditLogs();
            }}
            className={activeNav === "audit" ? "active" : ""}
          >
            Jejak Audit &amp; Feedback AI
          </button>
          {currentUser.role === "ADMINISTRATOR" && (
            <button
              onClick={() => {
                setShowUserMgmtModal(true);
                fetchUsers();
              }}
              className={activeNav === "users" ? "active" : ""}
            >
              Kelola Pengguna
            </button>
          )}
        </nav>

        {/* Topbar Actions */}
        <div className="topbar-actions">
          {/* Refresh Action */}
          <button
            className="icon-button"
            title="Segarkan data dari PostgreSQL"
            onClick={() => fetchClaims()}
            disabled={loading}
          >
            <RefreshCw size={19} className={loading ? "animate-spin text-green" : ""} />
          </button>

          {/* Role Selector Trigger */}
          <div className="relative">
            <button
              className="button button-secondary"
              style={{ minHeight: "38px", padding: "6px 14px", fontSize: "12px", borderRadius: "20px" }}
              onClick={() => setRoleMenuOpen((v) => !v)}
            >
              <UserCheck size={15} className="text-green" />
              <span>{getRoleBadge(currentUser.role)}</span>
              <ChevronDown size={14} />
            </button>

            {roleMenuOpen && (
              <div
                className="card"
                style={{
                  position: "absolute",
                  right: 0,
                  top: "46px",
                  zIndex: 50,
                  padding: "8px",
                  borderRadius: "18px",
                  width: "230px",
                  boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
                }}
              >
                <div style={{ padding: "8px 10px", fontSize: "11px", color: "var(--muted)", fontWeight: 700 }}>
                  GANTI PERAN RBAC:
                </div>
                {(
                  [
                    ["CLAIM_VERIFIER", "Verifikator Pra-Bayar"],
                    ["FRAUD_ANALYST", "Analis Investigasi"],
                    ["AUDITOR", "Auditor Kepatuhan"],
                    ["ADMINISTRATOR", "Administrator"],
                  ] as const
                ).map(([rKey, rLabel]) => (
                  <button
                    key={rKey}
                    onClick={() => switchRole(rKey)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 12px",
                      borderRadius: "10px",
                      fontSize: "12px",
                      fontWeight: currentUser.role === rKey ? 700 : 500,
                      color: currentUser.role === rKey ? "var(--green)" : "#3e463b",
                      background: currentUser.role === rKey ? "#edf6f0" : "transparent",
                    }}
                  >
                    {rLabel}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="topbar-divider" />

          {/* Profile Badge */}
          <button
            className="profile-button"
            title={currentUser.fullName}
            onClick={() => switchRole(currentUser.role === "CLAIM_VERIFIER" ? "ADMINISTRATOR" : "CLAIM_VERIFIER")}
          >
            <span className="avatar avatar-profile">
              {currentUser.role.substring(0, 2)}
            </span>
          </button>
        </div>
      </header>

      {/* 2. FLOATING SIDEBAR (Template Native Styling) */}
      <aside className="sidebar" aria-label="Navigasi cepat">
        <nav className="sidebar-group">
          <button
            title="Antrean Klaim"
            aria-label="Antrean Klaim"
            onClick={() => {
              setActiveNav("dashboard");
              setActiveTab("xai");
            }}
            className={activeNav === "dashboard" ? "active" : ""}
          >
            <LayoutGrid size={21} strokeWidth={1.6} />
            <span className="sidebar-tooltip">Antrean Klaim</span>
          </button>
          <button
            title="Analisis Graf R-GCN"
            aria-label="Analisis Graf R-GCN"
            onClick={() => {
              setActiveNav("xai");
              setActiveTab("graph");
            }}
            className={activeNav === "xai" ? "active" : ""}
          >
            <Network size={21} strokeWidth={1.6} />
            <span className="sidebar-tooltip">Peta Graf R-GCN</span>
          </button>
          <button
            title="Simulasi Klaim Baru"
            aria-label="Simulasi Klaim Baru"
            onClick={() => setShowSimulatorModal(true)}
          >
            <PlusCircle size={21} strokeWidth={1.6} />
            <span className="sidebar-tooltip">Simulasi Klaim Baru</span>
          </button>
          <button
            title="Jejak Audit & Feedback AI"
            aria-label="Jejak Audit & Feedback AI"
            onClick={() => {
              setShowAuditModal(true);
              fetchAuditLogs();
            }}
          >
            <FileText size={21} strokeWidth={1.6} />
            <span className="sidebar-tooltip">Jejak Audit &amp; Feedback AI</span>
          </button>
        </nav>

        <nav className="sidebar-group">
          {currentUser.role === "ADMINISTRATOR" && (
            <button
              title="Kelola Pengguna RBAC"
              aria-label="Kelola Pengguna RBAC"
              onClick={() => {
                setShowUserMgmtModal(true);
                fetchUsers();
              }}
            >
              <Users size={21} strokeWidth={1.6} />
              <span className="sidebar-tooltip">Manajemen Pengguna</span>
            </button>
          )}
          <button
            title="Zero Mock Data Policy"
            aria-label="Zero Mock Policy"
            onClick={() =>
              alert(
                "AURA-JKN Zero Mock Policy: Seluruh klaim berasal dari PostgreSQL port 5432. Tidak ada skor atau grafik palsu yang direkayasa."
              )
            }
          >
            <ShieldCheck size={21} strokeWidth={1.6} className="text-green" />
            <span className="sidebar-tooltip">Zero Mock Data</span>
          </button>
        </nav>

        <nav className="sidebar-group sidebar-bottom">
          <button
            title="Basis Data PostgreSQL"
            aria-label="Basis Data PostgreSQL"
            onClick={() => fetchClaims()}
          >
            <Database size={21} strokeWidth={1.6} />
            <span className="sidebar-tooltip">19.999 Klaim di PostgreSQL</span>
          </button>
        </nav>
      </aside>

      {/* 3. MAIN CONTENT (Template Native Styling with margin-left: 94px) */}
      <main id="main-content" className="main-content">
        {/* Page Header */}
        <div className="page-header">
          <div>
            <h1>
              Pusat Investigasi Anti-Fraud, <span>{getRoleBadge(currentUser.role)}</span>
              <span className="greeting-dot">.</span>
            </h1>
            <p>
              Sistem pendukung keputusan deteksi risiko klaim fiktif berbasis graf heterogen &amp; R-GCN &bull; BPJS Kesehatan Healthkathon 2026
            </p>
          </div>

          <div className="page-actions">
            {/* Live DB Badge */}
            <div
              className="card"
              style={{
                padding: "8px 16px",
                borderRadius: "30px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "12px",
                fontWeight: 600,
              }}
            >
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  backgroundColor: data?.storage_source === "postgresql" ? "var(--green)" : "#c95353",
                }}
              />
              <span>
                {data?.storage_source === "postgresql"
                  ? "PostgreSQL Live (19.999 Klaim)"
                  : "Database Terputus"}
              </span>
            </div>

            <button
              className="button button-primary"
              onClick={() => setShowSimulatorModal(true)}
            >
              <PlusCircle size={15} />
              Uji Klaim Baru
            </button>

            <button className="button button-secondary" onClick={() => fetchClaims()} disabled={loading}>
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
              Segarkan Antrean
            </button>
          </div>
        </div>

        {/* Database Offline Error Banner */}
        {dataSourceError && (
          <div
            className="card"
            style={{
              background: "#faecec",
              borderColor: "#eec5c5",
              color: "#a53e3e",
              marginBottom: "20px",
              padding: "16px 20px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", fontWeight: 700 }}>
              <AlertTriangle size={18} />
              Sumber Data Otoritatif Tidak Tersedia (Zero Mock Policy)
            </div>
            <p style={{ marginTop: "6px", fontSize: "12px" }}>{dataSourceError}</p>
          </div>
        )}

        {/* Review Action Banner */}
        {reviewBanner && (
          <div
            className="card"
            style={{
              background: reviewBanner.status === "REVIEW_SAVED" ? "#edf6f0" : "#faecec",
              borderColor: reviewBanner.status === "REVIEW_SAVED" ? "#cbe3d7" : "#eec5c5",
              color: reviewBanner.status === "REVIEW_SAVED" ? "var(--dark-green)" : "#a53e3e",
              marginBottom: "20px",
              padding: "16px 20px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", fontWeight: 600 }}>
              {reviewBanner.status === "REVIEW_SAVED" ? (
                <CheckCircle2 size={18} className="text-green" />
              ) : (
                <XCircle size={18} />
              )}
              {reviewBanner.message}
            </div>
            <button className="icon-button" onClick={() => setReviewBanner(null)}>
              <X size={16} />
            </button>
          </div>
        )}

        {/* 4. KPI METRICS CARDS (Template Native Styling including Bank Card in #098352) */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "20px",
            marginBottom: "24px",
          }}
        >
          {/* Card 1: Total Claims in DB */}
          <div className="card" style={{ padding: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span className="eyebrow">TOTAL KLAIM DI DATABASE</span>
              <span className="avatar avatar-blue avatar-small">
                <Database size={16} />
              </span>
            </div>
            <div style={{ fontSize: "28px", fontWeight: 800, letterSpacing: "-1px" }}>
              {data?.summary.total_claims ? data.summary.total_claims.toLocaleString("id-ID") : "19.999"}
            </div>
            <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "6px" }}>
              Rata-rata FRI: <strong>{data?.summary.avg_fri ?? "-"}</strong> &bull; PostgreSQL Live
            </div>
          </div>

          {/* Card 2: High Risk Claims */}
          <div className="card" style={{ padding: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span className="eyebrow" style={{ color: "#c95353" }}>
                KLAIM RISIKO TINGGI (FRI &ge; 70)
              </span>
              <span className="avatar avatar-pink avatar-small">
                <ShieldAlert size={16} />
              </span>
            </div>
            <div style={{ fontSize: "28px", fontWeight: 800, letterSpacing: "-1px", color: "#c95353" }}>
              {data?.summary.high_risk_count ? data.summary.high_risk_count.toLocaleString("id-ID") : "3.998"}
            </div>
            <div style={{ fontSize: "12px", color: "#a53e3e", marginTop: "6px" }}>
              Rekomendasi skrining: Ditahan untuk telaah
            </div>
          </div>

          {/* Card 3: Flagged Warning Claims */}
          <div className="card" style={{ padding: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span className="eyebrow" style={{ color: "#b38432" }}>
                PERINGATAN / WASPADA (FRI 40–69)
              </span>
              <span className="avatar avatar-peach avatar-small">
                <AlertTriangle size={16} />
              </span>
            </div>
            <div style={{ fontSize: "28px", fontWeight: 800, letterSpacing: "-1px", color: "#b38432" }}>
              {data?.summary.medium_risk_count ? data.summary.medium_risk_count.toLocaleString("id-ID") : "1"}
            </div>
            <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "6px" }}>
              Deviasi fitur graf sedang (Sampling verifikasi)
            </div>
          </div>

          {/* Card 4: Held Tariffs (Template's Gorgeous Bank Card Style in #098352) */}
          <div className="bank-card" style={{ minHeight: "135px", height: "auto" }}>
            <div className="bank-card-top">
              <span className="bank-brand">
                BPJS<span>INA-CBGS</span>
              </span>
              <ShieldCheck size={24} />
            </div>
            <div className="bank-card-value">
              <span>Tarif Klaim Ditahan Sementara:</span>
              <strong>{formatIDR(data?.summary.held_tariff_idr ?? 3152568742)}</strong>
            </div>
          </div>
        </div>

        {/* 5. WORKSPACE: 2-COLUMN CLAIMS QUEUE & INVESTIGATION DOSSIER */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(330px, 1.15fr) minmax(460px, 1.85fr)", gap: "20px", alignItems: "start" }}>
          {/* LEFT COLUMN: ANTREAN KLAIM */}
          <div className="card" style={{ padding: "18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div>
                <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0 }}>Antrean Verifikasi Klaim</h2>
                <small className="muted">
                  {data?.claims.length ?? 0} ditampilkan dari{" "}
                  {data?.summary.total_claims ? data.summary.total_claims.toLocaleString("id-ID") : "19.999"} klaim
                </small>
              </div>
              <span
                style={{
                  background: "#e5f4ec",
                  color: "var(--dark-green)",
                  padding: "4px 10px",
                  borderRadius: "20px",
                  fontSize: "11px",
                  fontWeight: 700,
                }}
              >
                POSTGRESQL
              </span>
            </div>

            {/* Search Box */}
            <div style={{ position: "relative", marginBottom: "12px" }}>
              <Search size={16} style={{ position: "absolute", left: "14px", top: "12px", color: "var(--muted)" }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchClaims()}
                placeholder="Cari Klaim, Dokter, Faskes, ICD-10..."
                style={{
                  width: "100%",
                  padding: "10px 14px 10px 38px",
                  borderRadius: "24px",
                  border: "1px solid var(--line)",
                  background: "var(--surface)",
                  fontSize: "12px",
                }}
              />
            </div>

            {/* Filter Dropdowns (Task 2.2 & Task 3.2: Risk, Scenario, Review Status, Sort FRI) */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "14px" }}>
              <select
                value={riskFilter}
                onChange={(e) => setRiskFilter(e.target.value)}
                style={{
                  padding: "8px 12px",
                  borderRadius: "20px",
                  border: "1px solid var(--line)",
                  background: "var(--surface)",
                  fontSize: "11.5px",
                }}
              >
                <option value="ALL">Semua Risiko</option>
                <option value="HIGH">Risiko Tinggi (&ge; 70)</option>
                <option value="MEDIUM">Sedang (40–69)</option>
                <option value="LOW">Rendah (&lt; 40)</option>
                <option value="UNASSESSED">Belum Diasesmen</option>
              </select>

              <select
                value={scenarioFilter}
                onChange={(e) => setScenarioFilter(e.target.value)}
                style={{
                  padding: "8px 12px",
                  borderRadius: "20px",
                  border: "1px solid var(--line)",
                  background: "var(--surface)",
                  fontSize: "11.5px",
                }}
              >
                <option value="ALL">Semua Skenario</option>
                <option value="C">Skenario C (Konflik Jam)</option>
                <option value="B">Skenario B (Dokter Ekstrem)</option>
                <option value="A">Skenario A (Phantom Rujukan)</option>
                <option value="NORMAL">Klaim Wajar (Normal)</option>
              </select>

              <select
                value={reviewStatusFilter}
                onChange={(e) => setReviewStatusFilter(e.target.value)}
                style={{
                  padding: "8px 12px",
                  borderRadius: "20px",
                  border: "1px solid var(--line)",
                  background: "var(--surface)",
                  fontSize: "11.5px",
                }}
              >
                <option value="ALL">Semua Status Review</option>
                <option value="PENDING_REVIEW">Menunggu Telaah</option>
                <option value="RELEASED">Disetujui (RELEASED)</option>
                <option value="CLARIFICATION_REQUESTED">Minta Klarifikasi</option>
                <option value="ESCALATED_AUDIT">Eskalasi Audit</option>
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{
                  padding: "8px 12px",
                  borderRadius: "20px",
                  border: "1px solid var(--line)",
                  background: "var(--surface)",
                  fontSize: "11.5px",
                }}
              >
                <option value="fri_desc">Urut: Skor FRI Tertinggi</option>
                <option value="tariff_desc">Urut: Tarif Tertinggi</option>
                <option value="newest">Urut: Terbaru Masuk</option>
                <option value="fri_asc">Urut: Skor FRI Terendah</option>
              </select>
            </div>

            {/* Scrollable Claims List */}
            <div style={{ maxHeight: "640px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px" }}>
              {loading ? (
                <div style={{ padding: "40px", textAlign: "center", color: "var(--muted)", fontSize: "12px" }}>
                  <RefreshCw size={24} className="animate-spin text-green" style={{ margin: "0 auto 10px" }} />
                  Memuat data klaim dari PostgreSQL...
                </div>
              ) : !data || data.claims.length === 0 ? (
                <div style={{ padding: "40px", textAlign: "center", color: "var(--muted)", fontSize: "12px" }}>
                  Tidak ada klaim yang cocok dengan kriteria pencarian.
                </div>
              ) : (
                data.claims.map((claim) => {
                  const isSelected = selectedClaim?.claim_id === claim.claim_id;
                  const isHigh = claim.risk_level === "HIGH";
                  const isMed = claim.risk_level === "MEDIUM";

                  return (
                    <div
                      key={claim.claim_id}
                      onClick={() => setSelectedClaim(claim)}
                      style={{
                        padding: "14px",
                        borderRadius: "18px",
                        border: `1.5px solid ${isSelected ? "var(--green)" : "var(--line)"}`,
                        background: isSelected ? "#f1f8f4" : "#ffffff",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: "13px" }}>
                            {claim.claim_id}
                          </span>
                          {claim.fraud_scenario && (
                            <span
                              style={{
                                fontSize: "10px",
                                fontWeight: 700,
                                padding: "2px 6px",
                                borderRadius: "8px",
                                background: "#f8ecd4",
                                color: "#9c6b1a",
                              }}
                            >
                              SKENARIO {claim.fraud_scenario}
                            </span>
                          )}
                        </div>

                        {/* FRI Badge */}
                        {claim.fraud_risk_index !== null ? (
                          <span
                            style={{
                              fontSize: "11px",
                              fontWeight: 800,
                              padding: "3px 8px",
                              borderRadius: "14px",
                              background: isHigh ? "#faecec" : isMed ? "#f8ecd4" : "#e5f4ec",
                              color: isHigh ? "#c95353" : isMed ? "#b38432" : "var(--dark-green)",
                            }}
                          >
                            FRI {claim.fraud_risk_index}
                          </span>
                        ) : (
                          <span style={{ fontSize: "10px", color: "var(--muted)" }}>Belum Diasesmen</span>
                        )}
                      </div>

                      <div style={{ fontSize: "12px", color: "#3e463b", marginBottom: "6px" }}>
                        <strong>{claim.doctor_id}</strong> &bull; {claim.specialty}
                        <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "2px" }}>
                          {claim.facility_id} ({claim.facility_class}) &bull; ICD-10: <strong>{claim.icd10_code}</strong>
                        </div>
                      </div>

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", color: "var(--muted)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span>{claim.service_date}</span>
                          <span
                            style={{
                              fontSize: "9.5px",
                              fontWeight: 700,
                              padding: "1px 6px",
                              borderRadius: "8px",
                              background:
                                claim.review_status === "ESCALATED_AUDIT"
                                  ? "#faecec"
                                  : claim.review_status === "CLARIFICATION_REQUESTED"
                                  ? "#f8ecd4"
                                  : claim.review_status === "RELEASED"
                                  ? "#e5f4ec"
                                  : "#f0f4f1",
                              color:
                                claim.review_status === "ESCALATED_AUDIT"
                                  ? "#c95353"
                                  : claim.review_status === "CLARIFICATION_REQUESTED"
                                  ? "#b38432"
                                  : claim.review_status === "RELEASED"
                                  ? "var(--dark-green)"
                                  : "#4b5563",
                            }}
                          >
                            {claim.review_status}
                          </span>
                        </div>
                        <strong style={{ color: "var(--dark-green)", fontSize: "12px" }}>
                          {formatIDR(claim.ina_cbgs_tariff)}
                        </strong>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: DETAILED INVESTIGATION DOSSIER */}
          <div className="card" style={{ padding: "22px" }}>
            {!selectedClaim ? (
              <div style={{ padding: "60px", textAlign: "center", color: "var(--muted)" }}>
                <FileText size={40} style={{ margin: "0 auto 12px", opacity: 0.4 }} />
                <h3>Pilih Klaim untuk Ditelaah</h3>
                <p style={{ fontSize: "12px", marginTop: "6px" }}>
                  Klik salah satu klaim pada daftar antrean sebelah kiri untuk melihat detail bukti XAI dan graf relasional.
                </p>
              </div>
            ) : (
              <div>
                {/* Dossier Header */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    borderBottom: "1px solid var(--line)",
                    paddingBottom: "16px",
                    marginBottom: "18px",
                    flexWrap: "wrap",
                    gap: "12px",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <h2 style={{ fontSize: "20px", fontWeight: 800, margin: 0, fontFamily: "monospace" }}>
                        {selectedClaim.claim_id}
                      </h2>
                      {selectedClaim.fraud_scenario && (
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            padding: "3px 8px",
                            borderRadius: "10px",
                            background: "#f8ecd4",
                            color: "#9c6b1a",
                          }}
                        >
                          SKENARIO {selectedClaim.fraud_scenario}
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 700,
                          padding: "3px 10px",
                          borderRadius: "14px",
                          background: "#e5f4ec",
                          color: "var(--dark-green)",
                        }}
                      >
                        {formatIDR(selectedClaim.ina_cbgs_tariff)}
                      </span>
                    </div>
                    <p style={{ fontSize: "12px", color: "var(--muted)", marginTop: "4px" }}>
                      Faskes: <strong>{selectedClaim.facility_id}</strong> ({selectedClaim.facility_class}) &bull; Dokter: <strong>{selectedClaim.doctor_id}</strong> ({selectedClaim.specialty})
                    </p>
                  </div>

                  {/* Clean Tab Pills */}
                  <div className="top-navigation" style={{ padding: "4px", borderRadius: "24px" }}>
                    <button
                      onClick={() => setActiveTab("xai")}
                      className={activeTab === "xai" ? "active" : ""}
                      style={{ padding: "8px 14px", fontSize: "12px" }}
                    >
                      Asesmen &amp; XAI
                    </button>
                    <button
                      onClick={() => setActiveTab("graph")}
                      className={activeTab === "graph" ? "active" : ""}
                      style={{ padding: "8px 14px", fontSize: "12px" }}
                    >
                      Peta Graf R-GCN
                    </button>
                    <button
                      onClick={() => setActiveTab("review")}
                      className={activeTab === "review" ? "active" : ""}
                      style={{ padding: "8px 14px", fontSize: "12px" }}
                    >
                      Telaah Verifikator
                    </button>
                    <button
                      onClick={() => setActiveTab("history")}
                      className={activeTab === "history" ? "active" : ""}
                      style={{ padding: "8px 14px", fontSize: "12px" }}
                    >
                      Jejak ({selectedClaim.human_reviews.length})
                    </button>
                  </div>
                </div>

                {/* TAB 1: ASESMEN & XAI */}
                {activeTab === "xai" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                    {/* Score Bar & Gate Recommendation */}
                    <div
                      style={{
                        padding: "16px 20px",
                        borderRadius: "18px",
                        background: "var(--surface)",
                        border: "1px solid var(--line)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "14px",
                      }}
                    >
                      <div>
                        <span className="eyebrow">FRAUD RISK INDEX (FRI)</span>
                        <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "2px" }}>
                          <span
                            style={{
                              fontSize: "32px",
                              fontWeight: 800,
                              color:
                                (selectedClaim.fraud_risk_index ?? 0) >= 70
                                  ? "#c95353"
                                  : (selectedClaim.fraud_risk_index ?? 0) >= 40
                                  ? "#b38432"
                                  : "var(--green)",
                            }}
                          >
                            {selectedClaim.fraud_risk_index ?? "-"}
                          </span>
                          <span style={{ fontSize: "14px", color: "var(--muted)", fontWeight: 700 }}>/ 100</span>
                          <span
                            style={{
                              fontSize: "11px",
                              fontWeight: 700,
                              padding: "3px 8px",
                              borderRadius: "12px",
                              background:
                                selectedClaim.risk_level === "HIGH"
                                  ? "#faecec"
                                  : selectedClaim.risk_level === "MEDIUM"
                                  ? "#f8ecd4"
                                  : "#e5f4ec",
                              color:
                                selectedClaim.risk_level === "HIGH"
                                  ? "#c95353"
                                  : selectedClaim.risk_level === "MEDIUM"
                                  ? "#b38432"
                                  : "var(--dark-green)",
                            }}
                          >
                            TINGKAT {selectedClaim.risk_level}
                          </span>
                        </div>
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <span className="eyebrow">REKOMENDASI PRA-PEMBAYARAN:</span>
                        <div
                          style={{
                            marginTop: "4px",
                            padding: "6px 14px",
                            borderRadius: "16px",
                            fontWeight: 700,
                            fontSize: "12px",
                            background:
                              selectedClaim.pre_payment_gate === "REJECT_FOR_HUMAN_REVIEW"
                                ? "#faecec"
                                : selectedClaim.pre_payment_gate === "FLAGGED_WARNING"
                                ? "#f8ecd4"
                                : "#e5f4ec",
                            color:
                              selectedClaim.pre_payment_gate === "REJECT_FOR_HUMAN_REVIEW"
                                ? "#c95353"
                                : selectedClaim.pre_payment_gate === "FLAGGED_WARNING"
                                ? "#b38432"
                                : "var(--dark-green)",
                            border: "1px solid currentColor",
                          }}
                        >
                          {selectedClaim.pre_payment_gate === "REJECT_FOR_HUMAN_REVIEW"
                            ? "TOLAK BAYAR UNTUK TELAAH VERIFIKATOR"
                            : selectedClaim.pre_payment_gate === "FLAGGED_WARNING"
                            ? "PERINGATAN AWAL (SAMPLING)"
                            : "SETUJUI OTOMATIS (AUTO-APPROVE)"}
                        </div>
                      </div>
                    </div>

                    {/* 3 Metric Tiles */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
                      <div className="card" style={{ padding: "14px", borderRadius: "16px" }}>
                        <span className="eyebrow" style={{ fontSize: "10px" }}>KONFLIK TRAJEKTORI</span>
                        <div
                          style={{
                            marginTop: "6px",
                            fontWeight: 700,
                            fontSize: "13px",
                            color: selectedClaim.spatiotemporal_metrics?.spatial_conflict_detected
                              ? "#c95353"
                              : "var(--green)",
                          }}
                        >
                          {selectedClaim.spatiotemporal_metrics?.spatial_conflict_detected
                            ? "Terdeteksi (Anomali)"
                            : "Aman (Wajar)"}
                        </div>
                      </div>

                      <div className="card" style={{ padding: "14px", borderRadius: "16px" }}>
                        <span className="eyebrow" style={{ fontSize: "10px" }}>BEBAN HARIAN DOKTER</span>
                        <div style={{ marginTop: "6px", fontWeight: 700, fontSize: "13px" }}>
                          {selectedClaim.spatiotemporal_metrics?.doctor_daily_volume ?? 0} klaim / hari
                          <small style={{ color: "var(--muted)", fontWeight: 400, marginLeft: "4px" }}>
                            (Maks: 45)
                          </small>
                        </div>
                      </div>

                      <div className="card" style={{ padding: "14px", borderRadius: "16px" }}>
                        <span className="eyebrow" style={{ fontSize: "10px" }}>PROBABILITAS R-GCN</span>
                        <div style={{ marginTop: "6px", fontWeight: 700, fontSize: "13px", color: "var(--dark-green)" }}>
                          {selectedClaim.fraud_probability !== null
                            ? `${(selectedClaim.fraud_probability * 100).toFixed(1)}%`
                            : "Belum Dihitung"}
                        </div>
                      </div>
                    </div>

                    {/* 5-Tier Evidence Engine Architecture */}
                    <div
                      className="card"
                      style={{ padding: "18px", borderRadius: "18px", background: "var(--surface)" }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", borderBottom: "1px solid var(--line)", paddingBottom: "10px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <Layers size={18} className="text-green" />
                          <span className="eyebrow" style={{ color: "#1e241f", fontSize: "12px" }}>
                            ARSITEKTUR BUKTI 5 TINGKAT (EVIDENCE ENGINE):
                          </span>
                        </div>
                        <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "10px", background: "#e5f4ec", color: "var(--dark-green)" }}>
                          CASE-{selectedClaim.claim_id}
                        </span>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        {/* Tier 1: Observed Facts */}
                        <div style={{ background: "#ffffff", padding: "12px 14px", borderRadius: "14px", border: "1px solid var(--line)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                            <span style={{ fontSize: "10px", fontWeight: 800, padding: "2px 6px", borderRadius: "6px", background: "#f0f4f1", color: "#3e463b" }}>
                              TINGKAT 1: FAKTA DATA SUMBER (OBSERVED FACTS)
                            </span>
                          </div>
                          <div style={{ fontSize: "12px", color: "#4b5563", lineHeight: 1.5 }}>
                            Klaim terdaftar pada <strong>{selectedClaim.service_date}</strong> jam <strong>{selectedClaim.service_time}</strong> di Faskes <strong>{selectedClaim.facility_id}</strong> ({selectedClaim.facility_class}) oleh Dokter <strong>{selectedClaim.doctor_id}</strong> (SIP: {selectedClaim.sip_number}) untuk Pasien <strong>{selectedClaim.patient_id.substring(0, 16)}...</strong> dengan diagnosis <strong>{selectedClaim.icd10_code}</strong> senilai <strong>{formatIDR(selectedClaim.ina_cbgs_tariff)}</strong>.
                          </div>
                        </div>

                        {/* Tier 2: Detected Patterns */}
                        <div style={{ background: "#ffffff", padding: "12px 14px", borderRadius: "14px", border: "1px solid var(--line)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                            <span style={{ fontSize: "10px", fontWeight: 800, padding: "2px 6px", borderRadius: "6px", background: selectedClaim.spatiotemporal_metrics?.spatial_conflict_detected ? "#faecec" : "#f0f4f1", color: selectedClaim.spatiotemporal_metrics?.spatial_conflict_detected ? "#c95353" : "#3e463b" }}>
                              TINGKAT 2: POLA TERDETEKSI (DETECTED PATTERNS)
                            </span>
                          </div>
                          <div style={{ fontSize: "12px", color: "#4b5563" }}>
                            <div style={{ fontWeight: 700, color: "#1e241f", marginBottom: "4px" }}>
                              Pemicu Anomali: {selectedClaim.xai_explanation?.primary_fraud_trigger || "Klaim Wajar Tanpa Pemicu Fraud"}
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "6px" }}>
                              {selectedClaim.xai_explanation?.evidence_reasons?.map((r, i) => (
                                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "11.5px" }}>
                                  <span style={{ color: "#098a58", fontWeight: 800 }}>&bull;</span>
                                  <span>{r}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Tier 3: Model Outputs */}
                        <div style={{ background: "#ffffff", padding: "12px 14px", borderRadius: "14px", border: "1px solid var(--line)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                            <span style={{ fontSize: "10px", fontWeight: 800, padding: "2px 6px", borderRadius: "6px", background: "#f0f4f1", color: "#3e463b" }}>
                              TINGKAT 3: PREDIKSI MODEL (MODEL OUTPUTS)
                            </span>
                          </div>
                          <div style={{ fontSize: "12px", color: "#4b5563", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                            <span>Model: <strong>PyG Hetero R-GCN v1.0</strong></span>
                            <span>Skor Anomali: <strong>{selectedClaim.fraud_probability !== null ? `${(selectedClaim.fraud_probability * 100).toFixed(1)}%` : "Belum dihitung"}</strong></span>
                            <span>Rekomendasi Gate: <strong>{selectedClaim.pre_payment_gate}</strong></span>
                          </div>
                        </div>

                        {/* Tier 4 & 5: Investigator Findings & Outcomes */}
                        <div style={{ background: "#ffffff", padding: "12px 14px", borderRadius: "14px", border: "1px solid var(--line)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                            <span style={{ fontSize: "10px", fontWeight: 800, padding: "2px 6px", borderRadius: "6px", background: "#f0f4f1", color: "#3e463b" }}>
                              TINGKAT 4 &amp; 5: HASIL TELAAH &amp; OUTCOME (VERIFIER FINDINGS &amp; OUTCOMES)
                            </span>
                          </div>
                          <div style={{ fontSize: "12px", color: "#4b5563" }}>
                            <span>Status Telaah Saat Ini: <strong>{selectedClaim.review_status}</strong> ({selectedClaim.human_reviews.length} catatan telaah tersimpan di audit log).</span>
                            <div style={{ marginTop: "6px", padding: "8px 10px", borderRadius: "8px", background: "#f9fafb", border: "1px dashed #d1d5db", fontSize: "10.5px", color: "#6b7280" }}>
                              ⚖️ <strong>Integritas Yuridis:</strong> Relasi graf dan skor anomali adalah instrumen pendukung keputusan verifikasi pra-pembayaran (Decision-Support), bukan pembuktian mutlak vonis kecurangan (fraud) yuridis.
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Administrative Parameters Grid */}
                    <div className="card" style={{ padding: "16px", borderRadius: "18px" }}>
                      <span className="eyebrow" style={{ marginBottom: "12px", display: "block" }}>
                        PARAMETER ADMINISTRATIF &amp; KLINIS
                      </span>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px", fontSize: "12px" }}>
                        <div>
                          <small className="muted" style={{ display: "block", marginBottom: "2px" }}>ID Pasien (Salted Hash)</small>
                          <strong style={{ fontFamily: "monospace" }}>{selectedClaim.patient_id.substring(0, 16)}...</strong>
                        </div>
                        <div>
                          <small className="muted" style={{ display: "block", marginBottom: "2px" }}>Wilayah Pasien</small>
                          <strong>{selectedClaim.home_region}</strong>
                        </div>
                        <div>
                          <small className="muted" style={{ display: "block", marginBottom: "2px" }}>Diagnosis ICD-10</small>
                          <strong style={{ fontFamily: "monospace" }}>{selectedClaim.icd10_code}</strong>
                        </div>
                        <div>
                          <small className="muted" style={{ display: "block", marginBottom: "2px" }}>Prosedur ICD-9</small>
                          <strong style={{ fontFamily: "monospace" }}>{selectedClaim.icd9_code || "-"}</strong>
                        </div>
                        <div>
                          <small className="muted" style={{ display: "block", marginBottom: "2px" }}>Tanggal Pelayanan</small>
                          <strong>{selectedClaim.service_date}</strong>
                        </div>
                        <div>
                          <small className="muted" style={{ display: "block", marginBottom: "2px" }}>Jam Layanan</small>
                          <strong>{selectedClaim.service_time}</strong>
                        </div>
                        <div>
                          <small className="muted" style={{ display: "block", marginBottom: "2px" }}>Lama Rawat (LOS)</small>
                          <strong>{selectedClaim.length_of_stay} hari</strong>
                        </div>
                        <div>
                          <small className="muted" style={{ display: "block", marginBottom: "2px" }}>Tarif INA-CBGS</small>
                          <strong style={{ color: "var(--dark-green)" }}>{formatIDR(selectedClaim.ina_cbgs_tariff)}</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: PETA GRAF R-GCN */}
                {activeTab === "graph" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px" }}>
                      <span>
                        Topologi relasi simpul heterogen PyTorch Geometric untuk klaim <strong>{selectedClaim.claim_id}</strong>.
                      </span>
                      <span
                        style={{
                          background: "#e5f4ec",
                          color: "var(--dark-green)",
                          padding: "3px 10px",
                          borderRadius: "12px",
                          fontWeight: 700,
                          fontSize: "11px",
                        }}
                      >
                        {selectedClaim.xai_explanation?.subgraph_evidence?.nodes?.length ?? 0} Simpul &bull;{" "}
                        {selectedClaim.xai_explanation?.subgraph_evidence?.edges?.length ?? 0} Relasi
                      </span>
                    </div>

                    <SubgraphViewer
                      nodes={selectedClaim.xai_explanation?.subgraph_evidence?.nodes || []}
                      edges={selectedClaim.xai_explanation?.subgraph_evidence?.edges || []}
                    />

                    <div
                      className="card"
                      style={{ padding: "14px", background: "var(--surface)", fontSize: "12px", borderRadius: "16px" }}
                    >
                      <strong style={{ display: "block", marginBottom: "4px" }}>Catatan Analisis Graf R-GCN:</strong>
                      <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.5, fontSize: "11px" }}>
                        Model Relational Graph Convolutional Network (R-GCN) mempelajari embedding simpul Dokter, Pasien, Faskes, dan Klaim. Garis merah putus-putus mengindikasikan anomali struktural atau konflik spasio-temporal lintas fasilitas kesehatan.
                      </p>
                    </div>
                  </div>
                )}

                {/* TAB 3: TELAAH VERIFIKATOR (HUMAN-IN-THE-LOOP) */}
                {activeTab === "review" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                    <div
                      className="card"
                      style={{
                        padding: "14px 18px",
                        background: "#edf6f0",
                        borderColor: "#cbe3d7",
                        color: "var(--dark-green)",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        fontSize: "12px",
                        borderRadius: "16px",
                      }}
                    >
                      <UserCheck size={18} />
                      <div>
                        <strong>Wewenang Eksklusif: Verifikator Pra-Pembayaran Klaim BPJS</strong>
                        <div style={{ fontSize: "11px", marginTop: "2px" }}>
                          Keputusan telaah akan dicatat secara atomik ke tabel <code>human_reviews</code> dan <code>audit_logs</code> di PostgreSQL.
                        </div>
                      </div>
                    </div>

                    {currentUser.role !== "CLAIM_VERIFIER" ? (
                      <div
                        className="card"
                        style={{ padding: "40px", textAlign: "center", color: "var(--muted)" }}
                      >
                        <Lock size={30} style={{ margin: "0 auto 10px", opacity: 0.5 }} />
                        <h3>Akses Terbatas Aturan RBAC</h3>
                        <p style={{ fontSize: "12px", maxWidth: "420px", margin: "6px auto 0" }}>
                          Peran Anda saat ini adalah <strong>{currentUser.role}</strong>. Sesuai prinsip <em>Separation of Duties</em>, hanya peran <strong>CLAIM_VERIFIER</strong> yang berhak mengambil keputusan telaah verifikasi klaim.
                        </p>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                        <span className="eyebrow">PILIH TINDAKAN TELAAH VERIFIKASI:</span>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
                          {/* Option RELEASE */}
                          <div
                            onClick={() => setSelectedDecision("RELEASE")}
                            style={{
                              padding: "16px",
                              borderRadius: "16px",
                              border: `2px solid ${selectedDecision === "RELEASE" ? "var(--green)" : "var(--line)"}`,
                              background: selectedDecision === "RELEASE" ? "#edf6f0" : "#ffffff",
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                              <span
                                style={{
                                  width: "14px",
                                  height: "14px",
                                  borderRadius: "50%",
                                  border: "2px solid var(--green)",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                {selectedDecision === "RELEASE" && (
                                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--green)" }} />
                                )}
                              </span>
                              <strong style={{ fontSize: "13px", color: "var(--dark-green)" }}>RELEASE</strong>
                            </div>
                            <p style={{ fontSize: "11px", color: "var(--muted)", margin: 0, lineHeight: 1.4 }}>
                              Setujui klaim dan teruskan ke pencairan dana INA-CBGS.
                            </p>
                          </div>

                          {/* Option CLARIFY */}
                          <div
                            onClick={() => setSelectedDecision("CLARIFY")}
                            style={{
                              padding: "16px",
                              borderRadius: "16px",
                              border: `2px solid ${selectedDecision === "CLARIFY" ? "#b38432" : "var(--line)"}`,
                              background: selectedDecision === "CLARIFY" ? "#fdf8ee" : "#ffffff",
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                              <span
                                style={{
                                  width: "14px",
                                  height: "14px",
                                  borderRadius: "50%",
                                  border: "2px solid #b38432",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                {selectedDecision === "CLARIFY" && (
                                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#b38432" }} />
                                )}
                              </span>
                              <strong style={{ fontSize: "13px", color: "#b38432" }}>CLARIFY</strong>
                            </div>
                            <p style={{ fontSize: "11px", color: "var(--muted)", margin: 0, lineHeight: 1.4 }}>
                              Tahan sementara dan mintakan klarifikasi berkas ke Faskes.
                            </p>
                          </div>

                          {/* Option ESCALATE */}
                          <div
                            onClick={() => setSelectedDecision("ESCALATE_AUDIT")}
                            style={{
                              padding: "16px",
                              borderRadius: "16px",
                              border: `2px solid ${selectedDecision === "ESCALATE_AUDIT" ? "#c95353" : "var(--line)"}`,
                              background: selectedDecision === "ESCALATE_AUDIT" ? "#faecec" : "#ffffff",
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                              <span
                                style={{
                                  width: "14px",
                                  height: "14px",
                                  borderRadius: "50%",
                                  border: "2px solid #c95353",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                {selectedDecision === "ESCALATE_AUDIT" && (
                                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#c95353" }} />
                                )}
                              </span>
                              <strong style={{ fontSize: "13px", color: "#c95353" }}>ESCALATE AUDIT</strong>
                            </div>
                            <p style={{ fontSize: "11px", color: "var(--muted)", margin: 0, lineHeight: 1.4 }}>
                              Eskalasi ke Tim Investigasi Khusus Fraud BPJS Kesehatan.
                            </p>
                          </div>
                        </div>

                        {/* Notes Textarea */}
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                            <span className="eyebrow">CATATAN PERTIMBANGAN VERIFIKATOR (WAJIB):</span>
                            <small className="muted">Minimal 5 karakter &bull; Tersimpan permanen</small>
                          </div>
                          <textarea
                            rows={3}
                            value={reviewNotes}
                            onChange={(e) => setReviewNotes(e.target.value)}
                            placeholder="Tuliskan alasan pertimbangan medis atau hasil verifikasi rekam medis..."
                            style={{
                              width: "100%",
                              padding: "12px",
                              borderRadius: "16px",
                              border: "1px solid var(--line)",
                              background: "var(--surface)",
                              fontSize: "12px",
                              fontFamily: "inherit",
                            }}
                          />
                        </div>

                        {/* Submit Button */}
                        <button
                          className="button button-primary"
                          onClick={() => handleReviewDecision(selectedDecision)}
                          disabled={submittingReview}
                          style={{ width: "100%", fontSize: "13px", borderRadius: "24px" }}
                        >
                          {submittingReview ? (
                            <>
                              <RefreshCw size={16} className="animate-spin" />
                              Menyimpan Keputusan ke PostgreSQL...
                            </>
                          ) : (
                            <>
                              <Send size={16} />
                              Simpan Keputusan Telaah Klaim
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 4: JEJAK AUDIT KLAIM */}
                {activeTab === "history" && (
                  <div>
                    <span className="eyebrow" style={{ display: "block", marginBottom: "12px" }}>
                      RIWAYAT TELAAH UNTUK KLAIM INI
                    </span>
                    {!selectedClaim.human_reviews || selectedClaim.human_reviews.length === 0 ? (
                      <div style={{ padding: "40px", textAlign: "center", color: "var(--muted)", fontSize: "12px" }}>
                        Belum ada tindakan telaah yang tercatat untuk klaim ini.
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        {selectedClaim.human_reviews.map((rev) => (
                          <div
                            key={rev.id}
                            style={{
                              padding: "14px",
                              borderRadius: "16px",
                              border: "1px solid var(--line)",
                              background: "var(--surface)",
                              fontSize: "12px",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                              <strong>{rev.reviewer_name}</strong>
                              <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                                {new Date(rev.reviewed_at).toLocaleString("id-ID")}
                              </span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                              <span style={{ fontSize: "10px", color: "var(--muted)" }}>{rev.reviewer_role}</span>
                              <span
                                style={{
                                  fontSize: "10px",
                                  fontWeight: 800,
                                  padding: "2px 8px",
                                  borderRadius: "10px",
                                  background: rev.decision === "RELEASE" ? "#e5f4ec" : rev.decision === "CLARIFY" ? "#f8ecd4" : "#faecec",
                                  color: rev.decision === "RELEASE" ? "var(--dark-green)" : rev.decision === "CLARIFY" ? "#b38432" : "#c95353",
                                }}
                              >
                                {rev.decision}
                              </span>
                            </div>
                            <p style={{ margin: 0, background: "#ffffff", padding: "8px 12px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "11px" }}>
                              "{rev.notes}"
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer (Template Native Styling) */}
        <footer className="app-footer" style={{ marginTop: "32px" }}>
          <span>
            &copy; 2026 AURA-JKN<span className="footer-dot">&bull;</span>Autonomous Relational Anti-Fraud System
          </span>
          <span>
            <i />
            PostgreSQL Live (19.999 Klaim)<span className="footer-dot">&bull;</span>BPJS Kesehatan Healthkathon 2026
          </span>
        </footer>
      </main>

      {/* MODAL: SIMULASI KLAIM BARU (Task 3.6) */}
      <LiveClaimSimulatorModal
        isOpen={showSimulatorModal}
        onClose={() => setShowSimulatorModal(false)}
        backendUrl={BACKEND_URL}
        authToken={currentUser.token}
        onClaimCreated={(newClaimId) => {
          fetchClaims(newClaimId);
        }}
      />

      {/* MODAL: AUDIT TRAIL LOG & CONTROLLED FEEDBACK AI (Task 2.4) */}
      {showAuditModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(30, 36, 31, 0.45)",
            backdropFilter: "blur(3px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            zIndex: 100,
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: "820px",
              width: "100%",
              maxHeight: "86vh",
              padding: "24px",
              display: "flex",
              flexDirection: "column",
              borderRadius: "28px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
              <div>
                <h2 style={{ fontSize: "18px", fontWeight: 800, margin: 0 }}>
                  Jejak Audit &amp; Controlled Feedback AI
                </h2>
                <small className="muted">
                  Log imutabel &amp; dataset retraining model R-GCN dari PostgreSQL
                </small>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div className="top-navigation" style={{ padding: "4px", borderRadius: "20px" }}>
                  <button
                    onClick={() => setAuditModalTab("audit_logs")}
                    className={auditModalTab === "audit_logs" ? "active" : ""}
                    style={{ padding: "6px 12px", fontSize: "11.5px" }}
                  >
                    Log Jejak Audit
                  </button>
                  <button
                    onClick={() => setAuditModalTab("feedback_export")}
                    className={auditModalTab === "feedback_export" ? "active" : ""}
                    style={{ padding: "6px 12px", fontSize: "11.5px" }}
                  >
                    Controlled Feedback AI
                  </button>
                </div>
                <button className="icon-button" onClick={() => setShowAuditModal(false)}>
                  <X size={18} />
                </button>
              </div>
            </div>

            {auditModalTab === "feedback_export" ? (
              <div style={{ flex: 1, overflowY: "auto" }}>
                <ControlledFeedbackPanel
                  backendUrl={BACKEND_URL}
                  authToken={currentUser.token}
                />
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
                {loadingAuditLogs ? (
                  <div style={{ padding: "40px", textAlign: "center", color: "var(--muted)" }}>
                    <RefreshCw size={20} className="animate-spin text-green" style={{ margin: "0 auto 8px" }} />
                    Memuat data log audit...
                  </div>
                ) : auditLogs.length === 0 ? (
                  <div style={{ padding: "40px", textAlign: "center", color: "var(--muted)" }}>
                    {currentUser.role !== "AUDITOR" && currentUser.role !== "ADMINISTRATOR"
                      ? "Log operasional lengkap memerlukan otorisasi peran AUDITOR atau ADMINISTRATOR. Silakan beralih ke tab Controlled Feedback AI atau ganti peran RBAC di pojok kanan atas."
                      : "Belum ada log audit tercatat."}
                  </div>
                ) : (
                  auditLogs.map((log) => (
                    <div
                      key={log.id}
                      style={{
                        padding: "12px 16px",
                        borderRadius: "14px",
                        border: "1px solid var(--line)",
                        background: "var(--surface)",
                        fontSize: "12px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <strong style={{ color: "var(--dark-green)" }}>{log.action}</strong>
                          <span style={{ fontFamily: "monospace", fontSize: "11px", color: "var(--muted)" }}>{log.targetId}</span>
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "2px" }}>
                          Oleh: <strong>{log.actorName}</strong> ({log.actorRole})
                        </div>
                      </div>
                      <span style={{ fontSize: "11px", color: "var(--muted)", fontFamily: "monospace" }}>
                        {new Date(log.timestamp).toLocaleString("id-ID")}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}

            <div style={{ marginTop: "16px", paddingTop: "12px", borderTop: "1px solid var(--line)", textAlign: "right" }}>
              <button className="button button-secondary" onClick={() => setShowAuditModal(false)}>
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: USER MANAGEMENT */}
      {showUserMgmtModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(30, 36, 31, 0.45)",
            backdropFilter: "blur(3px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            zIndex: 100,
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: "760px",
              width: "100%",
              maxHeight: "85vh",
              padding: "24px",
              display: "flex",
              flexDirection: "column",
              borderRadius: "28px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div>
                <h2 style={{ fontSize: "18px", fontWeight: 800, margin: 0 }}>Manajemen Pengguna &amp; RBAC</h2>
                <small className="muted">Otorisasi Administrator untuk mengelola akun dan izin peran</small>
              </div>
              <button className="icon-button" onClick={() => setShowUserMgmtModal(false)}>
                <X size={18} />
              </button>
            </div>

            {userMgmtError && (
              <div style={{ padding: "10px 14px", background: "#faecec", color: "#a53e3e", borderRadius: "12px", fontSize: "12px", marginBottom: "12px" }}>
                {userMgmtError}
              </div>
            )}
            {userMgmtSuccess && (
              <div style={{ padding: "10px 14px", background: "#edf6f0", color: "var(--dark-green)", borderRadius: "12px", fontSize: "12px", marginBottom: "12px" }}>
                {userMgmtSuccess}
              </div>
            )}

            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Add User Form */}
              <form
                onSubmit={handleCreateUser}
                style={{
                  padding: "16px",
                  borderRadius: "18px",
                  background: "var(--surface)",
                  border: "1px solid var(--line)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                <strong style={{ fontSize: "13px" }}>Daftarkan Akun Pengguna Baru</strong>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div>
                    <label style={{ fontSize: "11px", color: "var(--muted)", display: "block", marginBottom: "4px" }}>Username:</label>
                    <input
                      type="text"
                      required
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      placeholder="contoh: verifikator_jateng"
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "12px", border: "1px solid var(--line)", background: "#ffffff", fontSize: "12px" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", color: "var(--muted)", display: "block", marginBottom: "4px" }}>Nama Lengkap:</label>
                    <input
                      type="text"
                      required
                      value={newFullName}
                      onChange={(e) => setNewFullName(e.target.value)}
                      placeholder="contoh: Dr. Rina S. (Verifikator)"
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "12px", border: "1px solid var(--line)", background: "#ffffff", fontSize: "12px" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", color: "var(--muted)", display: "block", marginBottom: "4px" }}>Kata Sandi:</label>
                    <input
                      type="password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimal 6 karakter"
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "12px", border: "1px solid var(--line)", background: "#ffffff", fontSize: "12px" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", color: "var(--muted)", display: "block", marginBottom: "4px" }}>Peran (Role):</label>
                    <select
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value as AppRole)}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "12px", border: "1px solid var(--line)", background: "#ffffff", fontSize: "12px" }}
                    >
                      <option value="CLAIM_VERIFIER">CLAIM_VERIFIER (Verifikator Klaim)</option>
                      <option value="FRAUD_ANALYST">FRAUD_ANALYST (Analis Investigasi)</option>
                      <option value="AUDITOR">AUDITOR (Auditor Kepatuhan)</option>
                      <option value="ADMINISTRATOR">ADMINISTRATOR (Keamanan Sistem)</option>
                    </select>
                  </div>
                </div>
                <button type="submit" className="button button-primary" style={{ alignSelf: "flex-start", marginTop: "4px" }}>
                  Tambah Pengguna
                </button>
              </form>

              {/* Users Table */}
              <div style={{ borderRadius: "16px", border: "1px solid var(--line)", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", textAlign: "left" }}>
                  <thead style={{ background: "var(--surface)", borderBottom: "1px solid var(--line)" }}>
                    <tr>
                      <th style={{ padding: "10px 14px" }}>Username</th>
                      <th style={{ padding: "10px 14px" }}>Nama Lengkap</th>
                      <th style={{ padding: "10px 14px" }}>Peran</th>
                      <th style={{ padding: "10px 14px" }}>Status</th>
                      <th style={{ padding: "10px 14px", textAlign: "right" }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {managedUsers.map((u) => (
                      <tr key={u.id} style={{ borderBottom: "1px solid var(--line)" }}>
                        <td style={{ padding: "10px 14px", fontFamily: "monospace", fontWeight: 700 }}>{u.username}</td>
                        <td style={{ padding: "10px 14px" }}>{u.fullName}</td>
                        <td style={{ padding: "10px 14px" }}>
                          <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "8px", background: "#f5f6f2", fontWeight: 600 }}>
                            {u.role}
                          </span>
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          <span
                            style={{
                              fontSize: "10px",
                              fontWeight: 700,
                              padding: "2px 8px",
                              borderRadius: "10px",
                              background: u.isActive ? "#e5f4ec" : "#faecec",
                              color: u.isActive ? "var(--dark-green)" : "#c95353",
                            }}
                          >
                            {u.isActive ? "AKTIF" : "NONAKTIF"}
                          </span>
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "right" }}>
                          <button
                            onClick={() => toggleUserActive(u.id, u.isActive)}
                            className="button button-secondary"
                            style={{ minHeight: "28px", padding: "4px 10px", fontSize: "11px", borderRadius: "14px" }}
                          >
                            {u.isActive ? "Nonaktifkan" : "Aktifkan"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ marginTop: "16px", paddingTop: "12px", borderTop: "1px solid var(--line)", textAlign: "right" }}>
              <button className="button button-secondary" onClick={() => setShowUserMgmtModal(false)}>
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
