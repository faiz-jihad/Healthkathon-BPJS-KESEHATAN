import React, { useState, useEffect, useCallback } from "react";
import {
  ShieldAlert, ShieldCheck, Activity, FileText, CheckCircle2,
  AlertTriangle, XCircle, Search, Filter, RefreshCw, UserCog,
  Eye, Clock, Building2, User, Stethoscope, MapPin, Calendar,
  Layers, Network, Database, Lock, ChevronRight, Info,
  SlidersHorizontal, ArrowUpRight, Send, HelpCircle, Hash,
  Scale, History, UserCheck, X, LayoutGrid, Bell, Users,
  ChevronDown, CircleCheck, PlusCircle, BarChart3, TrendingUp,
  Inbox, ClipboardList, FolderOpen, GitBranch, Settings,
  AlertCircle, CheckSquare, Hourglass, ArrowRight, Zap,
  BookOpen, Target, Award, Download
} from "lucide-react";
import { ClaimRecord, ClaimsListResponse } from "./types/aura";
import { SubgraphViewer } from "./components/SubgraphViewer";
import { LiveClaimSimulatorModal } from "./components/LiveClaimSimulatorModal";
import { ControlledFeedbackPanel } from "./components/ControlledFeedbackPanel";

const BACKEND_URL =
  typeof import.meta.env.VITE_BACKEND_URL === "string" && import.meta.env.VITE_BACKEND_URL !== ""
    ? import.meta.env.VITE_BACKEND_URL
    : import.meta.env.DEV ? "http://localhost:3001" : "";

// ============================================================
// TYPES
// ============================================================

type AppRole = "ADMINISTRATOR" | "VERIFIKATOR" | "INVESTIGATOR" | "SUPERVISOR" | "DATA_ANALYST";
// Legacy aliases still supported via backend normalization
type LegacyRole = "FRAUD_ANALYST" | "CLAIM_VERIFIER" | "AUDITOR";

type NavSection = "overview" | "investigation" | "data_intelligence" | "reports" | "administration";
type InvestigationView = "queue" | "my_cases" | "case_detail" | "evidence_center" | "alert_explorer" | "graph";
type DataView = "ingestion" | "quality" | "alert_explorer" | "model_eval";
type ReportsView = "outcomes" | "performance" | "model" | "audit";
type AdminView = "users" | "health" | "audit_trail";

interface CurrentUser {
  id: string; username: string; fullName: string; role: AppRole; token: string;
}

interface AuditLogItem {
  id: string; actorName: string; actorRole: string; action: string;
  targetId: string; payload: any; timestamp: string;
}

interface ManagedUser {
  id: string; username: string; fullName: string; role: AppRole;
  isActive: boolean; createdAt: string;
}

interface CaseItem {
  id: string; case_number: string; claim_id: string; status: string;
  priority: string; priority_score: number; priority_reasons: string[];
  assigned_to: string | null; wait_hours: number | null; sla_breached: boolean | null;
  created_at: string; claim_summary: any; recent_transitions: any[];
  available_actions: Array<{ action: string; to_status: string; description: string }>;
}

interface PerformanceData {
  investigation: any; alert_quality: any; evidence: any;
  data_quality: any; model: any; audit_trail: any; ingestion: any;
}

// ============================================================
// HELPERS
// ============================================================

const ROLE_CONFIG: Record<string, { label: string; color: string; bg: string; description: string }> = {
  ADMINISTRATOR: { label: "Administrator Sistem", color: "#7c3aed", bg: "#f3e8ff", description: "Kelola akun & sistem" },
  VERIFIKATOR:   { label: "Verifikator",          color: "#0284c7", bg: "#e0f2fe", description: "Tinjau & catat pemeriksaan" },
  INVESTIGATOR:  { label: "Investigator",          color: "#d97706", bg: "#fef3c7", description: "Investigasi & susun temuan" },
  SUPERVISOR:    { label: "Supervisor",            color: "#059669", bg: "#d1fae5", description: "Pantau antrean & eskalasi" },
  DATA_ANALYST:  { label: "Data/AI Analyst",       color: "#db2777", bg: "#fce7f3", description: "Kualitas data & model AI" },
  // Legacy
  FRAUD_ANALYST: { label: "Investigator",          color: "#d97706", bg: "#fef3c7", description: "Investigasi" },
  CLAIM_VERIFIER:{ label: "Verifikator",           color: "#0284c7", bg: "#e0f2fe", description: "Verifikasi" },
  AUDITOR:       { label: "Data/AI Analyst",       color: "#db2777", bg: "#fce7f3", description: "Analitik" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  NEW:               { label: "Baru", color: "#64748b", bg: "#f1f5f9", icon: <Inbox size={12}/> },
  FLAGGED_FOR_REVIEW:{ label: "Menunggu Review", color: "#d97706", bg: "#fef3c7", icon: <AlertTriangle size={12}/> },
  UNDER_REVIEW:      { label: "Sedang Ditinjau", color: "#0284c7", bg: "#e0f2fe", icon: <Eye size={12}/> },
  AWAITING_EVIDENCE: { label: "Menunggu Bukti", color: "#7c3aed", bg: "#f3e8ff", icon: <HelpCircle size={12}/> },
  ESCALATED:         { label: "Dieskalasi", color: "#dc2626", bg: "#fee2e2", icon: <ArrowUpRight size={12}/> },
  RESOLVED:          { label: "Selesai", color: "#059669", bg: "#d1fae5", icon: <CheckCircle2 size={12}/> },
  CLOSED:            { label: "Ditutup", color: "#6b7280", bg: "#f3f4f6", icon: <Lock size={12}/> },
};

const PRIORITY_CONFIG: Record<string, { color: string; bg: string; dot: string }> = {
  HIGH:   { color: "#dc2626", bg: "#fee2e2", dot: "#dc2626" },
  MEDIUM: { color: "#d97706", bg: "#fef3c7", dot: "#d97706" },
  LOW:    { color: "#059669", bg: "#d1fae5", dot: "#059669" },
};

const OUTCOME_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  REFERRED_FOR_ACTION:   { label: "Direkomendasikan Tindakan Lanjut", color: "#dc2626", bg: "#fee2e2" },
  CLEARED:               { label: "Klaim Terverifikasi Sah (Cleared)", color: "#059669", bg: "#d1fae5" },
  INSUFFICIENT_EVIDENCE: { label: "Bukti Belum Memadai", color: "#d97706", bg: "#fef3c7" },
  CLOSED_ADMINISTRATIVE: { label: "Ditutup Administratif", color: "#64748b", bg: "#f1f5f9" },
};

function formatIDR(num: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(num);
}

function formatDate(d: string | null | undefined) {
  if (!d) return "-";
  return new Date(d).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" });
}

function hasPermission(role: string, perms: string[]): boolean {
  const map: Record<string, string[]> = {
    ADMINISTRATOR: ["all"],
    SUPERVISOR:    ["view_all_cases", "view_performance", "assign", "close", "approve_escalation", "view_audit"],
    INVESTIGATOR:  ["investigate", "start_review", "escalate", "resolve", "record_finding"],
    VERIFIKATOR:   ["start_review", "record_decision", "request_evidence", "escalate"],
    DATA_ANALYST:  ["view_data", "view_model", "view_performance", "export", "view_audit"],
    // legacy
    FRAUD_ANALYST: ["investigate", "start_review", "escalate", "resolve", "record_finding"],
    CLAIM_VERIFIER:["start_review", "record_decision", "request_evidence", "escalate"],
    AUDITOR:       ["view_data", "view_model", "view_performance", "export", "view_audit"],
  };
  const rolePerms = map[role] || [];
  if (rolePerms.includes("all")) return true;
  return perms.some(p => rolePerms.includes(p));
}

// ============================================================
// MAIN APP
// ============================================================

export function App() {
  // Auth state
  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    id: "usr_verifier_001", username: "verifier_aura",
    fullName: "Verifikator Pra-Pembayaran BPJS", role: "VERIFIKATOR", token: "",
  });

  // Navigation state
  const [activeSection, setActiveSection] = useState<NavSection>("overview");
  const [investigationView, setInvestigationView] = useState<InvestigationView>("queue");
  const [dataView, setDataView] = useState<DataView>("ingestion");
  const [reportsView, setReportsView] = useState<ReportsView>("performance");
  const [adminView, setAdminView] = useState<AdminView>("users");

  // Claims data & advanced filters
  const [data, setData] = useState<ClaimsListResponse | null>(null);
  const [selectedClaim, setSelectedClaim] = useState<ClaimRecord | null>(null);
  const [riskFilter, setRiskFilter] = useState<string>("ALL");
  const [scenarioFilter, setScenarioFilter] = useState<string>("ALL");
  const [reviewStatusFilter, setReviewStatusFilter] = useState<string>("ALL");
  const [gateFilter, setGateFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("fri_desc");
  const [loading, setLoading] = useState<boolean>(true);
  const [dataSourceError, setDataSourceError] = useState<string | null>(null);

  // Cases/Investigation queue
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [casesLoading, setCasesLoading] = useState(false);
  const [selectedCase, setSelectedCase] = useState<CaseItem | null>(null);
  const [caseDetail, setCaseDetail] = useState<any>(null);
  const [caseDetailLoading, setCaseDetailLoading] = useState(false);
  const [caseStatusFilter, setCaseStatusFilter] = useState("ALL");
  const [casePriorityFilter, setCasePriorityFilter] = useState("ALL");
  const [caseSearchQuery, setCaseSearchQuery] = useState("");
  const [caseSortBy, setCaseSortBy] = useState("priority_desc");
  const [caseQueueSummary, setCaseQueueSummary] = useState<Record<string, number>>({});
  const [caseAction, setCaseAction] = useState("");
  const [caseOutcome, setCaseOutcome] = useState("REFERRED_FOR_ACTION");
  const [caseNotes, setCaseNotes] = useState("");
  const [assignTargetUser, setAssignTargetUser] = useState("investigator_aura");
  const [assignTargetRole, setAssignTargetRole] = useState("INVESTIGATOR");
  const [caseActionLoading, setCaseActionLoading] = useState(false);
  const [caseActionResult, setCaseActionResult] = useState<{ success: boolean; message: string } | null>(null);

  // Performance dashboard
  const [perfData, setPerfData] = useState<PerformanceData | null>(null);
  const [perfLoading, setPerfLoading] = useState(false);

  // Ingestion history
  const [ingestionData, setIngestionData] = useState<any>(null);
  const [ingestionLoading, setIngestionLoading] = useState(false);

  // Audit logs
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditSearchQuery, setAuditSearchQuery] = useState("");
  const [auditActionFilter, setAuditActionFilter] = useState("ALL");

  // Users management
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<AppRole>("VERIFIKATOR");
  const [userMgmtError, setUserMgmtError] = useState<string | null>(null);
  const [userMgmtSuccess, setUserMgmtSuccess] = useState<string | null>(null);

  // Review state
  const [selectedDecision, setSelectedDecision] = useState<"RELEASE" | "CLARIFY" | "ESCALATE_AUDIT">("RELEASE");
  const [reviewNotes, setReviewNotes] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewBanner, setReviewBanner] = useState<{ success: boolean; message: string } | null>(null);

  // Modals
  const [showSimulatorModal, setShowSimulatorModal] = useState(false);
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);

  // Health status
  const [healthStatus, setHealthStatus] = useState<any>(null);

  const authHeaders = useCallback(() => ({
    "Content-Type": "application/json",
    ...(currentUser.token ? { Authorization: `Bearer ${currentUser.token}` } : {}),
    "x-reviewer-role": currentUser.role,
    "x-reviewer-name": currentUser.fullName,
    "x-demo-role": currentUser.role,
  }), [currentUser.token, currentUser.role, currentUser.fullName]);

  // ============================================================
  // API FUNCTIONS
  // ============================================================

  const switchRole = async (targetRole: AppRole) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/demo-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: targetRole }),
      });
      if (res.ok) {
        const json = await res.json();
        setCurrentUser({ id: json.user.id, username: json.user.username, fullName: json.user.fullName, role: json.user.role, token: json.token });
      }
    } catch {
      const cfg = ROLE_CONFIG[targetRole];
      setCurrentUser(prev => ({ ...prev, role: targetRole, fullName: cfg?.label || targetRole }));
    }
    setRoleMenuOpen(false);
  };

  const fetchClaims = useCallback(async () => {
    setLoading(true);
    setDataSourceError(null);
    try {
      const params = new URLSearchParams();
      if (riskFilter !== "ALL") params.set("risk_level", riskFilter);
      if (scenarioFilter !== "ALL") params.set("scenario", scenarioFilter);
      if (reviewStatusFilter !== "ALL") params.set("review_status", reviewStatusFilter);
      if (gateFilter !== "ALL") params.set("pre_payment_gate", gateFilter);
      if (sortBy) params.set("sort_by", sortBy);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      params.set("limit", "200");
      const res = await fetch(`${BACKEND_URL}/api/claims?${params}`, { headers: authHeaders() });
      const json = await res.json();
      if (!res.ok || json.status === "DATA_SOURCE_UNAVAILABLE") {
        setDataSourceError(json.error || "Database tidak dapat dihubungi. Sesuai Zero Mock Policy, data tiruan tidak ditampilkan.");
        setData(null); return;
      }
      setData(json);
      if (json.claims?.length > 0 && !selectedClaim) setSelectedClaim(json.claims[0]);
    } catch (err: any) {
      setDataSourceError("Koneksi ke API Gateway Backend gagal. Pastikan layanan aktif.");
      setData(null);
    } finally { setLoading(false); }
  }, [riskFilter, scenarioFilter, reviewStatusFilter, gateFilter, sortBy, searchQuery, authHeaders]);

  const fetchCases = useCallback(async () => {
    setCasesLoading(true);
    try {
      const params = new URLSearchParams();
      if (caseStatusFilter !== "ALL") params.set("status", caseStatusFilter);
      if (casePriorityFilter !== "ALL") params.set("priority", casePriorityFilter);
      if (caseSearchQuery.trim()) params.set("search", caseSearchQuery.trim());
      if (caseSortBy) params.set("sort_by", caseSortBy);
      if (investigationView === "my_cases") {
        params.set("assigned_to", currentUser.username);
      }
      const res = await fetch(`${BACKEND_URL}/api/cases?${params}&limit=50`, { headers: authHeaders() });
      if (res.ok) {
        const json = await res.json();
        setCases(json.cases || []);
        setCaseQueueSummary(json.queue_summary || {});
      }
    } catch {} finally { setCasesLoading(false); }
  }, [caseStatusFilter, casePriorityFilter, caseSearchQuery, caseSortBy, investigationView, currentUser.username, authHeaders]);

  const fetchCaseDetail = async (caseId: string) => {
    setCaseDetailLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/cases/${caseId}`, { headers: authHeaders() });
      if (res.ok) { const json = await res.json(); setCaseDetail(json.evidence_center); }
    } catch {} finally { setCaseDetailLoading(false); }
  };

  const fetchPerformance = async () => {
    setPerfLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/dashboard/performance?period_days=30`, { headers: authHeaders() });
      if (res.ok) { const json = await res.json(); setPerfData(json); }
    } catch {} finally { setPerfLoading(false); }
  };

  const fetchIngestion = async () => {
    setIngestionLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/ingestion/history`, { headers: authHeaders() });
      if (res.ok) { const json = await res.json(); setIngestionData(json); }
    } catch {} finally { setIngestionLoading(false); }
  };

  const fetchAuditLogs = useCallback(async () => {
    setAuditLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "100");
      if (auditActionFilter !== "ALL") params.set("action", auditActionFilter);
      if (auditSearchQuery.trim()) params.set("search", auditSearchQuery.trim());
      const res = await fetch(`${BACKEND_URL}/api/audit-logs?${params}`, { headers: authHeaders() });
      if (res.ok) {
        const json = await res.json();
        setAuditLogs(
          (json.logs || []).map((l: any) => ({
            ...l,
            payload: l.metadata || l.payload || {},
            timestamp: l.recordedAt || l.timestamp,
          }))
        );
      }
    } catch {} finally { setAuditLoading(false); }
  }, [auditActionFilter, auditSearchQuery, authHeaders]);

  const exportCasesCsv = async () => {
    try {
      const params = new URLSearchParams();
      params.set("format", "csv");
      if (caseStatusFilter !== "ALL") params.set("status", caseStatusFilter);
      if (casePriorityFilter !== "ALL") params.set("priority", casePriorityFilter);
      if (caseSearchQuery.trim()) params.set("search", caseSearchQuery.trim());
      const res = await fetch(`${BACKEND_URL}/api/cases?${params}`, { headers: authHeaders() });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "aura_jkn_cases_report.csv";
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch {}
  };

  const exportAuditCsv = async () => {
    try {
      const params = new URLSearchParams();
      params.set("format", "csv");
      if (auditActionFilter !== "ALL") params.set("action", auditActionFilter);
      if (auditSearchQuery.trim()) params.set("search", auditSearchQuery.trim());
      const res = await fetch(`${BACKEND_URL}/api/audit-logs?${params}`, { headers: authHeaders() });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "aura_jkn_audit_trail_report.csv";
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch {}
  };

  const fetchUsers = async () => {
    setUsersLoading(true);
    setUserMgmtError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/users`, { headers: authHeaders() });
      const json = await res.json();
      if (res.ok && json.users) setManagedUsers(json.users);
      else setUserMgmtError(json.error || "Gagal memuat pengguna.");
    } catch { setUserMgmtError("Koneksi gagal."); } finally { setUsersLoading(false); }
  };

  const fetchHealth = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/health`);
      if (res.ok) { const json = await res.json(); setHealthStatus(json); }
    } catch {}
  };

  const performCaseAction = async () => {
    if (!selectedCase || !caseAction) return;
    setCaseActionLoading(true);
    setCaseActionResult(null);
    try {
      const payload: any = { action: caseAction, notes: caseNotes };
      if (caseAction === "TRANSITION_TO_RESOLVED") {
        payload.outcome = caseOutcome;
      }
      const res = await fetch(`${BACKEND_URL}/api/cases/${selectedCase.id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.ok) {
        setCaseActionResult({ success: true, message: `Berhasil: ${json.from_status} → ${json.to_status}` });
        setCaseNotes(""); setCaseAction("");
        await fetchCases();
        await fetchCaseDetail(selectedCase.id);
      } else {
        setCaseActionResult({ success: false, message: json.error || "Aksi gagal dijalankan." });
      }
    } catch (e: any) {
      setCaseActionResult({ success: false, message: `Koneksi gagal: ${e.message}` });
    } finally { setCaseActionLoading(false); }
  };

  const handleAssignCase = async () => {
    if (!selectedCase || !assignTargetUser.trim()) return;
    setCaseActionLoading(true);
    setCaseActionResult(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/cases/${selectedCase.id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({
          action: "ASSIGN_CASE",
          assigned_to: assignTargetUser.trim(),
          assigned_role: assignTargetRole,
          notes: caseNotes.trim() || `Penugasan kasus oleh ${currentUser.fullName}`,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setCaseActionResult({
          success: true,
          message: `Kasus berhasil ditugaskan kepada ${json.assigned_to} (${json.assigned_role}).`,
        });
        await fetchCases();
        await fetchCaseDetail(selectedCase.id);
      } else {
        setCaseActionResult({ success: false, message: json.error || "Gagal menugaskan kasus." });
      }
    } catch (e: any) {
      setCaseActionResult({ success: false, message: `Koneksi gagal: ${e.message}` });
    } finally {
      setCaseActionLoading(false);
    }
  };

  const createCaseFromClaim = async (claimId: string) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/cases`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ claim_id: claimId }),
      });
      const json = await res.json();
      if (res.ok) {
        setReviewBanner({ success: true, message: `Kasus ${json.case_number} berhasil dibuat dari klaim ${claimId}` });
        setTimeout(() => setActiveSection("investigation"), 1500);
      } else {
        setReviewBanner({ success: false, message: json.error || "Gagal membuat kasus." });
      }
    } catch (e: any) {
      setReviewBanner({ success: false, message: `Koneksi gagal: ${e.message}` });
    }
  };

  const handleReviewDecision = async (decision: "RELEASE" | "CLARIFY" | "ESCALATE_AUDIT") => {
    if (!selectedClaim) return;
    setSubmittingReview(true);
    setReviewBanner(null);
    const notes = reviewNotes.trim() || `Keputusan ${decision} oleh ${currentUser.fullName} melalui AURA-JKN.`;
    try {
      const res = await fetch(`${BACKEND_URL}/api/claims/${selectedClaim.claim_id}/review`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ decision, notes }),
      });
      const json = await res.json();
      if (res.ok && json.status === "REVIEW_SAVED") {
        setReviewNotes("");
        setReviewBanner({ success: true, message: `Keputusan [${decision}] untuk klaim ${selectedClaim.claim_id} tersimpan ke PostgreSQL & Audit Log.` });
        await fetchClaims();
      } else {
        setReviewBanner({ success: false, message: `Gagal: ${json.error || "Transaksi dibatalkan."}` });
      }
    } catch (e: any) {
      setReviewBanner({ success: false, message: `Kegagalan jaringan: ${e?.message}` });
    } finally { setSubmittingReview(false); }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserMgmtError(null); setUserMgmtSuccess(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/users`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ username: newUsername, fullName: newFullName, password: newPassword, role: newRole }),
      });
      const json = await res.json();
      if (res.ok) { setUserMgmtSuccess(`Pengguna '${newUsername}' berhasil didaftarkan!`); setNewUsername(""); setNewFullName(""); setNewPassword(""); fetchUsers(); }
      else setUserMgmtError(json.error || "Gagal mendaftarkan pengguna.");
    } catch { setUserMgmtError("Galat jaringan."); }
  };

  const toggleUserActive = async (userId: string, cur: boolean) => {
    try {
      await fetch(`${BACKEND_URL}/api/admin/users/${userId}`, {
        method: "PATCH", headers: authHeaders(), body: JSON.stringify({ isActive: !cur }),
      });
      fetchUsers();
    } catch {}
  };

  // ============================================================
  // EFFECTS
  // ============================================================

  useEffect(() => { switchRole("VERIFIKATOR"); }, []);
  useEffect(() => { fetchClaims(); }, [riskFilter, scenarioFilter, reviewStatusFilter, gateFilter, sortBy, currentUser.token]);
  useEffect(() => { if (activeSection === "investigation") fetchCases(); }, [activeSection, investigationView, caseStatusFilter, casePriorityFilter, caseSortBy, currentUser.token]);
  useEffect(() => { if (activeSection === "overview") { fetchPerformance(); fetchHealth(); fetchCases(); } }, [activeSection, currentUser.token]);
  useEffect(() => {
    if (activeSection === "data_intelligence") {
      if (dataView === "ingestion") fetchIngestion();
      if (dataView === "quality" || dataView === "model_eval") fetchPerformance();
    }
  }, [activeSection, dataView, currentUser.token]);
  useEffect(() => {
    if (activeSection === "reports") {
      if (reportsView === "performance" || reportsView === "outcomes" || reportsView === "model") fetchPerformance();
      if (reportsView === "audit") fetchAuditLogs();
    }
  }, [activeSection, reportsView, auditActionFilter, currentUser.token]);
  useEffect(() => { if (activeSection === "administration") { if (adminView === "users") fetchUsers(); if (adminView === "audit_trail") fetchAuditLogs(); if (adminView === "health") fetchHealth(); } }, [activeSection, adminView, auditActionFilter, currentUser.token]);
  useEffect(() => { if (selectedCase && investigationView === "evidence_center") fetchCaseDetail(selectedCase.id); }, [selectedCase, investigationView]);

  // ============================================================
  // RENDER HELPERS
  // ============================================================

  const rCfg = ROLE_CONFIG[currentUser.role] || ROLE_CONFIG.VERIFIKATOR;

  const isDbConnected = Boolean(
    healthStatus?.database?.connected === true || healthStatus?.database === "connected"
  );
  const isAiConnected = Boolean(
    healthStatus?.ai_engine?.connected === true || healthStatus?.ai_service === "connected"
  );

  const RoleBadge = ({ role }: { role: string }) => {
    const cfg = ROLE_CONFIG[role] || { label: role, color: "#64748b", bg: "#f1f5f9" };
    return <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "20px", background: cfg.bg, color: cfg.color }}>{cfg.label}</span>;
  };

  const StatusBadge = ({ status }: { status: string }) => {
    const cfg = STATUS_CONFIG[status] || { label: status, color: "#64748b", bg: "#f1f5f9", icon: null };
    return <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, padding: "3px 10px", borderRadius: "20px", background: cfg.bg, color: cfg.color }}>{cfg.icon}{cfg.label}</span>;
  };

  const PriorityBadge = ({ priority }: { priority: string }) => {
    const cfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.LOW;
    return <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "12px", background: cfg.bg, color: cfg.color }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.dot, display: "inline-block" }}/>{priority}
    </span>;
  };

  const MetricCard = ({ title, value, subtitle, color, icon }: { title: string; value: string | number | null; subtitle?: string; color?: string; icon: React.ReactNode }) => (
    <div className="card" style={{ padding: "18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
        <span className="eyebrow" style={{ color: color || undefined }}>{title}</span>
        <span style={{ color: color || "var(--green)", opacity: 0.8 }}>{icon}</span>
      </div>
      <div style={{ fontSize: "26px", fontWeight: 800, letterSpacing: "-1px", color: color || "inherit" }}>
        {value !== null && value !== undefined ? value : <span style={{ fontSize: "14px", color: "var(--muted)", fontWeight: 500 }}>Belum Tersedia</span>}
      </div>
      {subtitle && <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "6px" }}>{subtitle}</div>}
    </div>
  );

  const SectionHeader = ({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
      <div>
        <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 800 }}>{title}</h1>
        {subtitle && <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--muted)" }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );

  const EmptyState = ({ icon, message, sub }: { icon: React.ReactNode; message: string; sub?: string }) => (
    <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--muted)" }}>
      <div style={{ marginBottom: "12px", opacity: 0.4 }}>{icon}</div>
      <div style={{ fontWeight: 600, marginBottom: "6px" }}>{message}</div>
      {sub && <div style={{ fontSize: "12px" }}>{sub}</div>}
    </div>
  );

  const LoadingSpinner = () => (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "40px" }}>
      <RefreshCw size={24} className="animate-spin" style={{ color: "var(--green)" }} />
    </div>
  );

  const DataSourceBanner = ({ error }: { error: string }) => (
    <div className="card" style={{ background: "#faecec", borderColor: "#eec5c5", color: "#a53e3e", marginBottom: "16px", padding: "14px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", fontWeight: 700, fontSize: "13px" }}>
        <AlertTriangle size={16}/> Sumber Data Tidak Tersedia (Zero Mock Policy)
      </div>
      <p style={{ marginTop: "6px", fontSize: "12px", marginBottom: 0 }}>{error}</p>
    </div>
  );

  // ============================================================
  // SECTION: OVERVIEW
  // ============================================================

  const renderOverview = () => (
    <div>
      <SectionHeader
        title={`Selamat datang, ${currentUser.fullName.split(" ")[0]}.`}
        subtitle="Ringkasan operasional AURA-JKN — Evidence-Linked Relational Claim Intelligence Platform"
        action={
          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <div className="card" style={{ padding: "6px 14px", borderRadius: "30px", display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", fontWeight: 600 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: isDbConnected ? "var(--green)" : "#dc2626" }}/>
              {isDbConnected ? "PostgreSQL Terhubung" : "Periksa Status Layanan"}
            </div>
            <button className="button button-secondary" onClick={() => setShowSimulatorModal(true)}>
              <PlusCircle size={14}/> Simulasi Klaim Baru
            </button>
            <button className="button button-primary" onClick={() => { setActiveSection("investigation"); setInvestigationView("queue"); }}>
              <Inbox size={14}/> Buka Antrean
            </button>
          </div>
        }
      />

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "24px" }}>
        <MetricCard title="TOTAL KLAIM DATABASE" value={data?.summary.total_claims?.toLocaleString("id-ID") || "—"} subtitle={`Rata-rata FRI: ${data?.summary.avg_fri ?? "—"} • PostgreSQL Live`} icon={<Database size={18}/>}/>
        <MetricCard title="RISIKO TINGGI (FRI ≥ 70)" value={data?.summary.high_risk_count?.toLocaleString("id-ID") || "—"} subtitle="Perlu telaah prioritas" color="#dc2626" icon={<ShieldAlert size={18}/>}/>
        <MetricCard title="KASUS TERBUKA" value={perfData?.investigation?.open_cases ?? (caseQueueSummary.FLAGGED_FOR_REVIEW || 0)} subtitle="Antrean investigasi aktif" color="#d97706" icon={<ClipboardList size={18}/>}/>
        <MetricCard title="SELESAI DIINVESTIGASI" value={perfData?.investigation?.throughput_all_time ?? "—"} subtitle="Total kasus resolved + closed" color="#059669" icon={<CheckCircle2 size={18}/>}/>
      </div>

      {/* Second row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "24px" }}>
        <MetricCard title="TARIF KLAIM DITAHAN" value={data?.summary.held_tariff_idr ? formatIDR(data.summary.held_tariff_idr) : "—"} subtitle="Pre-payment gate: REJECT_FOR_HUMAN_REVIEW" color="#7c3aed" icon={<Scale size={18}/>}/>
        <MetricCard title="MEDIAN WAKTU INVESTIGASI" value={perfData?.investigation?.median_investigation_hours ? `${perfData.investigation.median_investigation_hours} jam` : null} subtitle="Dari review dimulai hingga selesai" icon={<Clock size={18}/>}/>
        <MetricCard title="KELENGKAPAN BUKTI" value={perfData?.evidence?.evidence_completeness_pct !== null && perfData?.evidence?.evidence_completeness_pct !== undefined ? `${perfData.evidence.evidence_completeness_pct}%` : null} subtitle="Kasus dengan minimal 1 catatan review" color="#0284c7" icon={<BookOpen size={18}/>}/>
        <MetricCard title="VERSI MODEL AI" value={perfData?.model?.current_version || "1.0.0"} subtitle={`R-GCN PyTorch Geometric • Inferensi terakhir: ${formatDate(perfData?.model?.last_inference)}`} color="#db2777" icon={<Zap size={18}/>}/>
      </div>

      {/* Data Source Badges */}
      {dataSourceError && <DataSourceBanner error={dataSourceError}/>}

      {/* Case Queue Preview */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        <div className="card" style={{ padding: "18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "14px" }}>
            <strong>Antrean Kasus</strong>
            <button className="button button-secondary" style={{ fontSize: "11px", padding: "4px 12px", minHeight: 0 }} onClick={() => { setActiveSection("investigation"); fetchCases(); }}>Lihat Semua →</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {Object.entries(STATUS_CONFIG).slice(0, 5).map(([status, cfg]) => (
              <div key={status} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: "10px", background: "#f9fafb" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
                  <span style={{ color: cfg.color }}>{cfg.icon}</span>{cfg.label}
                </div>
                <strong style={{ color: cfg.color }}>{caseQueueSummary[status] ?? "—"}</strong>
              </div>
            ))}
          </div>
        </div>

        {/* System Health */}
        <div className="card" style={{ padding: "18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "14px" }}>
            <strong>Status Layanan</strong>
            <button className="button button-secondary" style={{ fontSize: "11px", padding: "4px 12px", minHeight: 0 }} onClick={fetchHealth}><RefreshCw size={12}/></button>
          </div>
          {healthStatus ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {[
                { name: "PostgreSQL Database", status: isDbConnected ? "OK" : "ERROR" },
                { name: "AI Service (R-GCN FastAPI)", status: isAiConnected ? "OK" : "STANDBY" },
                { name: "Backend API Gateway", status: "OK" },
              ].map(svc => (
                <div key={svc.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: "10px", background: "#f9fafb" }}>
                  <span style={{ fontSize: "12px" }}>{svc.name}</span>
                  <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "10px", background: svc.status === "OK" ? "#d1fae5" : svc.status === "STANDBY" ? "#fef3c7" : "#fee2e2", color: svc.status === "OK" ? "#059669" : svc.status === "STANDBY" ? "#d97706" : "#dc2626" }}>{svc.status}</span>
                </div>
              ))}
              <div style={{ marginTop: "8px", padding: "10px 12px", borderRadius: "10px", background: "#f0fdf4", border: "1px solid #bbf7d0", fontSize: "11px", color: "#166534" }}>
                <strong>Zero Mock Data Policy Aktif</strong> — Semua data berasal dari PostgreSQL dan AI inference aktual. Kegagalan ditampilkan, bukan disembunyikan.
              </div>
            </div>
          ) : <LoadingSpinner/>}
        </div>
      </div>
    </div>
  );

  // ============================================================
  // SECTION: INVESTIGATION
  // ============================================================

  const renderInvestigationQueue = (onlyMine = false) => (
    <div>
      <SectionHeader
        title={onlyMine ? `Kasus Saya (${currentUser.username})` : "Antrean Investigasi"}
        subtitle={
          onlyMine
            ? "Daftar kasus investigasi yang ditugaskan langsung kepada akun Anda."
            : "Daftar kasus yang memerlukan pemeriksaan. Prioritas dihitung berdasarkan FRI, deteksi spasial, dan waktu tunggu."
        }
        action={
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }}/>
              <input value={caseSearchQuery} onChange={e => setCaseSearchQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && fetchCases()} placeholder="Cari nomor kasus, klaim, petugas…"
                style={{ padding: "6px 12px 6px 32px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "12px", width: "210px" }}/>
            </div>
            <select value={caseStatusFilter} onChange={e => setCaseStatusFilter(e.target.value)} style={{ padding: "6px 10px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "12px" }}>
              <option value="ALL">Semua Status</option>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={casePriorityFilter} onChange={e => setCasePriorityFilter(e.target.value)} style={{ padding: "6px 10px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "12px" }}>
              <option value="ALL">Semua Prioritas</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
            </select>
            <select value={caseSortBy} onChange={e => setCaseSortBy(e.target.value)} style={{ padding: "6px 10px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "12px" }}>
              <option value="priority_desc">Prioritas Tertinggi</option>
              <option value="sla_asc">SLA Terdekat</option>
              <option value="created_desc">Terbaru</option>
              <option value="created_asc">Terlama</option>
            </select>
            <button className="button button-secondary" onClick={exportCasesCsv} title="Unduh CSV Kasus">
              <Download size={14}/> CSV
            </button>
            <button className="button button-secondary" onClick={fetchCases} disabled={casesLoading}><RefreshCw size={14} className={casesLoading ? "animate-spin" : ""}/></button>
          </div>
        }
      />

      {/* Queue Stats */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
        {Object.entries(STATUS_CONFIG).map(([status, cfg]) => (
          <button key={status} onClick={() => setCaseStatusFilter(caseStatusFilter === status ? "ALL" : status)}
            style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 12px", borderRadius: "20px", border: `1px solid ${caseStatusFilter === status ? cfg.color : "var(--line)"}`, background: caseStatusFilter === status ? cfg.bg : "#fff", color: cfg.color, fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>
            {cfg.icon}<span>{cfg.label}</span><strong style={{ marginLeft: "4px" }}>{caseQueueSummary[status] ?? 0}</strong>
          </button>
        ))}
      </div>

      {casesLoading ? <LoadingSpinner/> : cases.length === 0 ? (
        <EmptyState
          icon={<Inbox size={48}/>}
          message={onlyMine ? "Belum ada kasus yang ditugaskan kepada Anda" : "Tidak ada kasus dalam antrean"}
          sub={onlyMine ? "Supervisor dapat menugaskan kasus kepada Anda melalui Evidence Center" : "Kasus baru akan muncul setelah klaim di-flag oleh sistem"}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {cases.map(c => (
            <div key={c.id} className="card" style={{ padding: "16px 18px", cursor: "pointer", border: selectedCase?.id === c.id ? "2px solid var(--green)" : "1px solid var(--line)" }}
              onClick={() => { setSelectedCase(c); setInvestigationView("evidence_center"); }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                    <span style={{ fontWeight: 700, fontSize: "13px", fontFamily: "monospace" }}>{c.case_number}</span>
                    <StatusBadge status={c.status}/>
                    <PriorityBadge priority={c.priority}/>
                    {c.sla_breached && <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "10px", background: "#fee2e2", color: "#dc2626" }}>⚠ SLA Terlampaui</span>}
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--muted)", display: "flex", gap: "16px", flexWrap: "wrap" }}>
                    <span>Klaim: <strong>{c.claim_id}</strong></span>
                    {c.claim_summary?.risk_level && <span>Risiko: <strong style={{ color: PRIORITY_CONFIG[c.claim_summary.risk_level]?.color }}>{c.claim_summary.risk_level}</strong></span>}
                    {c.claim_summary?.fraud_risk_index !== null && <span>FRI: <strong>{c.claim_summary.fraud_risk_index}</strong></span>}
                    {c.wait_hours !== null && <span>Menunggu: <strong>{c.wait_hours} jam</strong></span>}
                    {c.assigned_to && <span>Ditugaskan ke: <strong>{c.assigned_to}</strong></span>}
                  </div>
                  {c.priority_reasons.length > 0 && (
                    <div style={{ marginTop: "6px", fontSize: "11px", color: "#7c3aed" }}>
                      <strong>Alasan prioritas:</strong> {c.priority_reasons.join(" • ")}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <button className="button button-secondary" style={{ fontSize: "11px", padding: "4px 10px", minHeight: 0 }}
                    onClick={e => { e.stopPropagation(); setSelectedCase(c); setInvestigationView("evidence_center"); }}>
                    <Eye size={12}/> Detail
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderEvidenceCenter = () => {
    if (!selectedCase) return <EmptyState icon={<FolderOpen size={48}/>} message="Pilih kasus dari antrean" sub="Klik kasus untuk melihat Evidence Center"/>;
    const ec = caseDetail;

    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
          <button className="button button-secondary" style={{ fontSize: "11px", padding: "6px 12px", minHeight: 0 }} onClick={() => { setInvestigationView("queue"); setSelectedCase(null); setCaseDetail(null); }}>
            ← Kembali ke Antrean
          </button>
          <h1 style={{ margin: 0, fontSize: "18px", fontWeight: 800 }}>Evidence Center — {selectedCase.case_number}</h1>
          <StatusBadge status={ec?.case_summary?.status || selectedCase.status}/>
          <PriorityBadge priority={ec?.case_summary?.priority || selectedCase.priority}/>
        </div>

        {caseDetailLoading ? <LoadingSpinner/> : ec ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            {/* Ringkasan Kasus */}
            <div className="card" style={{ padding: "18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <Hash size={16} style={{ color: "var(--green)" }}/><strong>Ringkasan Kasus</strong>
              </div>
              <div style={{ fontSize: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
                {[
                  ["Nomor Kasus", ec.case_summary?.case_number],
                  ["Klaim ID", ec.case_summary?.claim_id],
                  ["Status", <StatusBadge key="s" status={ec.case_summary?.status || ""}/>],
                  ["Ditugaskan ke", ec.case_summary?.assigned_to ? `${ec.case_summary.assigned_to} (${ec.case_summary.assigned_role || "PETUGAS"})` : "Belum ditugaskan"],
                  ["SLA Deadline", formatDate(ec.case_summary?.sla_deadline)],
                  ["Dibuat", formatDate(ec.case_summary?.created_at)],
                  ["Outcome", ec.final_outcome?.outcome ? (OUTCOME_LABELS[ec.final_outcome.outcome]?.label || ec.final_outcome.outcome) : "Belum ada hasil"],
                ].map(([k, v]) => (
                  <div key={k as string} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid var(--line)" }}>
                    <span style={{ color: "var(--muted)" }}>{k}</span><span style={{ fontWeight: 600, textAlign: "right" }}>{v || "-"}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Fakta Tercatat */}
            <div className="card" style={{ padding: "18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <Database size={16} style={{ color: "#0284c7" }}/><strong>Fakta Tercatat</strong>
                <span style={{ fontSize: "10px", background: "#e0f2fe", color: "#0284c7", padding: "2px 6px", borderRadius: "8px", fontWeight: 700 }}>OBSERVED FACT</span>
              </div>
              <p style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "10px" }}>{ec.observed_facts?._description}</p>
              <div style={{ fontSize: "12px", display: "flex", flexDirection: "column", gap: "5px" }}>
                {ec.observed_facts && Object.entries(ec.observed_facts).filter(([k]) => !k.startsWith("_")).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "1px solid var(--line)" }}>
                    <span style={{ color: "var(--muted)", fontFamily: "monospace", fontSize: "11px" }}>{k}</span>
                    <span style={{ fontWeight: 600, textAlign: "right", maxWidth: "55%", overflow: "hidden", textOverflow: "ellipsis" }}>{String(v ?? "-")}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Pola Terdeteksi */}
            <div className="card" style={{ padding: "18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <AlertCircle size={16} style={{ color: "#d97706" }}/><strong>Pola Terdeteksi</strong>
                <span style={{ fontSize: "10px", background: "#fef3c7", color: "#d97706", padding: "2px 6px", borderRadius: "8px", fontWeight: 700 }}>DETECTED PATTERN</span>
              </div>
              <p style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "10px" }}>{ec.detected_patterns?._description}</p>
              <div style={{ fontSize: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ padding: "8px 12px", borderRadius: "10px", background: "#fef3c7" }}>
                  <strong>Pemicu Utama:</strong> {ec.detected_patterns?.primary_trigger || "Tidak ada"}
                </div>
                {(ec.detected_patterns?.evidence_reasons as string[] || []).map((r: string, i: number) => (
                  <div key={i} style={{ display: "flex", gap: "8px", fontSize: "11px", padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                    <ChevronRight size={12} style={{ color: "#d97706", flexShrink: 0, marginTop: 2 }}/>{r}
                  </div>
                ))}
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "4px" }}>
                  <span style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "8px", background: ec.detected_patterns?.spatial_conflict_detected ? "#fee2e2" : "#f1f5f9", color: ec.detected_patterns?.spatial_conflict_detected ? "#dc2626" : "#64748b" }}>
                    Konflik Spasial: {ec.detected_patterns?.spatial_conflict_detected ? "YA ⚠" : "Tidak"}
                  </span>
                  <span style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "8px", background: "#f1f5f9" }}>
                    Volume Harian Dokter: {ec.detected_patterns?.doctor_daily_volume ?? "—"}
                  </span>
                </div>
                {ec.detected_patterns?.subgraph_evidence?.nodes?.length > 0 && (
                  <div style={{ marginTop: "10px" }}>
                    <SubgraphViewer
                      nodes={ec.detected_patterns.subgraph_evidence.nodes}
                      edges={ec.detected_patterns.subgraph_evidence.edges}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Output Model AI */}
            <div className="card" style={{ padding: "18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <Zap size={16} style={{ color: "#db2777" }}/><strong>Output Model AI</strong>
                <span style={{ fontSize: "10px", background: "#fce7f3", color: "#db2777", padding: "2px 6px", borderRadius: "8px", fontWeight: 700 }}>AI OUTPUT</span>
              </div>
              <p style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "10px" }}>{ec.ai_output?._description}</p>
              <div style={{ fontSize: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <div style={{ padding: "10px 12px", borderRadius: "10px", background: "#f9fafb", textAlign: "center" }}>
                    <div style={{ fontSize: "10px", color: "var(--muted)" }}>Fraud Risk Index</div>
                    <div style={{ fontSize: "22px", fontWeight: 800, color: ec.ai_output?.risk_level === "HIGH" ? "#dc2626" : ec.ai_output?.risk_level === "MEDIUM" ? "#d97706" : "#059669" }}>{ec.ai_output?.fraud_risk_index ?? "—"}</div>
                  </div>
                  <div style={{ padding: "10px 12px", borderRadius: "10px", background: "#f9fafb", textAlign: "center" }}>
                    <div style={{ fontSize: "10px", color: "var(--muted)" }}>Probabilitas Anomali</div>
                    <div style={{ fontSize: "22px", fontWeight: 800 }}>{ec.ai_output?.fraud_probability !== null ? `${(ec.ai_output.fraud_probability * 100).toFixed(1)}%` : "—"}</div>
                  </div>
                </div>
                <div style={{ padding: "8px 12px", borderRadius: "10px", background: "#fce7f3", fontSize: "11px", color: "#831843" }}>
                  <AlertTriangle size={12} style={{ display: "inline", marginRight: "4px" }}/>{ec.ai_output?._legal_disclaimer}
                </div>
                <div style={{ fontSize: "11px", color: "var(--muted)" }}>Model: {ec.ai_output?.model_name} v{ec.ai_output?.model_version} • {formatDate(ec.ai_output?.evaluated_at)}</div>
              </div>
            </div>

            {/* Temuan Petugas */}
            <div className="card" style={{ padding: "18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <UserCheck size={16} style={{ color: "#059669" }}/><strong>Temuan Petugas</strong>
                <span style={{ fontSize: "10px", background: "#d1fae5", color: "#059669", padding: "2px 6px", borderRadius: "8px", fontWeight: 700 }}>INVESTIGATOR FINDING</span>
              </div>
              {ec.investigator_findings?.reviews?.length === 0 ? (
                <EmptyState icon={<ClipboardList size={32}/>} message="Belum ada catatan review" sub="Gunakan panel tindakan untuk memulai"/>
              ) : (
                ec.investigator_findings?.reviews?.map((r: any) => (
                  <div key={r.id} style={{ padding: "10px 12px", borderRadius: "10px", background: "#f9fafb", marginBottom: "8px", fontSize: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <strong>{r.reviewer_name}</strong><RoleBadge role={r.reviewer_role}/>
                    </div>
                    <div style={{ marginBottom: "4px" }}><span style={{ fontWeight: 700, padding: "2px 8px", borderRadius: "8px", background: r.decision === "RELEASE" ? "#d1fae5" : r.decision === "ESCALATE_AUDIT" ? "#fee2e2" : "#fef3c7", color: r.decision === "RELEASE" ? "#059669" : r.decision === "ESCALATE_AUDIT" ? "#dc2626" : "#d97706" }}>{r.decision}</span></div>
                    <p style={{ color: "var(--muted)", margin: "6px 0 0", fontSize: "11px" }}>{r.notes}</p>
                    <div style={{ fontSize: "10px", color: "var(--muted)", marginTop: "4px" }}>{formatDate(r.reviewed_at)}</div>
                  </div>
                ))
              )}
            </div>

            {/* Tindakan Tersedia */}
            <div className="card" style={{ padding: "18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <Send size={16} style={{ color: "var(--green)" }}/><strong>Tindakan Tersedia</strong>
              </div>

              {caseActionResult && (
                <div style={{ padding: "10px 14px", borderRadius: "10px", marginBottom: "12px", background: caseActionResult.success ? "#d1fae5" : "#fee2e2", color: caseActionResult.success ? "#059669" : "#dc2626", fontSize: "12px", fontWeight: 600 }}>
                  {caseActionResult.success ? <CheckCircle2 size={14} style={{ display: "inline", marginRight: "6px" }}/> : <XCircle size={14} style={{ display: "inline", marginRight: "6px" }}/>}
                  {caseActionResult.message}
                </div>
              )}

              {/* Supervisor / Admin Case Assignment Panel */}
              {hasPermission(currentUser.role, ["assign"]) && (
                <div style={{ marginBottom: "14px", padding: "12px", borderRadius: "12px", background: "#f9fafb", border: "1px solid var(--line)" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#374151", marginBottom: "8px" }}>
                    PENUGASAN KASUS (SUPERVISOR / ADMIN)
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
                    <select
                      value={assignTargetUser}
                      onChange={e => setAssignTargetUser(e.target.value)}
                      style={{ padding: "6px 10px", borderRadius: "8px", border: "1px solid var(--line)", fontSize: "12px" }}
                    >
                      <option value="investigator_aura">investigator_aura (Investigator)</option>
                      <option value="verifier_aura">verifier_aura (Verifikator)</option>
                      <option value="supervisor_aura">supervisor_aura (Supervisor)</option>
                    </select>
                    <select
                      value={assignTargetRole}
                      onChange={e => setAssignTargetRole(e.target.value)}
                      style={{ padding: "6px 10px", borderRadius: "8px", border: "1px solid var(--line)", fontSize: "12px" }}
                    >
                      <option value="INVESTIGATOR">INVESTIGATOR</option>
                      <option value="VERIFIKATOR">VERIFIKATOR</option>
                      <option value="SUPERVISOR">SUPERVISOR</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    className="button button-secondary"
                    style={{ width: "100%", minHeight: "32px", fontSize: "11.5px" }}
                    disabled={caseActionLoading}
                    onClick={handleAssignCase}
                  >
                    <UserCheck size={13} /> Tugaskan Kasus ke {assignTargetUser}
                  </button>
                </div>
              )}

              {(ec.available_actions || selectedCase.available_actions || []).length === 0 ? (
                <div style={{ fontSize: "12px", color: "var(--muted)", padding: "12px", background: "#f9fafb", borderRadius: "10px" }}>
                  Tidak ada transisi status tersedia untuk status ini atau role Anda ({currentUser.role}).
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: "10px" }}>
                    <label style={{ fontSize: "11px", color: "var(--muted)", display: "block", marginBottom: "6px" }}>Pilih Tindakan Status:</label>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {(ec.available_actions || selectedCase.available_actions).map((a: any) => (
                        <button key={a.action} onClick={() => setCaseAction(a.action)}
                          style={{ textAlign: "left", padding: "8px 12px", borderRadius: "10px", border: `1px solid ${caseAction === a.action ? "var(--green)" : "var(--line)"}`, background: caseAction === a.action ? "#e5f4ec" : "#fff", fontSize: "12px", cursor: "pointer", fontWeight: caseAction === a.action ? 700 : 500 }}>
                          <ArrowRight size={12} style={{ display: "inline", marginRight: "6px" }}/>{a.description} → <strong>{a.to_status}</strong>
                        </button>
                      ))}
                    </div>
                  </div>

                  {caseAction === "TRANSITION_TO_RESOLVED" && (
                    <div style={{ marginBottom: "10px" }}>
                      <label style={{ fontSize: "11px", color: "var(--muted)", display: "block", marginBottom: "4px" }}>Hasil Akhir Investigasi (Outcome):</label>
                      <select
                        value={caseOutcome}
                        onChange={e => setCaseOutcome(e.target.value)}
                        style={{ width: "100%", padding: "8px 12px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "12px" }}
                      >
                        <option value="REFERRED_FOR_ACTION">REFERRED_FOR_ACTION — Direkomendasikan Tindakan Lanjut</option>
                        <option value="CLEARED">CLEARED — Klaim Terverifikasi Sah</option>
                        <option value="INSUFFICIENT_EVIDENCE">INSUFFICIENT_EVIDENCE — Bukti Belum Memadai</option>
                        <option value="CLOSED_ADMINISTRATIVE">CLOSED_ADMINISTRATIVE — Ditutup Administratif</option>
                      </select>
                    </div>
                  )}

                  <div style={{ marginBottom: "10px" }}>
                    <label style={{ fontSize: "11px", color: "var(--muted)", display: "block", marginBottom: "4px" }}>Catatan (wajib untuk eskalasi/resolusi):</label>
                    <textarea value={caseNotes} onChange={e => setCaseNotes(e.target.value)} rows={3}
                      placeholder="Tuliskan temuan, alasan, atau catatan pemeriksaan..."
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "12px", resize: "vertical", fontFamily: "inherit" }}/>
                  </div>
                  <button className="button button-primary" disabled={!caseAction || caseActionLoading} onClick={performCaseAction} style={{ width: "100%" }}>
                    {caseActionLoading ? <RefreshCw size={14} className="animate-spin"/> : <Send size={14}/>}
                    {caseActionLoading ? "Memproses..." : "Jalankan Tindakan"}
                  </button>
                </>
              )}

              {/* Also allow claim-level review */}
              {ec.observed_facts?.claim_id && (
                <div style={{ marginTop: "16px", paddingTop: "12px", borderTop: "1px solid var(--line)" }}>
                  <div style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "8px", fontWeight: 700 }}>CATATAN REVIEW KLAIM (CONTROLLED FEEDBACK LOOP):</div>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {(["RELEASE", "CLARIFY", "ESCALATE_AUDIT"] as const).map(d => (
                      <button key={d} onClick={() => handleReviewDecision(d)} disabled={submittingReview}
                        style={{ padding: "6px 14px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "11px", fontWeight: 700, cursor: "pointer", background: d === "RELEASE" ? "#d1fae5" : d === "ESCALATE_AUDIT" ? "#fee2e2" : "#fef3c7", color: d === "RELEASE" ? "#059669" : d === "ESCALATE_AUDIT" ? "#dc2626" : "#d97706" }}>
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Riwayat Transisi */}
            <div className="card" style={{ padding: "18px", gridColumn: "1 / -1" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <History size={16} style={{ color: "var(--green)" }}/><strong>Riwayat Kasus</strong>
                <span style={{ fontSize: "10px", background: "#d1fae5", color: "#059669", padding: "2px 6px", borderRadius: "8px", fontWeight: 700 }}>FINAL OUTCOME</span>
              </div>
              <div style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "4px" }}>
                {ec.case_history?.transitions?.map((t: any, i: number) => (
                  <div key={i} style={{ flexShrink: 0, padding: "10px 14px", borderRadius: "12px", background: "#f9fafb", border: "1px solid var(--line)", minWidth: "160px" }}>
                    <div style={{ fontSize: "10px", color: "var(--muted)" }}>{t.from_status} → <strong>{t.to_status}</strong></div>
                    <div style={{ fontSize: "11px", fontWeight: 700, marginTop: "4px" }}>{t.actor_name}</div>
                    <div style={{ fontSize: "10px", color: "var(--muted)" }}>{t.actor_role}</div>
                    {t.notes && <div style={{ fontSize: "10px", marginTop: "4px", color: "#374151", fontStyle: "italic" }}>"{t.notes}"</div>}
                    <div style={{ fontSize: "10px", color: "var(--muted)", marginTop: "4px" }}>{formatDate(t.at)}</div>
                  </div>
                ))}
                {(!ec.case_history?.transitions || ec.case_history.transitions.length === 0) && (
                  <span style={{ fontSize: "12px", color: "var(--muted)" }}>Belum ada transisi status tercatat.</span>
                )}
              </div>
              {ec.final_outcome?._disclaimer && (
                <div style={{ marginTop: "12px", padding: "10px 14px", borderRadius: "10px", background: "#f0fdf4", border: "1px solid #bbf7d0", fontSize: "11px", color: "#166534" }}>
                  <Scale size={12} style={{ display: "inline", marginRight: "6px" }}/>{ec.final_outcome._disclaimer}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "center", gap: "16px", padding: "32px 0" }}>
            <div className="card" style={{ padding: "24px", textAlign: "center" }}>
              <RefreshCw size={24} className="animate-spin" style={{ color: "var(--green)", marginBottom: "12px" }}/>
              <p style={{ color: "var(--muted)", fontSize: "13px" }}>Memuat Evidence Center dari database…</p>
              <button className="button button-secondary" style={{ marginTop: "16px", fontSize: "12px" }} onClick={() => fetchCaseDetail(selectedCase.id)}>Coba Lagi</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderAlertExplorer = () => (
    <div>
      <SectionHeader title="Antrean Klaim / Alert Explorer" subtitle={`${data?.claims.length ?? 0} dari ${data?.summary.total_claims?.toLocaleString("id-ID") ?? "—"} klaim — sumber: PostgreSQL Live`}
        action={
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }}/>
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && fetchClaims()} placeholder="Cari claim ID, dokter, faskes…"
                style={{ paddingLeft: "32px", padding: "6px 12px 6px 32px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "12px", width: "185px" }}/>
            </div>
            <select value={riskFilter} onChange={e => setRiskFilter(e.target.value)} style={{ padding: "6px 10px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "11.5px" }}>
              <option value="ALL">Semua Risiko</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
              <option value="UNASSESSED">Belum Diases</option>
            </select>
            <select value={scenarioFilter} onChange={e => setScenarioFilter(e.target.value)} style={{ padding: "6px 10px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "11.5px" }}>
              <option value="ALL">Semua Skenario</option>
              <option value="C">Skenario C (Phantom)</option>
              <option value="B">Skenario B (Upcoding)</option>
              <option value="A">Skenario A (Doctor Shopping)</option>
              <option value="NORMAL">Klaim Normal</option>
            </select>
            <select value={reviewStatusFilter} onChange={e => setReviewStatusFilter(e.target.value)} style={{ padding: "6px 10px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "11.5px" }}>
              <option value="ALL">Semua Status Review</option>
              <option value="PENDING_REVIEW">Belum Direview</option>
              <option value="RELEASED">Released (Sah)</option>
              <option value="CLARIFICATION_REQUESTED">Klarifikasi</option>
              <option value="ESCALATED_AUDIT">Eskalasi Audit</option>
            </select>
            <select value={gateFilter} onChange={e => setGateFilter(e.target.value)} style={{ padding: "6px 10px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "11.5px" }}>
              <option value="ALL">Semua Gate</option>
              <option value="REJECT_FOR_HUMAN_REVIEW">Tahan (Human Review)</option>
              <option value="FLAGGED_WARNING">Flagged Warning</option>
              <option value="AUTO_APPROVE">Auto Approve</option>
            </select>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ padding: "6px 10px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "11.5px" }}>
              <option value="fri_desc">FRI Tertinggi</option>
              <option value="fri_asc">FRI Terendah</option>
              <option value="tariff_desc">Tarif Terbesar</option>
              <option value="newest">Terbaru</option>
            </select>
            <button className="button button-secondary" onClick={() => setShowSimulatorModal(true)} title="Simulasi Klaim Baru">
              <PlusCircle size={14}/> Simulasi
            </button>
            <button className="button button-secondary" onClick={fetchClaims} disabled={loading}><RefreshCw size={14} className={loading ? "animate-spin" : ""}/></button>
          </div>
        }
      />

      {dataSourceError && <DataSourceBanner error={dataSourceError}/>}
      {reviewBanner && (
        <div style={{ padding: "12px 16px", borderRadius: "12px", marginBottom: "16px", background: reviewBanner.success ? "#d1fae5" : "#fee2e2", color: reviewBanner.success ? "#059669" : "#dc2626", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "13px", fontWeight: 600 }}>{reviewBanner.success ? <CheckCircle2 size={14} style={{ display: "inline", marginRight: "6px" }}/> : <XCircle size={14} style={{ display: "inline", marginRight: "6px" }}/>}{reviewBanner.message}</span>
          <button onClick={() => setReviewBanner(null)} className="icon-button"><X size={14}/></button>
        </div>
      )}

      {loading ? <LoadingSpinner/> : (
        <div style={{ display: "grid", gridTemplateColumns: "350px 1fr", gap: "16px", alignItems: "start" }}>
          {/* Claim List */}
          <div className="card" style={{ padding: "14px", maxHeight: "calc(100vh - 280px)", overflowY: "auto" }}>
            <div style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 700, marginBottom: "10px", padding: "0 4px" }}>DAFTAR ALERT — {data?.claims.length ?? 0} RECORD</div>
            {(!data?.claims || data.claims.length === 0) ? (
              <EmptyState icon={<Inbox size={32}/>} message="Tidak ada klaim" sub="Coba ubah filter"/>
            ) : data.claims.map(c => (
              <button key={c.claim_id} onClick={() => setSelectedClaim(c)}
                style={{ width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: "12px", marginBottom: "6px", border: `1px solid ${selectedClaim?.claim_id === c.claim_id ? "var(--green)" : "var(--line)"}`, background: selectedClaim?.claim_id === c.claim_id ? "#e5f4ec" : "#fff", cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <span style={{ fontFamily: "monospace", fontSize: "11px", fontWeight: 700 }}>{c.claim_id.substring(0, 18)}…</span>
                  <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 6px", borderRadius: "8px", background: c.risk_level === "HIGH" ? "#fee2e2" : c.risk_level === "MEDIUM" ? "#fef3c7" : "#d1fae5", color: c.risk_level === "HIGH" ? "#dc2626" : c.risk_level === "MEDIUM" ? "#d97706" : "#059669" }}>
                    {c.risk_level}
                  </span>
                </div>
                <div style={{ fontSize: "11px", color: "var(--muted)" }}>
                  FRI: <strong>{c.fraud_risk_index ?? "—"}</strong> • {c.service_date} • {formatIDR(c.ina_cbgs_tariff)}
                </div>
                <div style={{ display: "flex", gap: "6px", marginTop: "4px", flexWrap: "wrap" }}>
                  {c.fraud_scenario && (
                    <span style={{ fontSize: "9.5px", fontWeight: 700, padding: "1px 6px", borderRadius: "6px", background: "#f3e8ff", color: "#7c3aed" }}>
                      Skenario {c.fraud_scenario}
                    </span>
                  )}
                  <span style={{ fontSize: "9.5px", fontWeight: 600, padding: "1px 6px", borderRadius: "6px", background: c.review_status === "PENDING_REVIEW" ? "#f1f5f9" : "#d1fae5", color: c.review_status === "PENDING_REVIEW" ? "#64748b" : "#059669" }}>
                    {c.review_status}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* Claim Detail */}
          {selectedClaim ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div className="card" style={{ padding: "18px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 800, fontFamily: "monospace" }}>{selectedClaim.claim_id}</h2>
                    <div style={{ display: "flex", gap: "8px", marginTop: "6px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "8px", background: selectedClaim.risk_level === "HIGH" ? "#fee2e2" : "#fef3c7", color: selectedClaim.risk_level === "HIGH" ? "#dc2626" : "#d97706" }}>{selectedClaim.risk_level} RISK</span>
                      <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "8px", background: "#f1f5f9" }}>FRI: {selectedClaim.fraud_risk_index ?? "—"}</span>
                      <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "8px", background: "#e0f2fe", color: "#0284c7", fontWeight: 700 }}>Gate: {selectedClaim.pre_payment_gate}</span>
                      {selectedClaim.is_synthetic && <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "8px", background: "#f0f9ff", color: "#0284c7" }}>DATA SINTETIS (Healthkathon)</span>}
                    </div>
                  </div>
                  {hasPermission(currentUser.role, ["investigate", "start_review"]) && (
                    <button className="button button-primary" style={{ fontSize: "11px" }} onClick={() => createCaseFromClaim(selectedClaim.claim_id)}>
                      <PlusCircle size={13}/> Buat Kasus
                    </button>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", fontSize: "12px" }}>
                  {[["Pasien", selectedClaim.patient_id], ["Dokter", selectedClaim.doctor_id], ["Faskes", selectedClaim.facility_id], ["ICD-10", selectedClaim.icd10_code], ["Tanggal Layanan", selectedClaim.service_date], ["Tarif INA-CBGs", formatIDR(selectedClaim.ina_cbgs_tariff)], ["LOS", `${selectedClaim.length_of_stay} hari`], ["Kelas Faskes", selectedClaim.facility_class], ["Wilayah Pasien", selectedClaim.home_region]].map(([k, v]) => (
                    <div key={k} style={{ padding: "8px 10px", borderRadius: "8px", background: "#f9fafb" }}>
                      <div style={{ fontSize: "10px", color: "var(--muted)" }}>{k}</div>
                      <div style={{ fontWeight: 600, fontSize: "11px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v || "-"}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* XAI */}
              {selectedClaim.xai_explanation && (
                <div className="card" style={{ padding: "18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                    <Zap size={16} style={{ color: "#db2777" }}/><strong>Output Model AI</strong>
                    <span style={{ fontSize: "10px", background: "#fce7f3", color: "#db2777", padding: "2px 6px", borderRadius: "8px" }}>AI OUTPUT — Bukan pembuktian fraud</span>
                  </div>
                  <div style={{ padding: "10px 14px", borderRadius: "10px", background: "#fef3c7", fontSize: "12px", marginBottom: "10px" }}>
                    <strong>Pemicu:</strong> {selectedClaim.xai_explanation.primary_fraud_trigger}
                  </div>
                  {selectedClaim.xai_explanation.evidence_reasons.map((r, i) => (
                    <div key={i} style={{ display: "flex", gap: "8px", fontSize: "11px", padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                      <ChevronRight size={12} style={{ color: "#db2777", flexShrink: 0, marginTop: 2 }}/>{r}
                    </div>
                  ))}
                  {selectedClaim.xai_explanation.subgraph_evidence?.nodes?.length > 0 && (
                    <div style={{ marginTop: "12px" }}>
                      <SubgraphViewer nodes={selectedClaim.xai_explanation.subgraph_evidence.nodes} edges={selectedClaim.xai_explanation.subgraph_evidence.edges}/>
                    </div>
                  )}
                </div>
              )}

              {/* Review Panel */}
              {hasPermission(currentUser.role, ["start_review", "record_decision", "investigate"]) && (
                <div className="card" style={{ padding: "18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                    <Send size={16} style={{ color: "var(--green)" }}/><strong>Catat Review Klaim</strong>
                  </div>
                  <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
                    {(["RELEASE", "CLARIFY", "ESCALATE_AUDIT"] as const).map(d => (
                      <button key={d} onClick={() => setSelectedDecision(d)}
                        style={{ flex: 1, padding: "8px", borderRadius: "10px", border: `1px solid ${selectedDecision === d ? (d === "RELEASE" ? "#059669" : d === "ESCALATE_AUDIT" ? "#dc2626" : "#d97706") : "var(--line)"}`, background: selectedDecision === d ? (d === "RELEASE" ? "#d1fae5" : d === "ESCALATE_AUDIT" ? "#fee2e2" : "#fef3c7") : "#fff", color: d === "RELEASE" ? "#059669" : d === "ESCALATE_AUDIT" ? "#dc2626" : "#d97706", fontWeight: selectedDecision === d ? 800 : 500, fontSize: "11px", cursor: "pointer" }}>
                        {d === "RELEASE" ? "✓ Release (Label 0)" : d === "CLARIFY" ? "? Klarifikasi" : "↑ Eskalasi (Label 1)"}
                      </button>
                    ))}
                  </div>
                  <textarea value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} rows={3} placeholder="Catatan pemeriksaan (opsional)…"
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "12px", resize: "vertical", fontFamily: "inherit", marginBottom: "10px" }}/>
                  <button className="button button-primary" style={{ width: "100%" }} onClick={() => handleReviewDecision(selectedDecision)} disabled={submittingReview}>
                    {submittingReview ? <RefreshCw size={14} className="animate-spin"/> : <Send size={14}/>}
                    {submittingReview ? "Menyimpan ke PostgreSQL…" : `Simpan Keputusan: ${selectedDecision}`}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <EmptyState icon={<Eye size={48}/>} message="Pilih klaim dari daftar" sub="Klik klaim untuk melihat detail dan opsi review"/>
          )}
        </div>
      )}
    </div>
  );

  const renderInvestigation = () => (
    <div style={{ display: "flex", gap: "20px" }}>
      {/* Sub-nav */}
      <div style={{ width: "180px", flexShrink: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {([
            ["queue", "Antrean Kasus", <ClipboardList size={16}/>],
            ["my_cases", "Kasus Saya", <UserCheck size={16}/>],
            ["evidence_center", "Evidence Center", <FolderOpen size={16}/>],
            ["alert_explorer", "Alert Explorer", <AlertCircle size={16}/>],
            ["graph", "Graph Explorer", <Network size={16}/>],
          ] as const).map(([view, label, icon]) => (
            <button key={view} onClick={() => setInvestigationView(view as InvestigationView)}
              style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", borderRadius: "10px", border: "none", background: investigationView === view ? "#e5f4ec" : "transparent", color: investigationView === view ? "var(--dark-green)" : "#374151", fontWeight: investigationView === view ? 700 : 500, fontSize: "13px", cursor: "pointer", textAlign: "left" }}>
              <span style={{ color: investigationView === view ? "var(--green)" : "var(--muted)" }}>{icon}</span>{label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {investigationView === "queue" && renderInvestigationQueue(false)}
        {investigationView === "my_cases" && renderInvestigationQueue(true)}
        {investigationView === "evidence_center" && renderEvidenceCenter()}
        {investigationView === "alert_explorer" && renderAlertExplorer()}
        {investigationView === "graph" && (
          <div>
            <SectionHeader title="Graph Explorer" subtitle="Visualisasi relasi antar-entitas berdasarkan data klaim aktual"/>
            {selectedClaim?.xai_explanation?.subgraph_evidence ? (
              <div className="card" style={{ padding: "18px" }}>
                <SubgraphViewer nodes={selectedClaim.xai_explanation.subgraph_evidence.nodes} edges={selectedClaim.xai_explanation.subgraph_evidence.edges}/>
              </div>
            ) : (
              <EmptyState icon={<Network size={48}/>} message="Pilih klaim di Alert Explorer" sub="Graf relasi akan muncul berdasarkan data subgraph dari model R-GCN"/>
            )}
          </div>
        )}
      </div>
    </div>
  );

  // ============================================================
  // SECTION: DATA INTELLIGENCE
  // ============================================================

  const renderDataIngestion = () => (
    <div>
      <SectionHeader title="Riwayat Ingestion Data" subtitle="Phase 1 — Rekam jejak proses masuk dataset ke sistem. Semua metrik dari database aktual." action={<button className="button button-secondary" onClick={fetchIngestion} disabled={ingestionLoading}><RefreshCw size={14} className={ingestionLoading ? "animate-spin" : ""}/>Segarkan</button>}/>
      {ingestionLoading ? <LoadingSpinner/> : ingestionData ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "24px" }}>
            <MetricCard title="TOTAL KLAIM DI DB" value={ingestionData.database_summary?.total_claims_in_db?.toLocaleString("id-ID")} subtitle="Record klaim tersimpan" icon={<Database size={18}/>}/>
            <MetricCard title="TOTAL PASIEN" value={ingestionData.database_summary?.total_patients_in_db?.toLocaleString("id-ID")} subtitle="Pseudonymized ID" icon={<User size={18}/>}/>
            <MetricCard title="TOTAL DOKTER" value={ingestionData.database_summary?.total_doctors_in_db?.toLocaleString("id-ID")} subtitle="Profil dokter" icon={<Stethoscope size={18}/>}/>
            <MetricCard title="TOTAL FASKES" value={ingestionData.database_summary?.total_facilities_in_db?.toLocaleString("id-ID")} subtitle="Fasilitas kesehatan" icon={<Building2 size={18}/>}/>
          </div>
          {ingestionData.note && (
            <div style={{ padding: "12px 16px", borderRadius: "12px", background: "#fef3c7", border: "1px solid #fde68a", color: "#92400e", marginBottom: "16px", fontSize: "12px" }}>
              <AlertTriangle size={14} style={{ display: "inline", marginRight: "6px" }}/>{ingestionData.note}
            </div>
          )}
          <div className="card" style={{ padding: "18px" }}>
            <strong style={{ display: "block", marginBottom: "12px" }}>Log Ingestion Batch</strong>
            {ingestionData.batches?.length === 0 ? (
              <EmptyState icon={<Database size={32}/>} message="Belum ada riwayat ingestion tercatat" sub="Data akan muncul setelah proses import dataset berjalan"/>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                  <thead><tr style={{ borderBottom: "1px solid var(--line)", background: "var(--surface)" }}>
                    {["Batch ID", "Dataset", "Tipe", "Dibaca", "Valid", "Ditolak", "Duplikat", "Status", "Mulai", "Oleh"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, fontSize: "11px" }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {ingestionData.batches?.map((b: any) => (
                      <tr key={b.batch_id} style={{ borderBottom: "1px solid var(--line)" }}>
                        <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: "11px" }}>{b.batch_id}</td>
                        <td style={{ padding: "8px 12px" }}>{b.source_dataset}</td>
                        <td style={{ padding: "8px 12px" }}>{b.dataset_type}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right" }}>{b.total_read?.toLocaleString()}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right", color: "#059669", fontWeight: 700 }}>{b.total_valid?.toLocaleString()}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right", color: "#dc2626" }}>{b.total_rejected?.toLocaleString()}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right" }}>{b.total_duplicates?.toLocaleString()}</td>
                        <td style={{ padding: "8px 12px" }}><span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "8px", background: b.status === "COMPLETED" ? "#d1fae5" : "#fef3c7", color: b.status === "COMPLETED" ? "#059669" : "#d97706" }}>{b.status}</span></td>
                        <td style={{ padding: "8px 12px", fontSize: "11px" }}>{formatDate(b.started_at)}</td>
                        <td style={{ padding: "8px 12px" }}>{b.initiated_by}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <EmptyState icon={<Database size={48}/>} message="Gagal memuat riwayat ingestion" sub="Pastikan koneksi database aktif"/>
      )}
    </div>
  );

  const renderModelEval = () => (
    <div>
      <SectionHeader title="Evaluasi Model AI & Controlled Feedback Loop" subtitle="Status model R-GCN PyTorch Geometric & ekspor dataset ground-truth dari hasil telaah verifikator"/>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
        <MetricCard title="VERSI MODEL AKTIF" value={perfData?.model?.current_version || "1.0.0"} subtitle={`Terakhir inferensi: ${formatDate(perfData?.model?.last_inference)}`} icon={<Zap size={18}/>}/>
        <MetricCard title="COVERAGE ASESMEN" value={perfData?.data_quality?.assessment_coverage_pct !== undefined ? `${perfData.data_quality.assessment_coverage_pct}%` : null} subtitle="Klaim yang telah diases oleh model" color="#0284c7" icon={<Target size={18}/>}/>
      </div>
      <div className="card" style={{ padding: "18px", marginBottom: "20px" }}>
        <ControlledFeedbackPanel backendUrl={BACKEND_URL} authToken={currentUser.token} />
      </div>
    </div>
  );

  const renderDataIntelligence = () => (
    <div style={{ display: "flex", gap: "20px" }}>
      <div style={{ width: "180px", flexShrink: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {([["ingestion", "Data Ingestion", <Database size={16}/>], ["quality", "Kualitas Data", <CheckSquare size={16}/>], ["alert_explorer", "Alert Explorer", <AlertCircle size={16}/>], ["model_eval", "Evaluasi Model", <Zap size={16}/>]] as const).map(([v, l, ic]) => (
            <button key={v} onClick={() => setDataView(v as DataView)}
              style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", borderRadius: "10px", border: "none", background: dataView === v ? "#e5f4ec" : "transparent", color: dataView === v ? "var(--dark-green)" : "#374151", fontWeight: dataView === v ? 700 : 500, fontSize: "13px", cursor: "pointer", textAlign: "left" }}>
              <span style={{ color: dataView === v ? "var(--green)" : "var(--muted)" }}>{ic}</span>{l}
            </button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1 }}>
        {dataView === "ingestion" && renderDataIngestion()}
        {dataView === "quality" && (
          <div>
            <SectionHeader title="Kualitas Data" subtitle="Tingkat validitas, kelengkapan, dan konsistensi dataset"/>
            {perfLoading ? <LoadingSpinner/> : perfData ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
                <MetricCard title="TOTAL KLAIM" value={perfData.data_quality?.total_claims?.toLocaleString("id-ID")} icon={<Database size={18}/>}/>
                <MetricCard title="SUDAH DIASES" value={perfData.data_quality?.assessed_claims?.toLocaleString("id-ID")} subtitle={`Coverage: ${perfData.data_quality?.assessment_coverage_pct}%`} color="#059669" icon={<CheckCircle2 size={18}/>}/>
                <MetricCard title="BELUM DIASES" value={perfData.data_quality?.not_assessed?.toLocaleString("id-ID")} color="#d97706" icon={<Hourglass size={18}/>}/>
                <MetricCard title="RISIKO TINGGI" value={perfData.data_quality?.high_risk?.toLocaleString("id-ID")} color="#dc2626" icon={<ShieldAlert size={18}/>}/>
                <MetricCard title="RISIKO SEDANG" value={perfData.data_quality?.medium_risk?.toLocaleString("id-ID")} color="#d97706" icon={<AlertTriangle size={18}/>}/>
                <MetricCard title="RISIKO RENDAH" value={perfData.data_quality?.low_risk?.toLocaleString("id-ID")} color="#059669" icon={<ShieldCheck size={18}/>}/>
              </div>
            ) : <LoadingSpinner/>}
          </div>
        )}
        {dataView === "alert_explorer" && renderAlertExplorer()}
        {dataView === "model_eval" && renderModelEval()}
      </div>
    </div>
  );

  // ============================================================
  // SECTION: REPORTS
  // ============================================================

  const renderPerformanceDashboard = () => (
    <div>
      <SectionHeader title="Business Performance Dashboard" subtitle={`Metrik operasional aktual — 30 hari terakhir • Diperbarui: ${formatDate(new Date().toISOString())}`}
        action={<button className="button button-secondary" onClick={fetchPerformance} disabled={perfLoading}><RefreshCw size={14} className={perfLoading ? "animate-spin" : ""}/>Segarkan</button>}/>
      {perfLoading ? <LoadingSpinner/> : perfData ? (
        <>
          <div style={{ padding: "12px 16px", borderRadius: "12px", background: "#f0f9ff", border: "1px solid #bae6fd", color: "#0369a1", marginBottom: "20px", fontSize: "12px" }}>
            <Info size={14} style={{ display: "inline", marginRight: "6px" }}/>
            Semua metrik dihitung dari data operasional aktual. Lihat <code>metrics_definitions</code> di response API untuk definisi lengkap setiap metrik.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "24px" }}>
            <MetricCard title="THROUGHPUT (SEMUA WAKTU)" value={perfData.investigation?.throughput_all_time} subtitle="Kasus resolved + closed" color="#059669" icon={<TrendingUp size={18}/>}/>
            <MetricCard title="BACKLOG (TERBUKA)" value={perfData.investigation?.backlog} subtitle="Menunggu pemeriksaan" color="#d97706" icon={<Inbox size={18}/>}/>
            <MetricCard title="MEDIAN WAKTU INVESTIGASI" value={perfData.investigation?.median_investigation_hours !== null ? `${perfData.investigation.median_investigation_hours} jam` : null} subtitle="Dari review dimulai → selesai" icon={<Clock size={18}/>}/>
            <MetricCard title="ALERT REVIEW RATE" value={perfData.alert_quality?.alert_review_rate !== null ? `${perfData.alert_quality.alert_review_rate}%` : null} subtitle={`${perfData.alert_quality?.reviewed_in_period} review dalam periode`} color="#0284c7" icon={<Eye size={18}/>}/>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "24px" }}>
            <MetricCard title="FP RATE (TERVERIFIKASI)" value={perfData.alert_quality?.verified_false_positive_rate !== null ? `${perfData.alert_quality.verified_false_positive_rate}%` : null} subtitle="HIGH-risk yang di-RELEASE" color="#7c3aed" icon={<Scale size={18}/>}/>
            <MetricCard title="KELENGKAPAN BUKTI" value={perfData.evidence?.evidence_completeness_pct !== null ? `${perfData.evidence.evidence_completeness_pct}%` : null} subtitle={`${perfData.evidence?.cases_with_evidence} kasus dengan review`} color="#059669" icon={<BookOpen size={18}/>}/>
            <MetricCard title="PRECISION@K" value={null} subtitle={perfData.alert_quality?.precision_at_k_note} icon={<Target size={18}/>}/>
            <MetricCard title="AUDIT EVENTS (PERIODE)" value={perfData.audit_trail?.audit_events_in_period} subtitle="Tindakan penting tercatat" icon={<History size={18}/>}/>
          </div>

          {/* Priority distribution */}
          <div className="card" style={{ padding: "18px", marginBottom: "16px" }}>
            <strong>Distribusi Prioritas Kasus</strong>
            <div style={{ display: "flex", gap: "16px", marginTop: "12px" }}>
              {Object.entries(perfData.investigation?.priority_distribution || {}).map(([p, count]) => (
                <div key={p} style={{ flex: 1, padding: "12px 16px", borderRadius: "10px", textAlign: "center", background: PRIORITY_CONFIG[p]?.bg || "#f1f5f9" }}>
                  <div style={{ fontSize: "11px", color: PRIORITY_CONFIG[p]?.color || "#64748b", fontWeight: 700 }}>{p}</div>
                  <div style={{ fontSize: "28px", fontWeight: 800, color: PRIORITY_CONFIG[p]?.color || "#64748b" }}>{count as number}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: "16px" }}>
            <div style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 700, marginBottom: "8px" }}>DISCLAIMER METRIK BISNIS</div>
            <div style={{ fontSize: "12px", color: "#374151", lineHeight: 1.6 }}>
              • Kasus yang belum diperiksa tidak dihitung sebagai false positive.<br/>
              • Semua klaim yang ditandai tidak otomatis dianggap kerugian yang berhasil dicegah.<br/>
              • Nominal tarif adalah nilai yang ditahan sementara, bukan kerugian yang terverifikasi.<br/>
              • Baseline metrik: <strong>Not Established</strong> — sistem baru beroperasi. Ukur kondisi awal sekarang untuk evaluasi masa depan.
            </div>
          </div>
        </>
      ) : <EmptyState icon={<BarChart3 size={48}/>} message="Data dashboard belum dimuat" sub="Klik Segarkan atau tunggu otomatis"/>}
    </div>
  );

  const renderReports = () => (
    <div style={{ display: "flex", gap: "20px" }}>
      <div style={{ width: "180px", flexShrink: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {([["performance", "Business Performance", <BarChart3 size={16}/>], ["outcomes", "Investigation Outcomes", <Award size={16}/>], ["model", "Model Performance", <Zap size={16}/>], ["audit", "Audit Reports", <History size={16}/>]] as const).map(([v, l, ic]) => (
            <button key={v} onClick={() => setReportsView(v as ReportsView)}
              style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", borderRadius: "10px", border: "none", background: reportsView === v ? "#e5f4ec" : "transparent", color: reportsView === v ? "var(--dark-green)" : "#374151", fontWeight: reportsView === v ? 700 : 500, fontSize: "13px", cursor: "pointer", textAlign: "left" }}>
              <span style={{ color: reportsView === v ? "var(--green)" : "var(--muted)" }}>{ic}</span>{l}
            </button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1 }}>
        {reportsView === "performance" && renderPerformanceDashboard()}
        {reportsView === "outcomes" && (
          <div>
            <SectionHeader
              title="Investigation Outcomes"
              subtitle="Hasil pemeriksaan kasus dan distribusi keputusan petugas"
              action={
                <button className="button button-secondary" onClick={exportCasesCsv}>
                  <Download size={14}/> Unduh Rekap Kasus (CSV)
                </button>
              }
            />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "20px" }}>
              <MetricCard title="KASUS SELESAI" value={perfData?.investigation?.resolved_cases} color="#059669" icon={<CheckCircle2 size={18}/>}/>
              <MetricCard title="KASUS DITUTUP" value={perfData?.investigation?.closed_cases} icon={<Lock size={18}/>}/>
              <MetricCard title="KASUS DIESKALASI" value={perfData?.investigation?.escalated_cases} color="#dc2626" icon={<ArrowUpRight size={18}/>}/>
            </div>
            {perfData?.investigation?.outcomes_distribution && (
              <div className="card" style={{ padding: "18px", marginBottom: "20px" }}>
                <strong>Distribusi Hasil Resolusi Kasus (Outcomes)</strong>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px", marginTop: "12px" }}>
                  {Object.entries(OUTCOME_LABELS).map(([key, cfg]) => (
                    <div key={key} style={{ padding: "12px 16px", borderRadius: "12px", background: cfg.bg, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: "12px", fontWeight: 700, color: cfg.color }}>{cfg.label}</div>
                        <div style={{ fontSize: "10px", fontFamily: "monospace", color: "var(--muted)" }}>{key}</div>
                      </div>
                      <strong style={{ fontSize: "22px", color: cfg.color }}>
                        {perfData.investigation.outcomes_distribution[key] ?? 0}
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="card" style={{ padding: "18px" }}>
              <ControlledFeedbackPanel backendUrl={BACKEND_URL} authToken={currentUser.token} />
            </div>
          </div>
        )}
        {reportsView === "model" && renderModelEval()}
        {reportsView === "audit" && (
          <div>
            <SectionHeader title="Audit Reports" subtitle="Log operasional tercatat — akses dibatasi berdasarkan role"
              action={
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ position: "relative" }}>
                    <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }}/>
                    <input value={auditSearchQuery} onChange={e => setAuditSearchQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && fetchAuditLogs()} placeholder="Cari aktor, aksi, target ID…"
                      style={{ padding: "6px 12px 6px 32px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "12px", width: "190px" }}/>
                  </div>
                  <select value={auditActionFilter} onChange={e => setAuditActionFilter(e.target.value)} style={{ padding: "6px 10px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "12px" }}>
                    <option value="ALL">Semua Aksi</option>
                    <option value="CLAIM_INGESTED">CLAIM_INGESTED</option>
                    <option value="CASE_CREATED">CASE_CREATED</option>
                    <option value="CASE_ASSIGNED">CASE_ASSIGNED</option>
                    <option value="CASE_TRANSITIONED">CASE_TRANSITIONED</option>
                    <option value="HUMAN_REVIEW_RELEASE">HUMAN_REVIEW_RELEASE</option>
                    <option value="HUMAN_REVIEW_CLARIFY">HUMAN_REVIEW_CLARIFY</option>
                    <option value="HUMAN_REVIEW_ESCALATE_AUDIT">HUMAN_REVIEW_ESCALATE_AUDIT</option>
                    <option value="ADMIN_USER_CREATED">ADMIN_USER_CREATED</option>
                  </select>
                  <button className="button button-secondary" onClick={exportAuditCsv}>
                    <Download size={14}/> Unduh CSV
                  </button>
                  <button className="button button-secondary" onClick={fetchAuditLogs} disabled={auditLoading}><RefreshCw size={14} className={auditLoading ? "animate-spin" : ""}/>Segarkan</button>
                </div>
              }/>
            {!hasPermission(currentUser.role, ["view_audit"]) ? (
              <div className="card" style={{ padding: "24px", textAlign: "center" }}>
                <Lock size={32} style={{ color: "var(--muted)", marginBottom: "12px" }}/>
                <p style={{ color: "var(--muted)" }}>Role <RoleBadge role={currentUser.role}/> tidak memiliki akses ke log audit operasional.</p>
              </div>
            ) : auditLoading ? <LoadingSpinner/> : (
              <div className="card" style={{ padding: "0", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                  <thead><tr style={{ borderBottom: "1px solid var(--line)", background: "var(--surface)" }}>
                    {["Waktu", "Aktor", "Role", "Aksi", "Target", "Metadata"].map(h => (
                      <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: "11px", fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {auditLogs.length === 0 ? (
                      <tr><td colSpan={6} style={{ textAlign: "center", padding: "32px", color: "var(--muted)" }}>Belum ada log tersimpan</td></tr>
                    ) : auditLogs.map(l => (
                      <tr key={l.id} style={{ borderBottom: "1px solid var(--line)" }}>
                        <td style={{ padding: "8px 14px", whiteSpace: "nowrap" }}>{formatDate(l.timestamp)}</td>
                        <td style={{ padding: "8px 14px", fontWeight: 600 }}>{l.actorName}</td>
                        <td style={{ padding: "8px 14px" }}><RoleBadge role={l.actorRole}/></td>
                        <td style={{ padding: "8px 14px", fontFamily: "monospace", fontSize: "11px" }}>{l.action}</td>
                        <td style={{ padding: "8px 14px", fontFamily: "monospace", fontSize: "11px", maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis" }}>{l.targetId}</td>
                        <td style={{ padding: "8px 14px", fontSize: "10px", color: "var(--muted)", maxWidth: "240px", overflow: "hidden", textOverflow: "ellipsis" }}>{JSON.stringify(l.payload || {})}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  // ============================================================
  // SECTION: ADMINISTRATION
  // ============================================================

  const renderAdministration = () => (
    <div style={{ display: "flex", gap: "20px" }}>
      {currentUser.role !== "ADMINISTRATOR" && (
        <div className="card" style={{ padding: "24px", textAlign: "center", width: "100%" }}>
          <Lock size={32} style={{ color: "var(--muted)", marginBottom: "12px" }}/>
          <p style={{ color: "var(--muted)" }}>Panel Administrasi hanya dapat diakses oleh <strong>Administrator Sistem</strong>.</p>
          <p style={{ color: "var(--muted)", fontSize: "12px" }}>Role Anda saat ini: <RoleBadge role={currentUser.role}/></p>
        </div>
      )}
      {currentUser.role === "ADMINISTRATOR" && (
        <>
          <div style={{ width: "180px", flexShrink: 0 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {([["users", "Kelola Pengguna", <Users size={16}/>], ["health", "System Health", <Activity size={16}/>], ["audit_trail", "Audit Trail", <History size={16}/>]] as const).map(([v, l, ic]) => (
                <button key={v} onClick={() => setAdminView(v as AdminView)}
                  style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", borderRadius: "10px", border: "none", background: adminView === v ? "#e5f4ec" : "transparent", color: adminView === v ? "var(--dark-green)" : "#374151", fontWeight: adminView === v ? 700 : 500, fontSize: "13px", cursor: "pointer", textAlign: "left" }}>
                  <span style={{ color: adminView === v ? "var(--green)" : "var(--muted)" }}>{ic}</span>{l}
                </button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            {adminView === "users" && (
              <div>
                <SectionHeader title="Kelola Pengguna & RBAC" subtitle="Administrator tidak memiliki hak mengubah hasil investigasi atau menetapkan fraud"/>
                {userMgmtError && <div style={{ padding: "10px 14px", background: "#faecec", color: "#a53e3e", borderRadius: "12px", marginBottom: "12px", fontSize: "12px" }}>{userMgmtError}</div>}
                {userMgmtSuccess && <div style={{ padding: "10px 14px", background: "#d1fae5", color: "#059669", borderRadius: "12px", marginBottom: "12px", fontSize: "12px" }}>{userMgmtSuccess}</div>}
                <form onSubmit={handleCreateUser} className="card" style={{ padding: "18px", marginBottom: "16px" }}>
                  <strong style={{ display: "block", marginBottom: "12px" }}>Daftarkan Akun Baru</strong>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    {[["Username", newUsername, setNewUsername, "contoh: verifikator_jateng", "text"], ["Nama Lengkap", newFullName, setNewFullName, "contoh: Dr. Rina S.", "text"], ["Kata Sandi", newPassword, setNewPassword, "Min 8 karakter", "password"]].map(([label, val, setter, ph, type]) => (
                      <div key={label as string}>
                        <label style={{ fontSize: "11px", color: "var(--muted)", display: "block", marginBottom: "4px" }}>{label as string}:</label>
                        <input type={type as string} required value={val as string} onChange={e => (setter as any)(e.target.value)} placeholder={ph as string}
                          style={{ width: "100%", padding: "8px 12px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "12px" }}/>
                      </div>
                    ))}
                    <div>
                      <label style={{ fontSize: "11px", color: "var(--muted)", display: "block", marginBottom: "4px" }}>Peran:</label>
                      <select value={newRole} onChange={e => setNewRole(e.target.value as AppRole)} style={{ width: "100%", padding: "8px 12px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "12px" }}>
                        <option value="VERIFIKATOR">VERIFIKATOR — Tinjau & catat pemeriksaan</option>
                        <option value="INVESTIGATOR">INVESTIGATOR — Investigasi & susun temuan</option>
                        <option value="SUPERVISOR">SUPERVISOR — Pantau antrean & eskalasi</option>
                        <option value="DATA_ANALYST">DATA_ANALYST — Kualitas data & model</option>
                        <option value="ADMINISTRATOR">ADMINISTRATOR — Kelola sistem</option>
                      </select>
                    </div>
                  </div>
                  <button type="submit" className="button button-primary" style={{ marginTop: "12px" }}>Tambah Pengguna</button>
                </form>
                <div className="card" style={{ padding: "0", overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                    <thead><tr style={{ borderBottom: "1px solid var(--line)", background: "var(--surface)" }}>
                      {["Username", "Nama", "Peran", "Status", "Dibuat", "Aksi"].map(h => <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: "11px" }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {usersLoading ? <tr><td colSpan={6} style={{ textAlign: "center", padding: "24px" }}><RefreshCw size={18} className="animate-spin" style={{ color: "var(--green)" }}/></td></tr>
                      : managedUsers.map(u => (
                        <tr key={u.id} style={{ borderBottom: "1px solid var(--line)" }}>
                          <td style={{ padding: "10px 14px", fontFamily: "monospace", fontWeight: 700 }}>{u.username}</td>
                          <td style={{ padding: "10px 14px" }}>{u.fullName}</td>
                          <td style={{ padding: "10px 14px" }}><RoleBadge role={u.role}/></td>
                          <td style={{ padding: "10px 14px" }}><span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "8px", background: u.isActive ? "#d1fae5" : "#fee2e2", color: u.isActive ? "#059669" : "#dc2626" }}>{u.isActive ? "AKTIF" : "NONAKTIF"}</span></td>
                          <td style={{ padding: "10px 14px", fontSize: "11px", color: "var(--muted)" }}>{formatDate(u.createdAt)}</td>
                          <td style={{ padding: "10px 14px" }}>
                            <button onClick={() => toggleUserActive(u.id, u.isActive)} className="button button-secondary" style={{ minHeight: "28px", padding: "4px 10px", fontSize: "11px" }}>{u.isActive ? "Nonaktifkan" : "Aktifkan"}</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {adminView === "health" && (
              <div>
                <SectionHeader title="System Health" subtitle="Status layanan dan integrasi backend" action={<button className="button button-secondary" onClick={fetchHealth}><RefreshCw size={14}/>Cek Status</button>}/>
                {healthStatus ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                    {[
                      { name: "PostgreSQL Database", connected: isDbConnected, detail: healthStatus.database },
                      { name: "AI Service FastAPI (R-GCN)", connected: isAiConnected, detail: healthStatus.ai_engine || healthStatus.ai_service },
                    ].map(svc => (
                      <div key={svc.name} className="card" style={{ padding: "18px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <strong>{svc.name}</strong>
                          <span style={{ fontSize: "11px", fontWeight: 700, padding: "4px 12px", borderRadius: "20px", background: svc.connected ? "#d1fae5" : "#fee2e2", color: svc.connected ? "#059669" : "#dc2626" }}>{svc.connected ? "● AKTIF" : "● TIDAK TERHUBUNG"}</span>
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "8px", fontFamily: "monospace", wordBreak: "break-all" }}>{JSON.stringify(svc.detail)}</div>
                      </div>
                    ))}
                    <div className="card" style={{ padding: "18px", gridColumn: "1 / -1" }}>
                      <strong>Raw Health Response</strong>
                      <pre style={{ marginTop: "8px", fontSize: "11px", background: "#f9fafb", padding: "12px", borderRadius: "8px", overflow: "auto" }}>{JSON.stringify(healthStatus, null, 2)}</pre>
                    </div>
                  </div>
                ) : <EmptyState icon={<Activity size={48}/>} message="Belum ada data health" sub="Klik Cek Status"/>}
              </div>
            )}
            {adminView === "audit_trail" && (
              <div>
                <SectionHeader title="Audit Trail Lengkap" subtitle="Semua tindakan penting tercatat dengan aktor, role, dan timestamp"
                  action={
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                      <div style={{ position: "relative" }}>
                        <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }}/>
                        <input value={auditSearchQuery} onChange={e => setAuditSearchQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && fetchAuditLogs()} placeholder="Cari aktor, aksi, target ID…"
                          style={{ padding: "6px 12px 6px 32px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "12px", width: "190px" }}/>
                      </div>
                      <select value={auditActionFilter} onChange={e => setAuditActionFilter(e.target.value)} style={{ padding: "6px 10px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "12px" }}>
                        <option value="ALL">Semua Aksi</option>
                        <option value="CLAIM_INGESTED">CLAIM_INGESTED</option>
                        <option value="CASE_CREATED">CASE_CREATED</option>
                        <option value="CASE_ASSIGNED">CASE_ASSIGNED</option>
                        <option value="CASE_TRANSITIONED">CASE_TRANSITIONED</option>
                        <option value="HUMAN_REVIEW_RELEASE">HUMAN_REVIEW_RELEASE</option>
                        <option value="HUMAN_REVIEW_CLARIFY">HUMAN_REVIEW_CLARIFY</option>
                        <option value="HUMAN_REVIEW_ESCALATE_AUDIT">HUMAN_REVIEW_ESCALATE_AUDIT</option>
                        <option value="ADMIN_USER_CREATED">ADMIN_USER_CREATED</option>
                      </select>
                      <button className="button button-secondary" onClick={exportAuditCsv}>
                        <Download size={14}/> Unduh CSV
                      </button>
                      <button className="button button-secondary" onClick={fetchAuditLogs} disabled={auditLoading}><RefreshCw size={14} className={auditLoading ? "animate-spin" : ""}/>Segarkan</button>
                    </div>
                  }/>
                {auditLoading ? <LoadingSpinner/> : (
                  <div className="card" style={{ padding: "0", overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                      <thead><tr style={{ borderBottom: "1px solid var(--line)", background: "var(--surface)" }}>
                        {["Waktu", "Aktor", "Role", "Aksi", "Target ID", "Metadata"].map(h => <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: "11px" }}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {auditLogs.length === 0 ? <tr><td colSpan={6} style={{ textAlign: "center", padding: "32px", color: "var(--muted)" }}>Belum ada log tersimpan</td></tr>
                        : auditLogs.map(l => (
                          <tr key={l.id} style={{ borderBottom: "1px solid var(--line)" }}>
                            <td style={{ padding: "8px 14px", whiteSpace: "nowrap" }}>{formatDate(l.timestamp)}</td>
                            <td style={{ padding: "8px 14px", fontWeight: 600 }}>{l.actorName}</td>
                            <td style={{ padding: "8px 14px" }}><RoleBadge role={l.actorRole}/></td>
                            <td style={{ padding: "8px 14px", fontFamily: "monospace", fontSize: "11px" }}>{l.action}</td>
                            <td style={{ padding: "8px 14px", fontFamily: "monospace", fontSize: "11px", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis" }}>{l.targetId}</td>
                            <td style={{ padding: "8px 14px", fontSize: "10px", color: "var(--muted)", maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis" }}>{JSON.stringify(l.payload || {})}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );

  // ============================================================
  // MAIN RENDER
  // ============================================================

  const NAV_ITEMS: Array<{ key: NavSection; label: string; icon: React.ReactNode; roles: string[] }> = [
    { key: "overview", label: "Overview", icon: <LayoutGrid size={20}/>, roles: ["all"] },
    { key: "investigation", label: "Investigation", icon: <FolderOpen size={20}/>, roles: ["ADMINISTRATOR","VERIFIKATOR","INVESTIGATOR","SUPERVISOR","FRAUD_ANALYST","CLAIM_VERIFIER","AUDITOR"] },
    { key: "data_intelligence", label: "Data Intelligence", icon: <Database size={20}/>, roles: ["all"] },
    { key: "reports", label: "Reports", icon: <BarChart3 size={20}/>, roles: ["ADMINISTRATOR","SUPERVISOR","DATA_ANALYST","AUDITOR"] },
    { key: "administration", label: "Administration", icon: <Settings size={20}/>, roles: ["ADMINISTRATOR"] },
  ];

  return (
    <>
      {/* TOPBAR */}
      <header className="topbar">
        <div className="topbar-brand">
          <div className="brand" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <img src="/aura-jkn-logo.png" alt="AURA JKN" style={{ height: "40px", width: "auto", borderRadius: "8px", background: "#fff", padding: "2px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}/>
            <div>
              <div style={{ fontSize: "18px", fontWeight: 800, letterSpacing: "-0.5px", color: "#0F2942" }}>AURA <span style={{ color: "#0284C7" }}>JKN</span></div>
              <div style={{ fontSize: "8px", fontWeight: 700, letterSpacing: "1.5px", color: "#0284C7", textTransform: "uppercase" }}>Evidence-Linked Claim Intelligence</div>
            </div>
          </div>
        </div>

        <nav className="top-navigation" aria-label="Navigasi Utama">
          {NAV_ITEMS.filter(n => n.roles.includes("all") || n.roles.includes(currentUser.role)).map(n => (
            <button key={n.key} onClick={() => setActiveSection(n.key)} className={activeSection === n.key ? "active" : ""}>
              {n.label}
            </button>
          ))}
        </nav>

        <div className="topbar-actions">
          <button className="icon-button" title="Segarkan" onClick={fetchClaims} disabled={loading}>
            <RefreshCw size={18} className={loading ? "animate-spin text-green" : ""}/>
          </button>
          <div className="relative">
            <button className="button button-secondary" style={{ minHeight: "36px", padding: "6px 14px", fontSize: "12px", borderRadius: "20px" }} onClick={() => setRoleMenuOpen(v => !v)}>
              <UserCheck size={14} style={{ color: rCfg.color }}/><span>{rCfg.label}</span><ChevronDown size={13}/>
            </button>
            {roleMenuOpen && (
              <div className="card" style={{ position: "absolute", right: 0, top: "44px", zIndex: 50, padding: "8px", borderRadius: "16px", width: "240px", boxShadow: "0 10px 25px rgba(0,0,0,0.12)" }}>
                <div style={{ padding: "6px 10px", fontSize: "10px", color: "var(--muted)", fontWeight: 700 }}>GANTI PERAN RBAC:</div>
                {(["ADMINISTRATOR","VERIFIKATOR","INVESTIGATOR","SUPERVISOR","DATA_ANALYST"] as const).map(role => {
                  const cfg = ROLE_CONFIG[role];
                  return (
                    <button key={role} onClick={() => switchRole(role)} style={{ width: "100%", textAlign: "left", padding: "8px 12px", borderRadius: "10px", fontSize: "12px", fontWeight: currentUser.role === role ? 700 : 400, color: currentUser.role === role ? cfg.color : "#374151", background: currentUser.role === role ? cfg.bg : "transparent", cursor: "pointer", border: "none" }}>
                      <div style={{ fontWeight: 700 }}>{cfg.label}</div>
                      <div style={{ fontSize: "10px", color: "var(--muted)", fontWeight: 400 }}>{cfg.description}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="topbar-divider"/>
          <button className="profile-button" title={currentUser.fullName}>
            <span className="avatar avatar-profile" style={{ background: rCfg.bg, color: rCfg.color, border: `2px solid ${rCfg.color}` }}>
              {currentUser.fullName.substring(0, 2).toUpperCase()}
            </span>
          </button>
        </div>
      </header>

      {/* SIDEBAR */}
      <aside className="sidebar" aria-label="Navigasi cepat">
        <nav className="sidebar-group">
          {NAV_ITEMS.filter(n => n.roles.includes("all") || n.roles.includes(currentUser.role)).map(n => (
            <button key={n.key} title={n.label} aria-label={n.label} onClick={() => setActiveSection(n.key)} className={activeSection === n.key ? "active" : ""}>
              {n.icon}<span className="sidebar-tooltip">{n.label}</span>
            </button>
          ))}
        </nav>
        <nav className="sidebar-group">
          <button title="Simulasi Klaim Baru" onClick={() => setShowSimulatorModal(true)}>
            <PlusCircle size={20} strokeWidth={1.6}/><span className="sidebar-tooltip">Simulasi Klaim Baru</span>
          </button>
          <button title="Zero Mock Data Policy" onClick={() => alert("AURA-JKN Zero Mock Policy Aktif: Semua data berasal dari PostgreSQL aktual. Tidak ada skor, graf, atau metrik yang direkayasa.")}>
            <ShieldCheck size={20} strokeWidth={1.6} style={{ color: "var(--green)" }}/><span className="sidebar-tooltip">Zero Mock Policy Aktif</span>
          </button>
        </nav>
        <nav className="sidebar-group sidebar-bottom">
          <button title="Database" onClick={fetchClaims}>
            <Database size={20} strokeWidth={1.6}/><span className="sidebar-tooltip">{data?.summary.total_claims?.toLocaleString("id-ID") ?? "—"} Klaim di DB</span>
          </button>
        </nav>
      </aside>

      {/* MAIN CONTENT */}
      <main id="main-content" className="main-content">
        {/* Global Review Banner */}
        {reviewBanner && activeSection !== "investigation" && (
          <div style={{ padding: "12px 16px", borderRadius: "12px", marginBottom: "16px", background: reviewBanner.success ? "#d1fae5" : "#fee2e2", color: reviewBanner.success ? "#059669" : "#dc2626", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "13px", fontWeight: 600 }}>{reviewBanner.message}</span>
            <button onClick={() => setReviewBanner(null)} className="icon-button"><X size={14}/></button>
          </div>
        )}

        {/* Section Router */}
        {activeSection === "overview" && renderOverview()}
        {activeSection === "investigation" && renderInvestigation()}
        {activeSection === "data_intelligence" && renderDataIntelligence()}
        {activeSection === "reports" && renderReports()}
        {activeSection === "administration" && renderAdministration()}
      </main>

      {/* SIMULATOR MODAL */}
      <LiveClaimSimulatorModal
        isOpen={showSimulatorModal}
        onClose={() => setShowSimulatorModal(false)}
        backendUrl={BACKEND_URL}
        authToken={currentUser.token}
        onClaimCreated={() => {
          fetchClaims();
          fetchCases();
        }}
      />
    </>
  );
}

export default App;
