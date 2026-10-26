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
  BookOpen, Target, Award, Download, Monitor, LogOut, Wifi, WifiOff,
  Menu
} from "lucide-react";
import { ClaimRecord, ClaimsListResponse, SubgraphNode, SubgraphEdge, AppNotificationItem } from "./types/aura";
import { SubgraphViewer } from "./components/SubgraphViewer";
import { LiveClaimSimulatorModal } from "./components/LiveClaimSimulatorModal";
import { ControlledFeedbackPanel } from "./components/ControlledFeedbackPanel";
import { DesktopInstallModal } from "./components/DesktopInstallModal";
import { NotificationCenter } from "./components/NotificationCenter";
import { LoginPage } from "./components/LoginPage";
import {
  SkeletonBox,
  SkeletonText,
  SkeletonBadge,
  SkeletonMetricCard,
  SkeletonCardsGrid,
  SkeletonTable,
  SkeletonCaseQueue,
  SkeletonClaimsExplorer,
  SkeletonEvidenceCenter,
  SkeletonGraphView,
  SkeletonDataIngestion,
  SkeletonPerformanceDashboard,
  SkeletonUserRows,
  SkeletonHealthStatus,
} from "./components/SkeletonLoaders";

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
  ADMINISTRATOR: { label: "Administrator Keamanan Sistem", color: "#334155", bg: "#f1f5f9", description: "Tupoksi: Kelola hak akses akun & integritas gerbang sistem" },
  VERIFIKATOR:   { label: "Petugas Verifikator Klaim",     color: "#0369a1", bg: "#e0f2fe", description: "Tupoksi: Telaah keabsahan berkas, tarif INA-CBG & pra-pembayaran" },
  INVESTIGATOR:  { label: "Investigator & Analis Anti-Fraud", color: "#b45309", bg: "#fef3c7", description: "Tupoksi: Telusuri anomali relasi faskes-dokter & pemeriksaan lapangan" },
  SUPERVISOR:    { label: "Supervisor Antrean & Eskalasi",  color: "#098a58", bg: "#e6efe6", description: "Tupoksi: Pantau beban tim, bagi tugas berkas & putusan eskalasi" },
  DATA_ANALYST:  { label: "Analis Mutu Data & Sistem",     color: "#1e3a5f", bg: "#eaf0f6", description: "Tupoksi: Pantau mutu data klaim & evaluasi akurasi sistem cerdas" },
  // Legacy
  FRAUD_ANALYST: { label: "Investigator & Analis Anti-Fraud", color: "#b45309", bg: "#fef3c7", description: "Pemeriksaan Anomali" },
  CLAIM_VERIFIER:{ label: "Petugas Verifikator Klaim",     color: "#0369a1", bg: "#e0f2fe", description: "Verifikasi Berkas" },
  AUDITOR:       { label: "Analis Mutu Data & Sistem",     color: "#1e3a5f", bg: "#eaf0f6", description: "Kajian Kinerja" },
};

const ROLE_SHORT_LABELS: Record<string, string> = {
  ADMINISTRATOR: "Admin",
  VERIFIKATOR: "Verifikator",
  INVESTIGATOR: "Investigator",
  SUPERVISOR: "Supervisor",
  DATA_ANALYST: "Analis Data",
  FRAUD_ANALYST: "Investigator",
  CLAIM_VERIFIER: "Verifikator",
  AUDITOR: "Analis Data",
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  NEW:               { label: "Klaim Masuk", color: "#64748b", bg: "#f1f5f9", icon: <Inbox size={12}/> },
  FLAGGED_FOR_REVIEW:{ label: "Menunggu Telaah", color: "#b45309", bg: "#fef3c7", icon: <AlertTriangle size={12}/> },
  UNDER_REVIEW:      { label: "Sedang Ditelaah", color: "#0369a1", bg: "#e0f2fe", icon: <Eye size={12}/> },
  AWAITING_EVIDENCE: { label: "Menunggu Bukti Faskes", color: "#475569", bg: "#f1f5f9", icon: <HelpCircle size={12}/> },
  ESCALATED:         { label: "Dieskalasi ke Supervisor", color: "#c95353", bg: "#faecec", icon: <ArrowUpRight size={12}/> },
  RESOLVED:          { label: "Selesai Diputuskan", color: "#098a58", bg: "#e6efe6", icon: <CheckCircle2 size={12}/> },
  CLOSED:            { label: "Berkas Selesai / Ditutup", color: "#64748b", bg: "#f1f5f9", icon: <Lock size={12}/> },
};

const WORKFLOW_STEPS: Array<{
  key: string;
  stepNumber: number;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  description: string;
}> = [
  {
    key: "NEW",
    stepNumber: 1,
    label: "Klaim Masuk",
    shortLabel: "1. Masuk",
    icon: <Inbox size={13} />,
    color: "#64748b",
    bg: "#f1f5f9",
    description: "Penerimaan berkas",
  },
  {
    key: "FLAGGED_FOR_REVIEW",
    stepNumber: 2,
    label: "Menunggu Telaah",
    shortLabel: "2. Antrean",
    icon: <AlertTriangle size={13} />,
    color: "#b45309",
    bg: "#fef3c7",
    description: "Tertahan penapisan",
  },
  {
    key: "UNDER_REVIEW",
    stepNumber: 3,
    label: "Sedang Ditelaah",
    shortLabel: "3. Penelaahan",
    icon: <Eye size={13} />,
    color: "#0369a1",
    bg: "#e0f2fe",
    description: "Pemeriksaan medis",
  },
  {
    key: "AWAITING_EVIDENCE",
    stepNumber: 4,
    label: "Menunggu Bukti",
    shortLabel: "4. Bukti RS",
    icon: <HelpCircle size={13} />,
    color: "#475569",
    bg: "#f1f5f9",
    description: "Konfirmasi faskes",
  },
  {
    key: "ESCALATED",
    stepNumber: 5,
    label: "Dieskalasi",
    shortLabel: "5. Eskalasi",
    icon: <ArrowUpRight size={13} />,
    color: "#c95353",
    bg: "#faecec",
    description: "Kajian supervisor",
  },
  {
    key: "RESOLVED",
    stepNumber: 6,
    label: "Selesai Diputuskan",
    shortLabel: "6. Putusan",
    icon: <CheckCircle2 size={13} />,
    color: "#098a58",
    bg: "#e6efe6",
    description: "Ketetapan sah",
  },
  {
    key: "CLOSED",
    stepNumber: 7,
    label: "Berkas Ditutup",
    shortLabel: "7. Arsip",
    icon: <Lock size={13} />,
    color: "#64748b",
    bg: "#f1f5f9",
    description: "Arsip pemeriksaan",
  },
];


const PRIORITY_CONFIG: Record<string, { color: string; bg: string; dot: string; label: string }> = {
  HIGH:   { color: "#c95353", bg: "#faecec", dot: "#c95353", label: "Prioritas Tinggi" },
  MEDIUM: { color: "#b45309", bg: "#fef3c7", dot: "#b45309", label: "Prioritas Sedang" },
  LOW:    { color: "#098a58", bg: "#e6efe6", dot: "#098a58", label: "Prioritas Wajar" },
};

const OUTCOME_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  REFERRED_FOR_ACTION:   { label: "Direkomendasikan Penyesuaian Klaim / Tindak Lanjut", color: "#c95353", bg: "#faecec" },
  CLEARED:               { label: "Klaim Sah & Layak Bayar (Disetujui)", color: "#098a58", bg: "#e6efe6" },
  INSUFFICIENT_EVIDENCE: { label: "Bukti Medis Belum Cukup Memadai", color: "#b45309", bg: "#fef3c7" },
  CLOSED_ADMINISTRATIVE: { label: "Ditutup Secara Administratif", color: "#64748b", bg: "#f1f5f9" },
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

const DEFAULT_ACCOUNTS: Record<AppRole, { username: string; defaultPassword: string; label: string }> = {
  ADMINISTRATOR: { username: "admin_aura", defaultPassword: "admin_password_2026", label: "Administrator Keamanan Sistem" },
  VERIFIKATOR:   { username: "verifier_aura", defaultPassword: "verifier_password_2026", label: "Petugas Verifikator Klaim" },
  INVESTIGATOR:  { username: "investigator_aura", defaultPassword: "investigator_password_2026", label: "Investigator & Analis Anti-Fraud" },
  SUPERVISOR:    { username: "supervisor_aura", defaultPassword: "supervisor_password_2026", label: "Supervisor Antrean & Eskalasi" },
  DATA_ANALYST:  { username: "analyst_aura", defaultPassword: "analyst_password_2026", label: "Analis Mutu Data & Sistem" },
};

// ============================================================
// MAIN APP
// ============================================================

export function App() {
  const NAV_ITEMS: Array<{ key: NavSection; label: string; icon: React.ReactNode; roles: string[] }> = [
    { key: "overview", label: "Beranda Utama", icon: <LayoutGrid size={20}/>, roles: ["all"] },
    { key: "investigation", label: "Pemeriksaan Klaim", icon: <FolderOpen size={20}/>, roles: ["ADMINISTRATOR","VERIFIKATOR","INVESTIGATOR","SUPERVISOR","FRAUD_ANALYST","CLAIM_VERIFIER","AUDITOR"] },
    { key: "data_intelligence", label: "Pusat Data & Mutu", icon: <Database size={20}/>, roles: ["all"] },
    { key: "reports", label: "Laporan & Kinerja", icon: <BarChart3 size={20}/>, roles: ["ADMINISTRATOR","SUPERVISOR","DATA_ANALYST","AUDITOR"] },
    { key: "administration", label: "Administrasi Sistem", icon: <Settings size={20}/>, roles: ["ADMINISTRATOR"] },
  ];

  // Helper to parse initial route from URL hash or sessionStorage
  const getInitialNav = () => {
    try {
      if (typeof window !== "undefined") {
        const hash = window.location.hash.replace(/^#\/?/, "");
        if (hash) {
          const [secPart, queryPart] = hash.split("?");
          const validSections: NavSection[] = [
            "overview",
            "investigation",
            "data_intelligence",
            "reports",
            "administration",
          ];
          if (validSections.includes(secPart as NavSection)) {
            const params = new URLSearchParams(queryPart || "");
            return {
              section: secPart as NavSection,
              subView: params.get("view") || null,
              claimId: params.get("claimId") || null,
              caseId: params.get("caseId") || null,
            };
          }
        }
        const savedSection = sessionStorage.getItem("aura_nav_section") as NavSection | null;
        const validSections: NavSection[] = [
          "overview",
          "investigation",
          "data_intelligence",
          "reports",
          "administration",
        ];
        if (savedSection && validSections.includes(savedSection)) {
          return {
            section: savedSection,
            subView: sessionStorage.getItem("aura_sub_view") || null,
            claimId: sessionStorage.getItem("aura_selected_claim_id") || null,
            caseId: sessionStorage.getItem("aura_selected_case_id") || null,
          };
        }
      }
    } catch {
      // fallback
    }
    return { section: "overview" as NavSection, subView: null, claimId: null, caseId: null };
  };

  const initialNav = getInitialNav();

  // Auth state — P0 Security: Must have verified cryptographic token
  const [currentUser, setCurrentUser] = useState<CurrentUser>({
    id: "",
    username: "",
    fullName: "",
    role: "VERIFIKATOR",
    token: "",
  });
  const [authChecking, setAuthChecking] = useState<boolean>(true);
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [profileMenuOpen, setProfileMenuOpen] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [mobileExplorerTab, setMobileExplorerTab] = useState<"list" | "detail">("list");

  // Navigation state — persisten di URL hash & sessionStorage (tetap di halaman saat di-refresh)
  const [activeSection, setActiveSection] = useState<NavSection>(() => initialNav.section);
  const [investigationView, setInvestigationView] = useState<InvestigationView>(() =>
    initialNav.section === "investigation" && initialNav.subView
      ? (initialNav.subView as InvestigationView)
      : (sessionStorage.getItem("aura_nav_inv_view") as InvestigationView) || "queue"
  );
  const [dataView, setDataView] = useState<DataView>(() =>
    initialNav.section === "data_intelligence" && initialNav.subView
      ? (initialNav.subView as DataView)
      : (sessionStorage.getItem("aura_nav_data_view") as DataView) || "ingestion"
  );
  const [reportsView, setReportsView] = useState<ReportsView>(() =>
    initialNav.section === "reports" && initialNav.subView
      ? (initialNav.subView as ReportsView)
      : (sessionStorage.getItem("aura_nav_reports_view") as ReportsView) || "performance"
  );
  const [adminView, setAdminView] = useState<AdminView>(() =>
    initialNav.section === "administration" && initialNav.subView
      ? (initialNav.subView as AdminView)
      : (sessionStorage.getItem("aura_nav_admin_view") as AdminView) || "users"
  );

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

  // Desktop PWA & Tauri install states
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isDesktopStandalone, setIsDesktopStandalone] = useState<boolean>(false);
  const [showDesktopModal, setShowDesktopModal] = useState<boolean>(false);

  // Operational Notifications state
  const [notifications, setNotifications] = useState<AppNotificationItem[]>([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState<number>(0);
  const [showNotifCenter, setShowNotifCenter] = useState<boolean>(false);

  const authHeaders = useCallback(() => ({
    "Content-Type": "application/json",
    ...(currentUser.token ? { Authorization: `Bearer ${currentUser.token}` } : {}),
  }), [currentUser.token]);

  // ============================================================
  // API FUNCTIONS
  // ============================================================

  const switchRole = async (targetRole: AppRole) => {
    const creds = DEFAULT_ACCOUNTS[targetRole];
    let authenticated = false;

    // 1. Primary: Attempt authoritative login via /api/auth/login using seeded credentials
    try {
      const loginRes = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: creds.username,
          password: creds.defaultPassword,
        }),
      });
      if (loginRes.ok) {
        const json = await loginRes.json();
        setCurrentUser({
          id: json.user.id,
          username: json.user.username,
          fullName: json.user.fullName,
          role: json.user.role,
          token: json.token,
        });
        sessionStorage.setItem("aura_token", json.token);
        authenticated = true;
      }
    } catch {
      // Login route failed, proceed to demo-token fallback
    }

    // 2. Secondary: Fallback to demo-token if enabled in non-production
    if (!authenticated) {
      try {
        const demoRes = await fetch(`${BACKEND_URL}/api/auth/demo-token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: targetRole }),
        });
        if (demoRes.ok) {
          const json = await demoRes.json();
          setCurrentUser({
            id: json.user.id,
            username: json.user.username,
            fullName: json.user.fullName,
            role: json.user.role,
            token: json.token,
          });
          sessionStorage.setItem("aura_token", json.token);
          authenticated = true;
        }
      } catch {
        // Fallback failed
      }
    }

    if (!authenticated) {
      setCurrentUser({
        id: "unauthenticated",
        username: "unauthenticated",
        fullName: "Sesi Tidak Terautentikasi (Login Diperlukan)",
        role: targetRole,
        token: "",
      });
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

  useEffect(() => {
    const savedToken = sessionStorage.getItem("aura_token");
    if (savedToken) {
      fetch(`${BACKEND_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${savedToken}` },
      })
        .then(res => (res.ok ? res.json() : null))
        .then(json => {
          if (json?.user) {
            setCurrentUser({
              id: json.user.id,
              username: json.user.username,
              fullName: json.user.fullName,
              role: json.user.role,
              token: savedToken,
            });
          } else {
            sessionStorage.removeItem("aura_token");
            setCurrentUser({
              id: "",
              username: "",
              fullName: "",
              role: "VERIFIKATOR",
              token: "",
            });
          }
        })
        .catch(() => {
          sessionStorage.removeItem("aura_token");
          setCurrentUser({
            id: "",
            username: "",
            fullName: "",
            role: "VERIFIKATOR",
            token: "",
          });
        })
        .finally(() => {
          setAuthChecking(false);
        });
    } else {
      setAuthChecking(false);
      setCurrentUser({
        id: "",
        username: "",
        fullName: "",
        role: "VERIFIKATOR",
        token: "",
      });
    }
  }, []);

  // Online / Offline Connectivity Detection
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleLogout = () => {
    sessionStorage.removeItem("aura_token");
    sessionStorage.removeItem("aura_nav_section");
    sessionStorage.removeItem("aura_sub_view");
    sessionStorage.removeItem("aura_selected_case_id");
    sessionStorage.removeItem("aura_selected_claim_id");
    setCurrentUser({
      id: "",
      username: "",
      fullName: "",
      role: "VERIFIKATOR",
      token: "",
    });
    setProfileMenuOpen(false);
    if (typeof window !== "undefined") {
      window.location.hash = "";
    }
  };

  // Desktop PWA install detection
  useEffect(() => {
    const isStandaloneMode =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    setIsDesktopStandalone(isStandaloneMode);

    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };

    const handleAppInstalled = () => {
      setInstallPrompt(null);
      setIsDesktopStandalone(true);
      console.log("[AURA-JKN] Aplikasi Desktop PWA berhasil dipasang!");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleTriggerDesktopInstall = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice && choice.outcome === "accepted") {
        setInstallPrompt(null);
        setIsDesktopStandalone(true);
      }
    }
  };

  // Operational Notification Fetching & Handlers
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/notifications?role=${currentUser.role}`, {
        headers: authHeaders(),
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json?.notifications) {
        let storedReadIds: string[] = [];
        try {
          storedReadIds = JSON.parse(localStorage.getItem("aura_read_notifs") || "[]");
        } catch {
          storedReadIds = [];
        }
        const readSet = new Set(storedReadIds);
        const list: AppNotificationItem[] = json.notifications.map((n: AppNotificationItem) => ({
          ...n,
          isRead: readSet.has(n.id),
        }));
        setNotifications(list);
        const unread = list.filter(n => !n.isRead).length;
        setUnreadNotifCount(unread);
      }
    } catch (err) {
      console.warn("[AURA-JKN] Gagal sinkronisasi notifikasi:", err);
    }
  }, [BACKEND_URL, currentUser.role, authHeaders]);

  const handleMarkAsRead = useCallback((id: string) => {
    try {
      let stored: string[] = [];
      try {
        stored = JSON.parse(localStorage.getItem("aura_read_notifs") || "[]");
      } catch {
        stored = [];
      }
      if (!stored.includes(id)) {
        stored.push(id);
        localStorage.setItem("aura_read_notifs", JSON.stringify(stored));
      }
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadNotifCount(prev => Math.max(0, prev - 1));

      fetch(`${BACKEND_URL}/api/notifications`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ action: "mark_read", id }),
      }).catch(() => {});
    } catch (e) {
      console.warn("Gagal update status baca notifikasi:", e);
    }
  }, [BACKEND_URL, authHeaders]);

  const handleMarkAllAsRead = useCallback(() => {
    try {
      const allIds = notifications.map(n => n.id);
      localStorage.setItem("aura_read_notifs", JSON.stringify(allIds));
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadNotifCount(0);

      fetch(`${BACKEND_URL}/api/notifications`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ action: "mark_all_read" }),
      }).catch(() => {});
    } catch (e) {
      console.warn("Gagal tandai semua dibaca:", e);
    }
  }, [BACKEND_URL, notifications, authHeaders]);

  const handleNotificationNavigate = (
    section: NavSection,
    subView?: string,
    targetId?: string
  ) => {
    setActiveSection(section);
    if (section === "investigation") {
      if (subView) setInvestigationView(subView as InvestigationView);
      if (targetId) {
        const foundCase = cases.find(c => c.id === targetId || c.claim_id === targetId);
        if (foundCase) {
          setSelectedCase(foundCase);
        } else if (data?.claims) {
          const foundClaim = data.claims.find(cl => cl.claim_id === targetId);
          if (foundClaim) {
            setSelectedClaim(foundClaim);
          }
        }
      }
    } else if (section === "data_intelligence") {
      if (subView) setDataView(subView as DataView);
    } else if (section === "administration") {
      if (subView) setAdminView(subView as AdminView);
    } else if (section === "reports") {
      if (subView) setReportsView(subView as ReportsView);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    fetchNotifications();
    const timer = setInterval(() => {
      fetchNotifications();
    }, 30000);
    return () => clearInterval(timer);
  }, [fetchNotifications]);

  // Synchronize navigation state with URL Hash and sessionStorage
  useEffect(() => {
    let subView: string = "";
    if (activeSection === "investigation") subView = investigationView;
    else if (activeSection === "data_intelligence") subView = dataView;
    else if (activeSection === "reports") subView = reportsView;
    else if (activeSection === "administration") subView = adminView;

    // Persist to sessionStorage
    sessionStorage.setItem("aura_nav_section", activeSection);
    sessionStorage.setItem("aura_sub_view", subView);
    sessionStorage.setItem("aura_nav_inv_view", investigationView);
    sessionStorage.setItem("aura_nav_data_view", dataView);
    sessionStorage.setItem("aura_nav_reports_view", reportsView);
    sessionStorage.setItem("aura_nav_admin_view", adminView);

    // Build URL hash
    let hash = `#${activeSection}`;
    const params = new URLSearchParams();
    if (subView) params.set("view", subView);
    if (selectedCase?.id) params.set("caseId", selectedCase.id);
    if (selectedClaim?.claim_id) params.set("claimId", selectedClaim.claim_id);

    const queryStr = params.toString();
    if (queryStr) hash += `?${queryStr}`;

    if (typeof window !== "undefined" && window.location.hash !== hash) {
      window.history.replaceState(null, "", hash);
    }
  }, [activeSection, investigationView, dataView, reportsView, adminView, selectedCase?.id, selectedClaim?.claim_id]);

  // Listen for browser Back/Forward (popstate & hashchange)
  useEffect(() => {
    const handlePopState = () => {
      const parsed = getInitialNav();
      setActiveSection(parsed.section);
      if (parsed.subView) {
        if (parsed.section === "investigation") setInvestigationView(parsed.subView as InvestigationView);
        if (parsed.section === "data_intelligence") setDataView(parsed.subView as DataView);
        if (parsed.section === "reports") setReportsView(parsed.subView as ReportsView);
        if (parsed.section === "administration") setAdminView(parsed.subView as AdminView);
      }
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("hashchange", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("hashchange", handlePopState);
    };
  }, []);

  // Role section access guard: fallback if user switches role and current section is disallowed
  useEffect(() => {
    const item = NAV_ITEMS.find(n => n.key === activeSection);
    if (item && !item.roles.includes("all") && !item.roles.includes(currentUser.role)) {
      setActiveSection("overview");
    }
  }, [currentUser.role, activeSection]);

  // Auto-restore selected case/claim from URL/sessionStorage if present
  useEffect(() => {
    if (cases.length > 0 && !selectedCase) {
      const urlParams = new URLSearchParams(window.location.hash.split("?")[1] || "");
      const targetCaseId = urlParams.get("caseId") || sessionStorage.getItem("aura_selected_case_id");
      if (targetCaseId) {
        const found = cases.find(c => c.id === targetCaseId || c.claim_id === targetCaseId || c.case_number === targetCaseId);
        if (found) setSelectedCase(found);
      }
    }
  }, [cases, selectedCase]);

  useEffect(() => {
    if (data?.claims?.length && !selectedClaim) {
      const urlParams = new URLSearchParams(window.location.hash.split("?")[1] || "");
      const targetClaimId = urlParams.get("claimId") || sessionStorage.getItem("aura_selected_claim_id");
      if (targetClaimId) {
        const found = data.claims.find(c => c.claim_id === targetClaimId);
        if (found) setSelectedClaim(found);
      }
    }
  }, [data?.claims, selectedClaim]);
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
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.dot, display: "inline-block" }}/>{cfg.label || priority}
    </span>;
  };

  const MetricCard = ({ title, value, subtitle, color, icon, className = "" }: { title: string; value: string | number | null; subtitle?: string; color?: string; icon: React.ReactNode; className?: string }) => (
    <div className={`card card-interactive animate-fade-in ${className}`} style={{ padding: "18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
        <span className="eyebrow" style={{ color: color || undefined }}>{title}</span>
        <span className="metric-icon-animated" style={{ color: color || "var(--green)", opacity: 0.85, transition: "transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), color 0.28s cubic-bezier(0.16, 1, 0.3, 1)", display: "inline-flex" }}>{icon}</span>
      </div>
      <div style={{ fontSize: "26px", fontWeight: 800, letterSpacing: "-1px", color: color || "inherit" }}>
        {value !== null && value !== undefined ? value : <span style={{ fontSize: "14px", color: "var(--muted)", fontWeight: 500 }}>Belum Tersedia</span>}
      </div>
      {subtitle && <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "6px" }}>{subtitle}</div>}
    </div>
  );

  const SectionHeader = ({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) => (
    <div className="animate-fade-in" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
      <div>
        <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 800 }}>{title}</h1>
        {subtitle && <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--muted)" }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );

  const EmptyState = ({ icon, message, sub, action }: { icon: React.ReactNode; message: string; sub?: string; action?: React.ReactNode }) => (
    <div
      className="card empty-state-container animate-fade-in"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "48px 24px",
        margin: "12px 0",
        borderRadius: "16px",
        background: "#ffffff",
        border: "1px dashed var(--border, #d1d5db)",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <div
        className="empty-state-icon"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "14px",
          opacity: 0.6,
          color: "var(--green)",
        }}
      >
        {icon}
      </div>
      <div style={{ fontWeight: 700, fontSize: "15px", color: "var(--text)", marginBottom: "6px" }}>{message}</div>
      {sub && <div style={{ fontSize: "13px", maxWidth: "480px", lineHeight: 1.5, color: "var(--muted)" }}>{sub}</div>}
      {action && <div style={{ marginTop: "16px" }}>{action}</div>}
    </div>
  );

  const getEffectiveSubgraph = useCallback((claim: ClaimRecord | null): { nodes: SubgraphNode[]; edges: SubgraphEdge[] } => {
    if (!claim) return { nodes: [], edges: [] };
    const existingNodes = claim.xai_explanation?.subgraph_evidence?.nodes || [];
    const existingEdges = claim.xai_explanation?.subgraph_evidence?.edges || [];
    if (existingNodes.length > 0) {
      return { nodes: existingNodes, edges: existingEdges };
    }
    const isConflict = Boolean(claim.spatiotemporal_metrics?.spatial_conflict_detected || claim.fraud_scenario === "C");
    const nodes: SubgraphNode[] = [
      {
        id: claim.claim_id,
        type: "claim",
        label: `Berkas ${claim.claim_id} (FRI: ${claim.fraud_risk_index ?? "--"})`,
      },
      {
        id: claim.doctor_id || "DPJP_UTAMA",
        type: "doctor",
        label: `Dokter ${claim.doctor_id || "DPJP"} (${claim.specialty || "Spesialis"})`,
      },
      {
        id: claim.facility_id || "FASKES_MITRA",
        type: "facility",
        label: `Faskes ${claim.facility_id || "Mitra"} (${claim.facility_class || "FKRTL"})`,
      },
      {
        id: claim.patient_id ? `${claim.patient_id.slice(0, 12)}...` : "PESERTA_BPJS",
        type: "patient",
        label: `Peserta ${claim.patient_id ? claim.patient_id.slice(0, 10) : "Anonim"} (${claim.home_region || "Nasional"})`,
      },
      {
        id: claim.icd10_code || "ICD10",
        type: "diagnosis",
        label: `Diagnosis ${claim.icd10_code || "Klinis"}`,
      },
    ];

    const edges: SubgraphEdge[] = [
      { source: claim.doctor_id || "DPJP_UTAMA", target: claim.claim_id, relation: "authorized" },
      { source: claim.claim_id, target: claim.icd10_code || "ICD10", relation: "has_diagnosis" },
      { source: claim.patient_id ? `${claim.patient_id.slice(0, 12)}...` : "PESERTA_BPJS", target: claim.doctor_id || "DPJP_UTAMA", relation: "examined_by" },
      { source: claim.patient_id ? `${claim.patient_id.slice(0, 12)}...` : "PESERTA_BPJS", target: claim.facility_id || "FASKES_MITRA", relation: "referred_to" },
      { source: claim.claim_id, target: claim.facility_id || "FASKES_MITRA", relation: "admitted_at" },
    ];

    if (isConflict) {
      const conflictFacId = `FAC_KONFLIK_${claim.facility_id ? claim.facility_id.slice(-4) : "SEKUNDER"}`;
      nodes.push({
        id: conflictFacId,
        type: "facility",
        label: `Konflik Lokasi: Faskes Kedua (${claim.service_date || "Pelayanan Simultan"})`,
      });
      edges.push({
        source: claim.doctor_id || "DPJP_UTAMA",
        target: conflictFacId,
        relation: "concurrent_practice_conflict",
      });
    }

    return { nodes, edges };
  }, []);

  const LoadingSpinner = () => (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "40px" }}>
      <RefreshCw size={24} className="animate-spin" style={{ color: "var(--green)" }} />
    </div>
  );

  const DataSourceBanner = ({ error }: { error: string }) => (
    <div className="card" style={{ background: "#faecec", borderColor: "#eec5c5", color: "#a53e3e", marginBottom: "16px", padding: "14px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", fontWeight: 700, fontSize: "13px" }}>
        <AlertTriangle size={16}/> Sumber Data Tidak Tersedia (Prinsip Integritas Data)
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
        subtitle="Beranda Operasional AURA-JKN — Platform Cerdas Skrining dan Penelaahan Klaim Berbasis Bukti Pelayanan"
        action={
          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <div className="card" style={{ padding: "6px 14px", borderRadius: "30px", display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", fontWeight: 600 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: isDbConnected ? "var(--green)" : "#dc2626" }}/>
              {isDbConnected ? "Pangkalan Data Resmi Aktif" : "Periksa Status Layanan"}
            </div>
            <button className="button button-secondary" onClick={() => setShowSimulatorModal(true)}>
              <PlusCircle size={14}/> Simulasi Pemasukan Klaim
            </button>
            <button className="button button-primary" onClick={() => { setActiveSection("investigation"); setInvestigationView("queue"); }}>
              <Inbox size={14}/> Buka Antrean Kasus
            </button>
          </div>
        }
      />

      {/* KPI Cards */}
      {loading && !data ? (
        <>
          <SkeletonCardsGrid count={4} />
          <SkeletonCardsGrid count={4} />
        </>
      ) : (
        <>
          <div className="grid-responsive-cards">
            <MetricCard className="stagger-1" title="TOTAL KLAIM TERDAFTAR" value={data?.summary.total_claims?.toLocaleString("id-ID") || "—"} subtitle={`Rata-rata Indeks Risiko: ${data?.summary.avg_fri ?? "—"} • Pangkalan Data Resmi`} icon={<Database size={18}/>}/>
            <MetricCard className="stagger-2" title="INDIKASI ANOMALI TINGGI" value={data?.summary.high_risk_count?.toLocaleString("id-ID") || "—"} subtitle="Prioritas telaah berkas oleh petugas" color="#c95353" icon={<ShieldAlert size={18}/>}/>
            <MetricCard className="stagger-3" title="KASUS DALAM ANTREAN" value={perfData?.investigation?.open_cases ?? (caseQueueSummary.FLAGGED_FOR_REVIEW || 0)} subtitle="Berkas aktif menanti tindak lanjut" color="#b45309" icon={<ClipboardList size={18}/>}/>
            <MetricCard className="stagger-4" title="KLAIM SELESAI DIPERIKSA" value={perfData?.investigation?.throughput_all_time ?? "—"} subtitle="Total perkara telah diputuskan resmi" color="#098a58" icon={<CheckCircle2 size={18}/>}/>
          </div>

          {/* Second row */}
          <div className="grid-responsive-cards">
            <MetricCard className="stagger-5" title="NILAI KLAIM DALAM PENELAAHAN" value={data?.summary.held_tariff_idr ? formatIDR(data.summary.held_tariff_idr) : "—"} subtitle="Penyaringan pra-pembayaran: Ditahan sementara untuk verifikasi berkas" color="#076641" icon={<Scale size={18}/>}/>
            <MetricCard className="stagger-6" title="RATA-RATA WAKTU PENYELESAIAN" value={perfData?.investigation?.median_investigation_hours ? `${perfData.investigation.median_investigation_hours} jam` : null} subtitle="Dihitung sejak awal telaah hingga putusan resmi" icon={<Clock size={18}/>}/>
            <MetricCard className="stagger-7" title="KELENGKAPAN CATATAN TELAAH" value={perfData?.evidence?.evidence_completeness_pct !== null && perfData?.evidence?.evidence_completeness_pct !== undefined ? `${perfData.evidence.evidence_completeness_pct}%` : null} subtitle="Berkas memiliki catatan pertimbangan petugas" color="#0369a1" icon={<BookOpen size={18}/>}/>
            <MetricCard className="stagger-8" title="STATUS SISTEM CERDAS" value={perfData?.model?.current_version ? `Aktif v${perfData.model.current_version}` : "Siap Operasi"} subtitle={`Pendeteksi anomali relasi faskes & dokter • Pembaruan: ${formatDate(perfData?.model?.last_inference)}`} color="#1e3a5f" icon={<Zap size={18}/>}/>
          </div>
        </>
      )}

      {/* Visual Risk Distribution Bar Card */}
      {loading && !data?.summary ? (
        <div className="card skeleton-card" style={{ padding: "18px 22px", borderRadius: "20px", marginBottom: "24px", background: "#ffffff", border: "1px solid var(--line)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px", flexWrap: "wrap", gap: "10px" }}>
            <SkeletonBox width="280px" height="14px" borderRadius="4px" />
            <SkeletonBox width="220px" height="12px" borderRadius="4px" />
          </div>
          <SkeletonBox width="100%" height="14px" borderRadius="8px" />
        </div>
      ) : data?.summary && (
        <div
          className="card card-interactive animate-fade-in stagger-8"
          style={{
            padding: "18px 22px",
            borderRadius: "20px",
            background: "#ffffff",
            border: "1px solid var(--line)",
            marginBottom: "24px",
            boxShadow: "0 2px 10px rgba(0,0,0,0.02)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <strong style={{ fontSize: "13px", color: "var(--dark-green)", display: "flex", alignItems: "center", gap: "8px" }}>
                <ShieldAlert size={16} style={{ color: "#c95353" }} />
                SEBARAN TINGKAT RISIKO KLAIM (PENAPISAN PRA-PEMBAYARAN)
              </strong>
              <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "2px" }}>
                Distribusi risiko anomali klaim untuk prioritas verifikasi dan pencegahan kerugian dana jaminan sosial
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "14px", fontSize: "11.5px", flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#c95353" }} />
                <strong>Risiko Tinggi:</strong> {data.summary.high_risk_count?.toLocaleString("id-ID") ?? "0"} berkas
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#b45309" }} />
                <strong>Risiko Sedang:</strong> {perfData?.data_quality?.medium_risk?.toLocaleString("id-ID") ?? "—"} berkas
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#098a58" }} />
                <strong>Risiko Wajar:</strong> {perfData?.data_quality?.low_risk?.toLocaleString("id-ID") ?? "—"} berkas
              </span>
            </div>
          </div>

          {/* Visual Stacked Progress Bar */}
          <div style={{ height: "14px", width: "100%", borderRadius: "8px", background: "#f1f5f9", display: "flex", overflow: "hidden", gap: "2px" }}>
            <div
              style={{
                height: "100%",
                width: `${Math.max(5, Math.min(85, Math.round(((data.summary.high_risk_count || 1) / (data.summary.total_claims || 1)) * 100)))}%`,
                background: "linear-gradient(90deg, #dc2626, #ef4444)",
                transition: "width 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
              title={`Risiko Tinggi: ${data.summary.high_risk_count || 0}`}
            />
            <div
              style={{
                height: "100%",
                width: `${Math.max(5, Math.min(60, Math.round(((perfData?.data_quality?.medium_risk || 5) / (data.summary.total_claims || 1)) * 100)))}%`,
                background: "linear-gradient(90deg, #d97706, #f59e0b)",
                transition: "width 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
              title={`Risiko Sedang: ${perfData?.data_quality?.medium_risk || 0}`}
            />
            <div
              style={{
                height: "100%",
                flex: 1,
                background: "linear-gradient(90deg, #059669, #10b981)",
                transition: "width 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
              title="Risiko Wajar / Sesuai Prosedur"
            />
          </div>
        </div>
      )}

      {/* Data Source Badges */}
      {dataSourceError && <DataSourceBanner error={dataSourceError}/>}

      {/* Case Queue Preview & Health Cards */}
      <div className="grid-responsive-2" style={{ gap: "20px" }}>
        <div className="card card-interactive animate-fade-in stagger-9" style={{ padding: "18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "14px" }}>
            <strong>Antrean Berkas Pemeriksaan</strong>
            <button className="button button-secondary" style={{ fontSize: "11px", padding: "4px 12px", minHeight: 0 }} onClick={() => { setActiveSection("investigation"); fetchCases(); }}>Buka Semua Berkas →</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {Object.entries(STATUS_CONFIG).slice(0, 5).map(([status, cfg]) => (
              <div key={status} className="list-item-hover" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: "10px", background: "#f9fafb" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
                  <span style={{ color: cfg.color }}>{cfg.icon}</span>{cfg.label}
                </div>
                <strong style={{ color: cfg.color }}>{caseQueueSummary[status] ?? "—"}</strong>
              </div>
            ))}
          </div>
        </div>

        {/* System Health */}
        <div className="card card-interactive animate-fade-in stagger-10" style={{ padding: "18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "14px" }}>
            <strong>Kesiapan Layanan & Pangkalan Data</strong>
            <button className="button button-secondary" style={{ fontSize: "11px", padding: "4px 12px", minHeight: 0 }} onClick={fetchHealth} title="Segarkan status"><RefreshCw size={12}/></button>
          </div>
          {healthStatus ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {[
                { name: "Pangkalan Data Resmi BPJS (PostgreSQL)", status: isDbConnected ? "SIAP & AKTIF" : "KENDALA KONEKSI" },
                { name: "Layanan Skrining Cerdas Anti-Fraud (FastAPI)", status: isAiConnected ? "SIAP & AKTIF" : "SIAGA (STANDBY)" },
                { name: "Gerbang Layanan Terpadu Aplikasi", status: "SIAP & AKTIF" },
              ].map(svc => (
                <div key={svc.name} className="list-item-hover" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: "10px", background: "#f9fafb" }}>
                  <span style={{ fontSize: "12px" }}>{svc.name}</span>
                  <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "10px", background: svc.status.includes("AKTIF") ? "#d1fae5" : svc.status.includes("SIAGA") ? "#fef3c7" : "#fee2e2", color: svc.status.includes("AKTIF") ? "#059669" : svc.status.includes("SIAGA") ? "#d97706" : "#dc2626" }}>{svc.status}</span>
                </div>
              ))}
              <div style={{ marginTop: "8px", padding: "10px 12px", borderRadius: "10px", background: "#f0fdf4", border: "1px solid #bbf7d0", fontSize: "11px", color: "#166534" }}>
                <strong>Prinsip Kejujuran Data Terjamin</strong> — Seluruh angka dan berkas bersumber langsung dari pangkalan data resmi tanpa simulasi atau rekaan.
              </div>
            </div>
          ) : <SkeletonHealthStatus />}
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
        title={onlyMine ? `Tugas Berkas Saya (${currentUser.username})` : "Antrean Berkas Pemeriksaan"}
        subtitle={
          onlyMine
            ? "Daftar berkas klaim yang ditugaskan langsung kepada akun Anda untuk ditelaah keabsahannya."
            : "Daftar berkas klaim yang ditahan untuk ditelaah. Urutan penanganan disusun berdasarkan tingkat risiko anomali, kepatuhan faskes, dan batas waktu SLA."
        }
        action={
          <div className="toolbar-filter-row">
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }}/>
              <input value={caseSearchQuery} onChange={e => setCaseSearchQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && fetchCases()} placeholder="Cari nomor berkas, klaim, petugas…"
                style={{ padding: "6px 12px 6px 32px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "12px", width: "210px" }}/>
            </div>
            <select value={caseStatusFilter} onChange={e => setCaseStatusFilter(e.target.value)} style={{ padding: "6px 10px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "12px" }}>
              <option value="ALL">Semua Status Berkas</option>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={casePriorityFilter} onChange={e => setCasePriorityFilter(e.target.value)} style={{ padding: "6px 10px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "12px" }}>
              <option value="ALL">Semua Tingkat Urgensi</option>
              <option value="HIGH">Prioritas Tinggi</option>
              <option value="MEDIUM">Prioritas Sedang</option>
              <option value="LOW">Prioritas Wajar</option>
            </select>
            <select value={caseSortBy} onChange={e => setCaseSortBy(e.target.value)} style={{ padding: "6px 10px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "12px" }}>
              <option value="priority_desc">Urgensi Anomali Tertinggi</option>
              <option value="sla_asc">Batas Waktu (SLA) Terdekat</option>
              <option value="created_desc">Berkas Terbaru</option>
              <option value="created_asc">Berkas Terlama</option>
            </select>
            <button className="button button-secondary" onClick={exportCasesCsv} title="Unduh Rekap Berkas (CSV)">
              <Download size={14}/> CSV
            </button>
            <button className="button button-secondary" onClick={fetchCases} disabled={casesLoading}><RefreshCw size={14} className={casesLoading ? "animate-spin" : ""}/></button>
          </div>
        }
      />

      {/* Workflow Stepper Pipeline: 7-Stage BPJS Healthcare Workflow (Zero Cut-Off, Full Visibility) */}
      <div className="card workflow-pipeline-card animate-fade-in">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
          <div>
            <div style={{ fontSize: "12px", fontWeight: 800, color: "var(--dark-green)", display: "flex", alignItems: "center", gap: "6px" }}>
              <GitBranch size={15} className="text-green" />
              ALUR TAHAPAN PENANGANAN BERKAS (WORKFLOW PIPELINE)
            </div>
            <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "2px" }}>
              Saring berkas antrean sesuai tahapan siklus penelaahan klaim BPJS Kesehatan
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCaseStatusFilter("ALL")}
            className="button button-secondary"
            style={{
              minHeight: "32px",
              padding: "4px 14px",
              fontSize: "11.5px",
              borderRadius: "14px",
              border: `1.5px solid ${caseStatusFilter === "ALL" ? "var(--green)" : "var(--line)"}`,
              background: caseStatusFilter === "ALL" ? "#eef7f2" : "#ffffff",
              color: caseStatusFilter === "ALL" ? "var(--dark-green)" : "#475569",
              fontWeight: caseStatusFilter === "ALL" ? 800 : 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              transition: "all 0.15s ease",
            }}
          >
            <span>Semua Tahapan</span>
            <strong style={{ padding: "1px 7px", borderRadius: "10px", background: caseStatusFilter === "ALL" ? "var(--green)" : "#f1f5f9", color: caseStatusFilter === "ALL" ? "#ffffff" : "#475569", fontSize: "10.5px" }}>
              {cases.length}
            </strong>
          </button>
        </div>

        {/* Stepper Pipeline: 7-Column Responsive Grid (No Overflow, Zero Cut-Off) */}
        <div className="workflow-pipeline-grid">
          {WORKFLOW_STEPS.map((step) => {
            const count = Number(caseQueueSummary[step.key] ?? 0);
            const isSelected = caseStatusFilter === step.key;
            return (
              <button
                key={step.key}
                type="button"
                onClick={() => setCaseStatusFilter(isSelected ? "ALL" : step.key)}
                className={`workflow-step-btn ${isSelected ? "is-active" : ""}`}
                title={`Klik untuk menyaring Tahap ${step.stepNumber}: ${step.label} (${count} berkas)`}
              >
                {/* Top Row: Step Number & Count Badge */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                  <div className="workflow-step-num">
                    {step.stepNumber}
                  </div>
                  <div className={`workflow-step-badge ${count > 0 ? "has-count" : ""}`}>
                    {count}
                  </div>
                </div>

                {/* Middle & Bottom: Title with Icon and Context Description */}
                <div style={{ marginTop: "6px" }}>
                  <div className="workflow-step-title" style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                    <span style={{ color: isSelected ? "var(--green)" : "#475569", flexShrink: 0 }}>{step.icon}</span>
                    <span>{step.label}</span>
                  </div>
                  <div className="workflow-step-desc">
                    {step.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {casesLoading ? <SkeletonCaseQueue count={5} /> : cases.length === 0 ? (
        <EmptyState
          icon={<Inbox size={48}/>}
          message={onlyMine ? "Belum ada berkas yang ditugaskan kepada Anda" : "Tidak ada berkas dalam antrean"}
          sub={onlyMine ? "Supervisor tim dapat membagikan dan menugaskan berkas melalui Pusat Telaah Bukti Medis" : "Berkas baru akan muncul otomatis ketika klaim ditahan oleh skrining pra-pembayaran"}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {cases.map((c, idx) => (
            <div key={c.id} className={`card card-interactive list-item-hover animate-fade-in stagger-${(idx % 6) + 1}`} style={{ padding: "16px 18px", cursor: "pointer", border: selectedCase?.id === c.id ? "2px solid var(--green)" : "1px solid var(--line)" }}
              onClick={() => { setSelectedCase(c); setInvestigationView("evidence_center"); }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                    <span style={{ fontWeight: 700, fontSize: "13px", fontFamily: "monospace" }}>{c.case_number}</span>
                    <StatusBadge status={c.status}/>
                    <PriorityBadge priority={c.priority}/>
                    {c.sla_breached && <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "10px", background: "#fee2e2", color: "#dc2626" }}>⚠ Batas Waktu (SLA) Terlampaui</span>}
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--muted)", display: "flex", gap: "16px", flexWrap: "wrap" }}>
                    <span>Nomor Klaim: <strong>{c.claim_id}</strong></span>
                    {c.claim_summary?.risk_level && <span>Tingkat Risiko: <strong style={{ color: PRIORITY_CONFIG[c.claim_summary.risk_level]?.color }}>{c.claim_summary.risk_level}</strong></span>}
                    {c.claim_summary?.fraud_risk_index !== null && <span>Indeks FRI: <strong>{c.claim_summary.fraud_risk_index}</strong></span>}
                    {c.wait_hours !== null && <span>Lama Menunggu: <strong>{c.wait_hours} jam</strong></span>}
                    {c.assigned_to && <span>Petugas Pemeriksa: <strong>{c.assigned_to}</strong></span>}
                  </div>
                  {c.priority_reasons.length > 0 && (
                    <div style={{ marginTop: "6px", fontSize: "11px", color: "#475569" }}>
                      <strong>Pertimbangan Urgensi:</strong> {c.priority_reasons.join(" • ")}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <button className="button button-secondary" style={{ fontSize: "11px", padding: "4px 10px", minHeight: 0 }}
                    onClick={e => { e.stopPropagation(); setSelectedCase(c); setInvestigationView("evidence_center"); }}>
                    <Eye size={12}/> Buka Berkas
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
    if (!selectedCase) return <EmptyState icon={<FolderOpen size={48}/>} message="Pilih berkas dari antrean" sub="Klik berkas untuk membuka Pusat Telaah Bukti Medis"/>;
    const ec = caseDetail;

    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
          <button className="button button-secondary" style={{ fontSize: "11px", padding: "6px 12px", minHeight: 0 }} onClick={() => { setInvestigationView("queue"); setSelectedCase(null); setCaseDetail(null); }}>
            ← Kembali ke Antrean Berkas
          </button>
          <h1 style={{ margin: 0, fontSize: "18px", fontWeight: 800 }}>Pusat Telaah Bukti Medis | Berkas No. {selectedCase.case_number}</h1>
          <StatusBadge status={ec?.case_summary?.status || selectedCase.status}/>
          <PriorityBadge priority={ec?.case_summary?.priority || selectedCase.priority}/>
        </div>

        {/* Case Progression Stepper Tracker */}
        <div
          className="card animate-fade-in"
          style={{
            padding: "12px 18px",
            borderRadius: "16px",
            background: "#ffffff",
            border: "1px solid var(--line)",
            marginBottom: "16px",
          }}
        >
          <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
            <GitBranch size={13} className="text-green" />
            TAHAPAN PROSES BERKAS INI SAAT INI:
          </div>
          <div className="case-progression-grid">
            {WORKFLOW_STEPS.map((s, idx) => {
              const currentStatus = ec?.case_summary?.status || selectedCase.status;
              const currentIndex = WORKFLOW_STEPS.findIndex(st => st.key === currentStatus);
              const isPassed = idx < currentIndex;
              const isCurrent = s.key === currentStatus;
              return (
                <div
                  key={s.key}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    padding: "8px 10px",
                    borderRadius: "12px",
                    background: isCurrent ? "#ffffff" : isPassed ? "#f0fdf4" : "#f8fafc",
                    border: `1.5px solid ${isCurrent ? "var(--green)" : isPassed ? "#bbf7d0" : "#e2e8f0"}`,
                    boxShadow: isCurrent ? "0 4px 12px rgba(9, 138, 88, 0.10)" : "none",
                    position: "relative",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span
                      style={{
                        width: "20px",
                        height: "20px",
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "10px",
                        background: isCurrent ? "var(--green)" : isPassed ? "#16a34a" : "#e2e8f0",
                        color: isPassed || isCurrent ? "#ffffff" : "#64748b",
                        fontWeight: 800,
                      }}
                    >
                      {isPassed ? "✓" : s.stepNumber}
                    </span>
                    {isCurrent && (
                      <span style={{ fontSize: "8.5px", padding: "1px 5px", borderRadius: "6px", background: "var(--green)", color: "#fff", fontWeight: 800 }}>
                        AKTIF
                      </span>
                    )}
                    {isPassed && (
                      <span style={{ fontSize: "9px", color: "#16a34a", fontWeight: 700 }}>
                        SELESAI
                      </span>
                    )}
                  </div>
                  <div style={{ marginTop: "4px" }}>
                    <div style={{ fontSize: "11px", fontWeight: isCurrent ? 800 : 700, color: isCurrent ? "#076641" : isPassed ? "#166534" : "#475569", lineHeight: 1.25 }}>
                      {s.label}
                    </div>
                    <div style={{ fontSize: "9.5px", color: isCurrent ? "#098a58" : "var(--muted)", marginTop: "2px" }}>
                      {s.description}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {caseDetailLoading ? <SkeletonEvidenceCenter /> : ec ? (
          <div key={selectedCase.id} className="grid-responsive-2">
            {/* Ringkasan Kasus */}
            <div className="card card-interactive animate-fade-in stagger-1" style={{ padding: "18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <Hash size={16} style={{ color: "var(--green)" }}/><strong>Ringkasan Kasus</strong>
              </div>
              <div style={{ fontSize: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
                {[
                  ["Nomor Berkas Kasus", ec.case_summary?.case_number],
                  ["Nomor Berkas Klaim", ec.case_summary?.claim_id],
                  ["Status Penelaahan", <StatusBadge key="s" status={ec.case_summary?.status || ""}/>],
                  ["Petugas Pemeriksa", ec.case_summary?.assigned_to ? `${ec.case_summary.assigned_to} (${ec.case_summary.assigned_role || "PETUGAS"})` : "Belum ditugaskan"],
                  ["Batas Waktu Pelayanan (SLA)", formatDate(ec.case_summary?.sla_deadline)],
                  ["Tanggal Masuk Sistem", formatDate(ec.case_summary?.created_at)],
                  ["Hasil Putusan Akhir", ec.final_outcome?.outcome ? (OUTCOME_LABELS[ec.final_outcome.outcome]?.label || ec.final_outcome.outcome) : "Belum ada ketetapan"],
                ].map(([k, v]) => (
                  <div key={k as string} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid var(--line)" }}>
                    <span style={{ color: "var(--muted)" }}>{k}</span><span style={{ fontWeight: 600, textAlign: "right" }}>{v || "-"}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Fakta Pelayanan Tercatat */}
            <div className="card card-interactive animate-fade-in stagger-2" style={{ padding: "18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <Database size={16} style={{ color: "#0284c7" }}/><strong>Fakta Pelayanan Tercatat</strong>
                <span style={{ fontSize: "10px", background: "#e0f2fe", color: "#0284c7", padding: "2px 6px", borderRadius: "8px", fontWeight: 700 }}>FAKTA PELAYANAN RESMI</span>
              </div>
              <p style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "10px" }}>{ec.observed_facts?._description || "Data pelayanan dan kepesertaan yang diajukan oleh fasilitas kesehatan mitra"}</p>
              <div style={{ fontSize: "12px", display: "flex", flexDirection: "column", gap: "5px" }}>
                {ec.observed_facts && Object.entries(ec.observed_facts).filter(([k]) => !k.startsWith("_")).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "1px solid var(--line)" }}>
                    <span style={{ color: "var(--muted)", fontFamily: "monospace", fontSize: "11px" }}>{k}</span>
                    <span style={{ fontWeight: 600, textAlign: "right", maxWidth: "55%", overflow: "hidden", textOverflow: "ellipsis" }}>{String(v ?? "-")}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Indikator Kejanggalan Terdeteksi */}
            <div className="card card-interactive animate-fade-in stagger-3" style={{ padding: "18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <AlertCircle size={16} style={{ color: "#d97706" }}/><strong>Indikator Kejanggalan Terdeteksi</strong>
                <span style={{ fontSize: "10px", background: "#fef3c7", color: "#d97706", padding: "2px 6px", borderRadius: "8px", fontWeight: 700 }}>INDIKATOR ANOMALI</span>
              </div>
              <p style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "10px" }}>{ec.detected_patterns?._description || "Temuan ketidakwajaran pola pelayanan berdasarkan pemeriksaan aturan pra-pembayaran"}</p>
              <div style={{ fontSize: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ padding: "8px 12px", borderRadius: "10px", background: "#fef3c7" }}>
                  <strong>Indikasi Utama:</strong> {ec.detected_patterns?.primary_trigger || "Tidak ada indikasi spesifik"}
                </div>
                {(ec.detected_patterns?.evidence_reasons as string[] || []).map((r: string, i: number) => (
                  <div key={i} style={{ display: "flex", gap: "8px", fontSize: "11px", padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                    <ChevronRight size={12} style={{ color: "#d97706", flexShrink: 0, marginTop: 2 }}/>{r}
                  </div>
                ))}
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "4px" }}>
                  <span style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "8px", background: ec.detected_patterns?.spatial_conflict_detected ? "#fee2e2" : "#f1f5f9", color: ec.detected_patterns?.spatial_conflict_detected ? "#dc2626" : "#64748b" }}>
                    Konflik Lokasi Praktik: {ec.detected_patterns?.spatial_conflict_detected ? "DITEMUKAN ⚠" : "Tidak Ada"}
                  </span>
                  <span style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "8px", background: "#f1f5f9" }}>
                    Volume Pasien Dokter Harian: {ec.detected_patterns?.doctor_daily_volume ?? "—"}
                  </span>
                </div>
                {(() => {
                  const subGraphData = ec.detected_patterns?.subgraph_evidence?.nodes?.length > 0
                    ? ec.detected_patterns.subgraph_evidence
                    : getEffectiveSubgraph(selectedClaim);
                  return subGraphData?.nodes?.length > 0 ? (
                    <div style={{ marginTop: "12px" }}>
                      <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", marginBottom: "6px" }}>
                        VISUALISASI JEJARING RELASI ENTITAS (R-GCN):
                      </div>
                      <SubgraphViewer
                        nodes={subGraphData.nodes}
                        edges={subGraphData.edges}
                      />
                    </div>
                  ) : null;
                })()}
              </div>
            </div>

            {/* Petunjuk Awal Skrining Cerdas */}
            <div className="card card-interactive animate-fade-in stagger-4" style={{ padding: "18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <Zap size={16} style={{ color: "var(--green)" }}/><strong>Petunjuk Awal Skrining Cerdas</strong>
                <span style={{ fontSize: "10px", background: "#e6efe6", color: "var(--dark-green)", padding: "2px 8px", borderRadius: "20px", fontWeight: 700 }}>SKRINING PRA-PEMBAYARAN</span>
              </div>
              <p style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "10px" }}>{ec.ai_output?._description || "Hasil perhitungan algoritma skrining untuk membantu penapisan awal, bukan putusan hukum atau vonis bersalah"}</p>
              <div style={{ fontSize: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <div style={{ padding: "10px 12px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #edf0e9", textAlign: "center" }}>
                    <div style={{ fontSize: "10px", color: "var(--muted)", fontWeight: 600 }}>Indeks Risiko Anomali (FRI)</div>
                    <div style={{ fontSize: "22px", fontWeight: 800, color: ec.ai_output?.risk_level === "HIGH" ? "#c95353" : ec.ai_output?.risk_level === "MEDIUM" ? "#b45309" : "#098a58" }}>{ec.ai_output?.fraud_risk_index ?? "—"}</div>
                  </div>
                  <div style={{ padding: "10px 12px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #edf0e9", textAlign: "center" }}>
                    <div style={{ fontSize: "10px", color: "var(--muted)", fontWeight: 600 }}>Tingkat Kecurigaan Berkas</div>
                    <div style={{ fontSize: "22px", fontWeight: 800, color: "#1e241f" }}>{ec.ai_output?.fraud_probability !== null ? `${(ec.ai_output.fraud_probability * 100).toFixed(1)}%` : "—"}</div>
                  </div>
                </div>

                {/* Visual FRI Gradient Meter Gauge */}
                {ec.ai_output?.fraud_risk_index !== null && ec.ai_output?.fraud_risk_index !== undefined && (
                  <div style={{ marginTop: "6px", marginBottom: "6px", padding: "10px 12px", borderRadius: "10px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", fontWeight: 700, marginBottom: "4px" }}>
                      <span style={{ color: "#059669" }}>0.0 WAJAR</span>
                      <span style={{ color: "#d97706" }}>0.5 SEDANG</span>
                      <span style={{ color: "#dc2626" }}>1.0 TINGGI</span>
                    </div>
                    <div style={{ position: "relative", height: "10px", borderRadius: "6px", background: "linear-gradient(90deg, #10b981 0%, #f59e0b 50%, #ef4444 100%)" }}>
                      <div
                        style={{
                          position: "absolute",
                          left: `${Math.max(2, Math.min(98, Number(ec.ai_output.fraud_risk_index) * 100))}%`,
                          top: "-3px",
                          width: "6px",
                          height: "16px",
                          borderRadius: "3px",
                          background: "#1e293b",
                          border: "1.5px solid #ffffff",
                          boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
                          transform: "translateX(-50%)",
                        }}
                        title={`Posisi Indeks FRI: ${ec.ai_output.fraud_risk_index}`}
                      />
                    </div>
                    <div style={{ textAlign: "center", fontSize: "10.5px", fontWeight: 700, marginTop: "4px", color: ec.ai_output?.risk_level === "HIGH" ? "#c95353" : ec.ai_output?.risk_level === "MEDIUM" ? "#b45309" : "#098a58" }}>
                      Posisi Indeks: FRI {ec.ai_output.fraud_risk_index} &bull; {ec.ai_output?.risk_level === "HIGH" ? "Kategori Risiko Tinggi (Perlu Investigasi Cermat)" : ec.ai_output?.risk_level === "MEDIUM" ? "Kategori Risiko Sedang" : "Kategori Risiko Wajar"}
                    </div>
                  </div>
                )}
                <div style={{ padding: "9px 12px", borderRadius: "10px", background: "#f8fafc", border: "1px solid #e2e8f0", fontSize: "11px", color: "#475569", lineHeight: 1.5 }}>
                  <ShieldCheck size={13} style={{ display: "inline", marginRight: "6px", color: "var(--green)", verticalAlign: "-2px" }}/>{ec.ai_output?._legal_disclaimer || "Skor anomali adalah alat bantu penapisan pra-pembayaran. Keputusan akhir sepenuhnya berada di tangan petugas verifikator berwenang."}
                </div>
                <div style={{ fontSize: "11px", color: "var(--muted)" }}>Model: {ec.ai_output?.model_name || "Sistem Skrining Relasi Heterogen"} v{ec.ai_output?.model_version || "1.0.0"} • {formatDate(ec.ai_output?.evaluated_at)}</div>
              </div>
            </div>

            {/* Catatan Telaah Petugas */}
            <div className="card card-interactive animate-fade-in stagger-5" style={{ padding: "18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <UserCheck size={16} style={{ color: "#059669" }}/><strong>Catatan Telaah Petugas</strong>
                <span style={{ fontSize: "10px", background: "#d1fae5", color: "#059669", padding: "2px 6px", borderRadius: "8px", fontWeight: 700 }}>CATATAN PETUGAS</span>
              </div>
              {ec.investigator_findings?.reviews?.length === 0 ? (
                <EmptyState icon={<ClipboardList size={32}/>} message="Belum ada catatan telaah petugas" sub="Gunakan panel tindakan di sebelah kanan untuk memulai verifikasi"/>
              ) : (
                ec.investigator_findings?.reviews?.map((r: any) => (
                  <div key={r.id} style={{ padding: "10px 12px", borderRadius: "10px", background: "#f9fafb", marginBottom: "8px", fontSize: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <strong>{r.reviewer_name}</strong><RoleBadge role={r.reviewer_role}/>
                    </div>
                    <div style={{ marginBottom: "4px" }}>
                      <span style={{ fontWeight: 700, padding: "2px 8px", borderRadius: "8px", background: r.decision === "RELEASE" ? "#d1fae5" : r.decision === "ESCALATE_AUDIT" ? "#fee2e2" : "#fef3c7", color: r.decision === "RELEASE" ? "#059669" : r.decision === "ESCALATE_AUDIT" ? "#dc2626" : "#d97706" }}>
                        {r.decision === "RELEASE" ? "Klaim Sah / Disetujui" : r.decision === "CLARIFY" ? "Konfirmasi Faskes" : "Eskalasi ke Tim Audit"}
                      </span>
                    </div>
                    <p style={{ color: "var(--muted)", margin: "6px 0 0", fontSize: "11px" }}>{r.notes}</p>
                    <div style={{ fontSize: "10px", color: "var(--muted)", marginTop: "4px" }}>{formatDate(r.reviewed_at)}</div>
                  </div>
                ))
              )}
            </div>

            {/* Panel Tindakan & Putusan Berkas */}
            <div className="card card-interactive animate-fade-in stagger-6" style={{ padding: "18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <Send size={16} style={{ color: "var(--green)" }}/><strong>Tindakan &amp; Putusan Berkas</strong>
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
                    PEMBAGIAN TUGAS BERKAS (SUPERVISOR TIM)
                  </div>
                  <div className="grid-responsive-2" style={{ gap: "8px", marginBottom: "8px" }}>
                    <select
                      value={assignTargetUser}
                      onChange={e => setAssignTargetUser(e.target.value)}
                      style={{ padding: "6px 10px", borderRadius: "8px", border: "1px solid var(--line)", fontSize: "12px" }}
                    >
                      <option value="investigator_aura">investigator_aura (Investigator Anti-Fraud)</option>
                      <option value="verifier_aura">verifier_aura (Petugas Verifikator)</option>
                      <option value="supervisor_aura">supervisor_aura (Supervisor Antrean)</option>
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
                    <UserCheck size={13} /> Serahkan Berkas Pemeriksaan ke {assignTargetUser}
                  </button>
                </div>
              )}

              {(ec.available_actions || selectedCase.available_actions || []).length === 0 ? (
                <div style={{ fontSize: "12px", color: "var(--muted)", padding: "12px", background: "#f9fafb", borderRadius: "10px" }}>
                  Tidak ada tindakan transisi status yang dapat Anda ambil untuk status saat ini sesuai tupoksi akun Anda ({currentUser.role}).
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: "10px" }}>
                    <label style={{ fontSize: "11px", color: "var(--muted)", display: "block", marginBottom: "6px" }}>Pilih Tindakan Lanjut Berkas:</label>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {(ec.available_actions || selectedCase.available_actions).map((a: any) => (
                        <button key={a.action} onClick={() => setCaseAction(a.action)}
                          style={{ textAlign: "left", padding: "8px 12px", borderRadius: "10px", border: `1px solid ${caseAction === a.action ? "var(--green)" : "var(--line)"}`, background: caseAction === a.action ? "#e5f4ec" : "#fff", fontSize: "12px", cursor: "pointer", fontWeight: caseAction === a.action ? 700 : 500 }}>
                          <ArrowRight size={12} style={{ display: "inline", marginRight: "6px" }}/>{a.description} → <strong>{STATUS_CONFIG[a.to_status]?.label || a.to_status}</strong>
                        </button>
                      ))}
                    </div>
                  </div>

                  {caseAction === "TRANSITION_TO_RESOLVED" && (
                    <div style={{ marginBottom: "10px" }}>
                      <label style={{ fontSize: "11px", color: "var(--muted)", display: "block", marginBottom: "4px" }}>Hasil Akhir Putusan Kasus (Outcome):</label>
                      <select
                        value={caseOutcome}
                        onChange={e => setCaseOutcome(e.target.value)}
                        style={{ width: "100%", padding: "8px 12px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "12px" }}
                      >
                        <option value="REFERRED_FOR_ACTION">REFERRED_FOR_ACTION — Direkomendasikan Penyesuaian Klaim / Tindak Lanjut</option>
                        <option value="CLEARED">CLEARED — Klaim Sah &amp; Layak Bayar (Disetujui)</option>
                        <option value="INSUFFICIENT_EVIDENCE">INSUFFICIENT_EVIDENCE — Bukti Medis Belum Cukup Memadai</option>
                        <option value="CLOSED_ADMINISTRATIVE">CLOSED_ADMINISTRATIVE — Ditutup Secara Administratif</option>
                      </select>
                    </div>
                  )}

                  <div style={{ marginBottom: "10px" }}>
                    <label style={{ fontSize: "11px", color: "var(--muted)", display: "block", marginBottom: "4px" }}>Catatan &amp; Alasan Pertimbangan Petugas (Wajib diisi):</label>
                    <textarea value={caseNotes} onChange={e => setCaseNotes(e.target.value)} rows={3}
                      placeholder="Uraikan temuan rekam medis, kelengkapan berkas RS, atau dasar pertimbangan putusan..."
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "12px", resize: "vertical", fontFamily: "inherit" }}/>
                  </div>
                  <button className="button button-primary" disabled={!caseAction || caseActionLoading} onClick={performCaseAction} style={{ width: "100%" }}>
                    {caseActionLoading ? <RefreshCw size={14} className="animate-spin"/> : <Send size={14}/>}
                    {caseActionLoading ? "Menyimpan ketetapan..." : "Simpan Tindakan Berkas"}
                  </button>
                </>
              )}

              {/* Also allow claim-level review */}
              {ec.observed_facts?.claim_id && (
                <div style={{ marginTop: "16px", paddingTop: "12px", borderTop: "1px solid var(--line)" }}>
                  <div style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "8px", fontWeight: 700 }}>PENILAIAN VERIFIKATOR (UMPAN BALIK SKRINING SISTEM):</div>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {(["RELEASE", "CLARIFY", "ESCALATE_AUDIT"] as const).map(d => (
                      <button key={d} onClick={() => handleReviewDecision(d)} disabled={submittingReview}
                        style={{ padding: "6px 14px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "11px", fontWeight: 700, cursor: "pointer", background: d === "RELEASE" ? "#d1fae5" : d === "ESCALATE_AUDIT" ? "#fee2e2" : "#fef3c7", color: d === "RELEASE" ? "#059669" : d === "ESCALATE_AUDIT" ? "#dc2626" : "#d97706" }}>
                        {d === "RELEASE" ? "✓ Setujui (Klaim Wajar/Sah)" : d === "CLARIFY" ? "? Minta Klarifikasi RS" : "↑ Teruskan ke Audit Investigasi"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Riwayat Kasus */}
            <div className="card" style={{ padding: "18px", gridColumn: "1 / -1" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <History size={16} style={{ color: "var(--green)" }}/><strong>Buku Catatan Riwayat Berkas (Audit Trail)</strong>
                <span style={{ fontSize: "10px", background: "#d1fae5", color: "#059669", padding: "2px 6px", borderRadius: "8px", fontWeight: 700 }}>REKAM JEJAK RESMI</span>
              </div>
              <div style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "4px" }}>
                {ec.case_history?.transitions?.map((t: any, i: number) => (
                  <div key={i} style={{ flexShrink: 0, padding: "10px 14px", borderRadius: "12px", background: "#f9fafb", border: "1px solid var(--line)", minWidth: "160px" }}>
                    <div style={{ fontSize: "10px", color: "var(--muted)" }}>{STATUS_CONFIG[t.from_status]?.label || t.from_status} → <strong>{STATUS_CONFIG[t.to_status]?.label || t.to_status}</strong></div>
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
              <p style={{ color: "var(--muted)", fontSize: "13px" }}>Memuat Pusat Telaah Bukti Medis dari pangkalan data resmi…</p>
              <button className="button button-secondary" style={{ marginTop: "16px", fontSize: "12px" }} onClick={() => fetchCaseDetail(selectedCase.id)}>Coba Lagi</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderAlertExplorer = () => (
    <div>
      <SectionHeader title="Daftar Klaim &amp; Penyaringan Pra-Pembayaran" subtitle={`${data?.claims.length ?? 0} dari ${data?.summary.total_claims?.toLocaleString("id-ID") ?? "—"} berkas — Sumber: Pangkalan Data Resmi BPJS`}
        action={
          <div className="toolbar-filter-row">
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }}/>
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && fetchClaims()} placeholder="Cari nomor klaim, dokter, faskes…"
                style={{ paddingLeft: "32px", padding: "6px 12px 6px 32px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "12px", width: "185px" }}/>
            </div>
            <select value={riskFilter} onChange={e => setRiskFilter(e.target.value)} style={{ padding: "6px 10px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "11.5px" }}>
              <option value="ALL">Semua Tingkat Risiko</option>
              <option value="HIGH">Risiko Tinggi</option>
              <option value="MEDIUM">Risiko Sedang</option>
              <option value="LOW">Risiko Wajar</option>
              <option value="UNASSESSED">Belum Diskrining</option>
            </select>
            <select value={scenarioFilter} onChange={e => setScenarioFilter(e.target.value)} style={{ padding: "6px 10px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "11.5px" }}>
              <option value="ALL">Semua Skenario Anomali</option>
              <option value="C">Indikasi Klaim Fiktif / Konflik Jadwal (Skenario C)</option>
              <option value="B">Indikasi Upcoding / Lonjakan Volume (Skenario B)</option>
              <option value="A">Indikasi Rujukan Berulang (Skenario A)</option>
              <option value="NORMAL">Klaim Wajar (Normal)</option>
            </select>
            <select value={reviewStatusFilter} onChange={e => setReviewStatusFilter(e.target.value)} style={{ padding: "6px 10px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "11.5px" }}>
              <option value="ALL">Semua Status Telaah</option>
              <option value="PENDING_REVIEW">Menunggu Telaah</option>
              <option value="RELEASED">Disetujui Sah</option>
              <option value="CLARIFICATION_REQUESTED">Konfirmasi Faskes</option>
              <option value="ESCALATED_AUDIT">Eskalasi ke Audit</option>
            </select>
            <select value={gateFilter} onChange={e => setGateFilter(e.target.value)} style={{ padding: "6px 10px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "11.5px" }}>
              <option value="ALL">Semua Keputusan Penapisan</option>
              <option value="REJECT_FOR_HUMAN_REVIEW">Tahan Sementara (Wajib Telaah)</option>
              <option value="FLAGGED_WARNING">Peringatan Catatan Khusus</option>
              <option value="AUTO_APPROVE">Lolos Skrining (Auto Approve)</option>
            </select>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ padding: "6px 10px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "11.5px" }}>
              <option value="fri_desc">Indeks Risiko Tertinggi</option>
              <option value="fri_asc">Indeks Risiko Terendah</option>
              <option value="tariff_desc">Tarif Terbesar</option>
              <option value="newest">Berkas Terbaru</option>
            </select>
            <button className="button button-secondary" onClick={() => setShowSimulatorModal(true)} title="Simulasi Pengajuan Klaim Baru">
              <PlusCircle size={14}/> Simulasi Klaim Baru
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

      {loading ? <SkeletonClaimsExplorer /> : (
        <>
          {/* Mobile Tab Switcher */}
          <div className="mobile-only" style={{ marginBottom: "14px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", background: "#f1f5f9", padding: "4px", borderRadius: "14px", gap: "4px" }}>
              <button
                type="button"
                onClick={() => setMobileExplorerTab("list")}
                style={{
                  padding: "8px 12px",
                  borderRadius: "10px",
                  border: "none",
                  fontSize: "12px",
                  fontWeight: mobileExplorerTab === "list" ? 700 : 500,
                  background: mobileExplorerTab === "list" ? "#ffffff" : "transparent",
                  color: mobileExplorerTab === "list" ? "var(--dark-green)" : "#64748b",
                  boxShadow: mobileExplorerTab === "list" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
                  cursor: "pointer",
                }}
              >
                Daftar Berkas ({data?.claims.length ?? 0})
              </button>
              <button
                type="button"
                onClick={() => setMobileExplorerTab("detail")}
                style={{
                  padding: "8px 12px",
                  borderRadius: "10px",
                  border: "none",
                  fontSize: "12px",
                  fontWeight: mobileExplorerTab === "detail" ? 700 : 500,
                  background: mobileExplorerTab === "detail" ? "#ffffff" : "transparent",
                  color: mobileExplorerTab === "detail" ? "var(--dark-green)" : "#64748b",
                  boxShadow: mobileExplorerTab === "detail" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
                  cursor: "pointer",
                }}
              >
                Detail Telaah {selectedClaim ? "✓" : ""}
              </button>
            </div>
          </div>

          <div className="explorer-layout-grid">
            {/* Claim List */}
            <div className={`card ${mobileExplorerTab === "detail" ? "desktop-only" : ""}`} style={{ padding: "14px", maxHeight: "calc(100vh - 280px)", overflowY: "auto" }}>
              <div style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 700, marginBottom: "10px", padding: "0 4px" }}>DAFTAR PENYARINGAN KLAIM — {data?.claims.length ?? 0} BERKAS</div>
              {(!data?.claims || data.claims.length === 0) ? (
                <EmptyState icon={<Inbox size={32}/>} message="Tidak ada berkas klaim" sub="Coba sesuaikan penyaring pencarian"/>
              ) : data.claims.map((c, idx) => (
                <button key={c.claim_id} onClick={() => { setSelectedClaim(c); setMobileExplorerTab("detail"); }}
                  className={`list-item-hover animate-fade-in stagger-${(idx % 8) + 1}`}
                  style={{ width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: "12px", marginBottom: "6px", border: `1px solid ${selectedClaim?.claim_id === c.claim_id ? "var(--green)" : "var(--line)"}`, background: selectedClaim?.claim_id === c.claim_id ? "#e6efe6" : "#fff", cursor: "pointer" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <span style={{ fontFamily: "monospace", fontSize: "11px", fontWeight: 700 }}>{c.claim_id.substring(0, 18)}…</span>
                    <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 6px", borderRadius: "8px", background: c.risk_level === "HIGH" ? "#faecec" : c.risk_level === "MEDIUM" ? "#fef3c7" : "#e6efe6", color: c.risk_level === "HIGH" ? "#c95353" : c.risk_level === "MEDIUM" ? "#b45309" : "#076641" }}>
                      {c.risk_level === "HIGH" ? "TINGGI" : c.risk_level === "MEDIUM" ? "SEDANG" : "WAJAR"}
                    </span>
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--muted)" }}>
                    Indeks FRI: <strong>{c.fraud_risk_index ?? "—"}</strong> • {c.service_date} • {formatIDR(c.ina_cbgs_tariff)}
                  </div>
                  {/* Mini FRI Risk Bar */}
                  <div style={{ marginTop: "4px", marginBottom: "4px", height: "4px", width: "100%", background: "#f1f5f9", borderRadius: "3px", overflow: "hidden" }}>
                    <div style={{
                      height: "100%",
                      width: `${Math.min(100, Math.max(8, Number(c.fraud_risk_index || 0) * 100))}%`,
                      background: c.risk_level === "HIGH" ? "#ef4444" : c.risk_level === "MEDIUM" ? "#f59e0b" : "#10b981",
                      borderRadius: "3px",
                    }} />
                  </div>
                  <div style={{ display: "flex", gap: "6px", marginTop: "4px", flexWrap: "wrap" }}>
                    {c.fraud_scenario && (
                      <span style={{ fontSize: "9.5px", fontWeight: 700, padding: "1px 6px", borderRadius: "6px", background: "#f1f5f9", color: "#334155" }}>
                        Skenario {c.fraud_scenario}
                      </span>
                    )}
                    <span style={{ fontSize: "9.5px", fontWeight: 600, padding: "1px 6px", borderRadius: "6px", background: c.review_status === "PENDING_REVIEW" ? "#f1f5f9" : "#e6efe6", color: c.review_status === "PENDING_REVIEW" ? "#64748b" : "#076641" }}>
                      {c.review_status === "PENDING_REVIEW" ? "Menunggu Telaah" : c.review_status === "RELEASED" ? "Disetujui Sah" : c.review_status === "CLARIFICATION_REQUESTED" ? "Konfirmasi Faskes" : "Eskalasi Audit"}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {/* Claim Detail */}
            {selectedClaim ? (
              <div key={selectedClaim.claim_id} className={`animate-fade-in-right ${mobileExplorerTab === "list" ? "desktop-only" : ""}`} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div className="mobile-only" style={{ marginBottom: "2px" }}>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => setMobileExplorerTab("list")}
                    style={{ fontSize: "11px", padding: "6px 12px", minHeight: 0 }}
                  >
                    ← Kembali ke Daftar Klaim
                  </button>
                </div>
                <div className="card card-interactive animate-fade-in stagger-1" style={{ padding: "18px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 800, fontFamily: "monospace" }}>{selectedClaim.claim_id}</h2>
                      <div style={{ display: "flex", gap: "8px", marginTop: "6px", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "8px", background: selectedClaim.risk_level === "HIGH" ? "#faecec" : "#fef3c7", color: selectedClaim.risk_level === "HIGH" ? "#c95353" : "#b45309" }}>
                          {selectedClaim.risk_level === "HIGH" ? "RISIKO ANOMALI TINGGI" : selectedClaim.risk_level === "MEDIUM" ? "RISIKO ANOMALI SEDANG" : "RISIKO WAJAR"}
                        </span>
                        <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "8px", background: "#f1f5f9" }}>Indeks FRI: {selectedClaim.fraud_risk_index ?? "—"}</span>
                        <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "8px", background: "#e0f2fe", color: "#0369a1", fontWeight: 700 }}>
                          Penapisan: {selectedClaim.pre_payment_gate === "REJECT_FOR_HUMAN_REVIEW" ? "Tahan Sementara" : selectedClaim.pre_payment_gate === "AUTO_APPROVE" ? "Lolos Otomatis" : "Peringatan Khusus"}
                        </span>
                        {selectedClaim.is_synthetic && <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "8px", background: "#f1f5f9", color: "#475569" }}>DATA PENGUJIAN (Healthkathon)</span>}
                      </div>
                    </div>
                    {hasPermission(currentUser.role, ["investigate", "start_review"]) && (
                      <button className="button button-primary" style={{ fontSize: "11px" }} onClick={() => createCaseFromClaim(selectedClaim.claim_id)}>
                        <PlusCircle size={13}/> Buka Berkas Pemeriksaan
                      </button>
                    )}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "8px", fontSize: "12px" }}>
                  {[["ID Peserta (Anonim)", selectedClaim.patient_id], ["Dokter DPJP", selectedClaim.doctor_id], ["Fasilitas Kesehatan", selectedClaim.facility_id], ["Diagnosis ICD-10", selectedClaim.icd10_code], ["Tanggal Pelayanan", selectedClaim.service_date], ["Tarif INA-CBG", formatIDR(selectedClaim.ina_cbgs_tariff)], ["Hari Rawat (LOS)", `${selectedClaim.length_of_stay} hari`], ["Tingkat Faskes", selectedClaim.facility_class], ["Daerah Asal Peserta", selectedClaim.home_region]].map(([k, v]) => (
                    <div key={k} style={{ padding: "8px 10px", borderRadius: "8px", background: "#f9fafb" }}>
                      <div style={{ fontSize: "10px", color: "var(--muted)" }}>{k}</div>
                      <div style={{ fontWeight: 600, fontSize: "11px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v || "-"}</div>
                    </div>
                  ))}
                </div>

                {/* FRI Visual Gradient Needle Meter */}
                {selectedClaim.fraud_risk_index !== null && selectedClaim.fraud_risk_index !== undefined && (
                  <div style={{ marginTop: "12px", padding: "10px 14px", borderRadius: "12px", background: "#f8fafc", border: "1px solid var(--line)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", fontWeight: 700, marginBottom: "4px" }}>
                      <span style={{ color: "#059669" }}>0.0 WAJAR</span>
                      <span style={{ color: "#d97706" }}>0.5 SEDANG</span>
                      <span style={{ color: "#dc2626" }}>1.0 TINGGI</span>
                    </div>
                    <div style={{ position: "relative", height: "10px", borderRadius: "6px", background: "linear-gradient(90deg, #10b981 0%, #f59e0b 50%, #ef4444 100%)" }}>
                      <div
                        style={{
                          position: "absolute",
                          left: `${Math.max(2, Math.min(98, Number(selectedClaim.fraud_risk_index) * 100))}%`,
                          top: "-3px",
                          width: "6px",
                          height: "16px",
                          borderRadius: "3px",
                          background: "#1e293b",
                          border: "1.5px solid #ffffff",
                          boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
                          transform: "translateX(-50%)",
                        }}
                        title={`Indeks FRI: ${selectedClaim.fraud_risk_index}`}
                      />
                    </div>
                    <div style={{ textAlign: "center", fontSize: "11px", fontWeight: 700, marginTop: "5px", color: selectedClaim.risk_level === "HIGH" ? "#c95353" : selectedClaim.risk_level === "MEDIUM" ? "#b45309" : "#098a58" }}>
                      Posisi Indeks: FRI {selectedClaim.fraud_risk_index} &bull; {selectedClaim.risk_level === "HIGH" ? "Risiko Anomali Tinggi" : selectedClaim.risk_level === "MEDIUM" ? "Risiko Anomali Sedang" : "Risiko Wajar"}
                    </div>
                  </div>
                )}
              </div>

              {/* XAI */}
              {selectedClaim.xai_explanation && (
                <div className="card card-interactive animate-fade-in stagger-2" style={{ padding: "18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                    <Zap size={16} style={{ color: "var(--green)" }}/><strong>Petunjuk Awal Skrining Cerdas</strong>
                    <span style={{ fontSize: "10px", background: "#e6efe6", color: "var(--dark-green)", padding: "2px 8px", borderRadius: "20px", fontWeight: 700 }}>ALAT BANTU SKRINING — Bukan Vonis Bersalah</span>
                  </div>
                  <div style={{ padding: "10px 14px", borderRadius: "10px", background: "#fef3c7", border: "1px solid #fde68a", fontSize: "12px", marginBottom: "10px" }}>
                    <strong>Indikasi Utama:</strong> {selectedClaim.xai_explanation.primary_fraud_trigger}
                  </div>
                  {selectedClaim.xai_explanation.evidence_reasons.map((r, i) => (
                    <div key={i} style={{ display: "flex", gap: "8px", fontSize: "11px", padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                      <ChevronRight size={12} style={{ color: "#b45309", flexShrink: 0, marginTop: 2 }}/>{r}
                    </div>
                  ))}
                  {(() => {
                    const subGraphData = selectedClaim.xai_explanation.subgraph_evidence?.nodes?.length > 0
                      ? selectedClaim.xai_explanation.subgraph_evidence
                      : getEffectiveSubgraph(selectedClaim);
                    return subGraphData?.nodes?.length > 0 ? (
                      <div style={{ marginTop: "12px" }}>
                        <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", marginBottom: "6px" }}>
                          PETA JEJARING RELASI BERKAS INI:
                        </div>
                        <SubgraphViewer nodes={subGraphData.nodes} edges={subGraphData.edges}/>
                      </div>
                    ) : null;
                  })()}
                </div>
              )}

              {/* Review Panel */}
              {hasPermission(currentUser.role, ["start_review", "record_decision", "investigate"]) && (
                <div className="card card-interactive animate-fade-in stagger-3" style={{ padding: "18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                    <Send size={16} style={{ color: "var(--green)" }}/><strong>Putusan Telaah Verifikator</strong>
                  </div>
                  <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
                    {(["RELEASE", "CLARIFY", "ESCALATE_AUDIT"] as const).map(d => (
                      <button key={d} onClick={() => setSelectedDecision(d)}
                        style={{ flex: 1, padding: "8px", borderRadius: "10px", border: `1px solid ${selectedDecision === d ? (d === "RELEASE" ? "var(--green)" : d === "ESCALATE_AUDIT" ? "#c95353" : "#b45309") : "var(--line)"}`, background: selectedDecision === d ? (d === "RELEASE" ? "#e6efe6" : d === "ESCALATE_AUDIT" ? "#faecec" : "#fef3c7") : "#fff", color: d === "RELEASE" ? "var(--dark-green)" : d === "ESCALATE_AUDIT" ? "#c95353" : "#b45309", fontWeight: selectedDecision === d ? 700 : 500, fontSize: "11px", cursor: "pointer" }}>
                        {d === "RELEASE" ? "✓ Setujui (Klaim Wajar/Sah)" : d === "CLARIFY" ? "? Minta Klarifikasi RS" : "↑ Teruskan ke Tim Audit"}
                      </button>
                    ))}
                  </div>
                  <textarea value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} rows={3} placeholder="Catatan pertimbangan verifikator (opsional)…"
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "12px", resize: "vertical", fontFamily: "inherit", marginBottom: "10px" }}/>
                  <button className="button button-primary" style={{ width: "100%" }} onClick={() => handleReviewDecision(selectedDecision)} disabled={submittingReview}>
                    {submittingReview ? <RefreshCw size={14} className="animate-spin"/> : <Send size={14}/>}
                    {submittingReview ? "Menyimpan ke pangkalan data…" : `Simpan Putusan Telaah: ${selectedDecision === "RELEASE" ? "Disetujui Sah" : selectedDecision === "CLARIFY" ? "Klarifikasi Faskes" : "Eskalasi ke Audit"}`}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <EmptyState icon={<Eye size={48}/>} message="Pilih berkas klaim dari daftar" sub="Klik salah satu klaim untuk melihat rincian pelayanan dan opsi telaah"/>
          )}
        </div>
      </>
    )}
    </div>
  );

  const renderGraphExplorer = () => {
    // Determine active claim for the graph
    const activeGraphClaim =
      selectedClaim ||
      (data?.claims && data.claims.length > 0
        ? data.claims.find((c) => c.fraud_scenario === "C") ||
          data.claims.find((c) => (c.fraud_risk_index ?? 0) >= 70) ||
          data.claims[0]
        : null);

    const effectiveGraph = getEffectiveSubgraph(activeGraphClaim);

    const handleSelectClaimById = (id: string) => {
      const found = data?.claims.find((c) => c.claim_id === id);
      if (found) setSelectedClaim(found);
    };

    const handleSelectScenario = (scenario: "A" | "B" | "C" | "MAX_FRI") => {
      if (!data?.claims) return;
      let target: ClaimRecord | undefined;
      if (scenario === "MAX_FRI") {
        target = [...data.claims].sort((a, b) => (b.fraud_risk_index ?? 0) - (a.fraud_risk_index ?? 0))[0];
      } else {
        target = data.claims.find((c) => c.fraud_scenario === scenario);
      }
      if (target) setSelectedClaim(target);
    };

    return (
      <div className="animate-fade-in">
        <SectionHeader
          title="Peta Jejaring Relasi Faskes &amp; Dokter"
          subtitle="Visualisasi keterhubungan interaktif antara Dokter DPJP, Faskes Mitra, Peserta BPJS, dan Diagnosis Medis berbasis model Graph R-GCN"
          action={
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                className="button button-outline"
                style={{ fontSize: "12px", padding: "6px 12px" }}
                onClick={() => fetchClaims()}
              >
                <RefreshCw size={13} /> Segarkan Data
              </button>
            </div>
          }
        />

        {dataSourceError && <DataSourceBanner error={dataSourceError} />}

        {loading ? (
          <SkeletonGraphView />
        ) : !data?.claims || data.claims.length === 0 ? (
          <EmptyState
            icon={<Network size={48} />}
            message="Pangkalan data klaim belum termuat"
            sub="Pastikan koneksi PostgreSQL aktif untuk menampilkan jejaring relasi klaim."
            action={
              <button className="button button-primary" onClick={() => fetchClaims()}>
                <RefreshCw size={14} /> Muat Ulang Data
              </button>
            }
          />
        ) : (
          <div>
            {/* Interactive Claim Selector Ribbon */}
            <div
              className="card animate-fade-in"
              style={{
                padding: "16px 20px",
                borderRadius: "18px",
                marginBottom: "16px",
                background: "#ffffff",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: "200px" }}>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--muted)", whiteSpace: "nowrap" }}>
                    PILIH BERKAS KLAIM:
                  </span>
                  <select
                    className="graph-select-custom"
                    value={activeGraphClaim?.claim_id || ""}
                    onChange={(e) => handleSelectClaimById(e.target.value)}
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      borderRadius: "10px",
                      border: "1px solid var(--border)",
                      background: "#fff",
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "var(--text)",
                      cursor: "pointer",
                    }}
                  >
                    {data.claims.map((c) => (
                      <option key={c.claim_id} value={c.claim_id}>
                        {c.claim_id} — {c.specialty || "Spesialis"} | Faskes {c.facility_id} (FRI: {c.fraud_risk_index ?? "--"} | {c.risk_level === "HIGH" ? "TINGGI" : c.risk_level === "MEDIUM" ? "SEDANG" : "WAJAR"})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Quick Scenario Chips */}
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", marginRight: "4px" }}>
                    Pintas Skenario:
                  </span>
                  <button
                    onClick={() => handleSelectScenario("C")}
                    className="button"
                    style={{
                      fontSize: "11px",
                      padding: "5px 10px",
                      borderRadius: "14px",
                      background: activeGraphClaim?.fraud_scenario === "C" ? "#fee2e2" : "#f8fafc",
                      color: activeGraphClaim?.fraud_scenario === "C" ? "#dc2626" : "#475569",
                      border: `1px solid ${activeGraphClaim?.fraud_scenario === "C" ? "#fca5a5" : "#e2e8f0"}`,
                      fontWeight: 700,
                    }}
                  >
                    🔴 Skenario C: Konflik Lokasi
                  </button>
                  <button
                    onClick={() => handleSelectScenario("B")}
                    className="button"
                    style={{
                      fontSize: "11px",
                      padding: "5px 10px",
                      borderRadius: "14px",
                      background: activeGraphClaim?.fraud_scenario === "B" ? "#fef3c7" : "#f8fafc",
                      color: activeGraphClaim?.fraud_scenario === "B" ? "#b45309" : "#475569",
                      border: `1px solid ${activeGraphClaim?.fraud_scenario === "B" ? "#fcd34d" : "#e2e8f0"}`,
                      fontWeight: 700,
                    }}
                  >
                    🟠 Skenario B: Beban Pelayanan
                  </button>
                  <button
                    onClick={() => handleSelectScenario("A")}
                    className="button"
                    style={{
                      fontSize: "11px",
                      padding: "5px 10px",
                      borderRadius: "14px",
                      background: activeGraphClaim?.fraud_scenario === "A" ? "#fef9c3" : "#f8fafc",
                      color: activeGraphClaim?.fraud_scenario === "A" ? "#a16207" : "#475569",
                      border: `1px solid ${activeGraphClaim?.fraud_scenario === "A" ? "#fde047" : "#e2e8f0"}`,
                      fontWeight: 700,
                    }}
                  >
                    🟡 Skenario A: Rujukan Berulang
                  </button>
                  <button
                    onClick={() => handleSelectScenario("MAX_FRI")}
                    className="button"
                    style={{
                      fontSize: "11px",
                      padding: "5px 10px",
                      borderRadius: "14px",
                      background: "#e0f2fe",
                      color: "#0369a1",
                      border: "1px solid #bae6fd",
                      fontWeight: 700,
                    }}
                  >
                    ⚡ Risiko Tertinggi
                  </button>
                </div>
              </div>

              {/* Active Claim Detail Context Strip */}
              {activeGraphClaim && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: "10px",
                    marginTop: "14px",
                    paddingTop: "12px",
                    borderTop: "1px solid var(--line)",
                    fontSize: "12px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "monospace", fontWeight: 800, color: "#1e241f", background: "#f1f5f9", padding: "3px 8px", borderRadius: "6px" }}>
                      {activeGraphClaim.claim_id}
                    </span>
                    <span style={{ color: "var(--muted)" }}>•</span>
                    <span style={{ fontWeight: 600 }}>
                      DPJP: <strong>{activeGraphClaim.doctor_id}</strong> ({activeGraphClaim.specialty || "Spesialis"})
                    </span>
                    <span style={{ color: "var(--muted)" }}>•</span>
                    <span style={{ fontWeight: 600 }}>
                      Faskes: <strong>{activeGraphClaim.facility_id}</strong> ({activeGraphClaim.facility_class || "FKRTL"})
                    </span>
                    <span style={{ color: "var(--muted)" }}>•</span>
                    <span style={{ fontWeight: 600 }}>
                      Diagnosis: <strong>{activeGraphClaim.icd10_code}</strong>
                    </span>
                    <span style={{ color: "var(--muted)" }}>•</span>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: "12px",
                        fontWeight: 700,
                        fontSize: "11px",
                        background:
                          (activeGraphClaim.fraud_risk_index ?? 0) >= 70
                            ? "#fee2e2"
                            : (activeGraphClaim.fraud_risk_index ?? 0) >= 40
                            ? "#fef3c7"
                            : "#d1fae5",
                        color:
                          (activeGraphClaim.fraud_risk_index ?? 0) >= 70
                            ? "#dc2626"
                            : (activeGraphClaim.fraud_risk_index ?? 0) >= 40
                            ? "#b45309"
                            : "#059669",
                      }}
                    >
                      FRI: {activeGraphClaim.fraud_risk_index ?? "--"}/100
                    </span>
                    {(activeGraphClaim.spatiotemporal_metrics?.spatial_conflict_detected || activeGraphClaim.fraud_scenario === "C") && (
                      <span
                        style={{
                          background: "#faecec",
                          color: "#c95353",
                          border: "1px solid #f87171",
                          fontWeight: 700,
                          fontSize: "11px",
                          padding: "2px 8px",
                          borderRadius: "12px",
                        }}
                      >
                        ⚠ Konflik Lokasi Terdeteksi
                      </span>
                    )}
                  </div>

                  <button
                    className="button button-outline"
                    onClick={() => {
                      setSelectedClaim(activeGraphClaim);
                      setInvestigationView("evidence_center");
                    }}
                    style={{
                      fontSize: "11px",
                      padding: "4px 10px",
                      borderRadius: "8px",
                      borderColor: "var(--green)",
                      color: "var(--dark-green)",
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                    }}
                  >
                    Buka Pusat Telaah Bukti Medis <ArrowRight size={12} />
                  </button>
                </div>
              )}
            </div>

            {/* Interactive Graph Canvas */}
            <div className="card" style={{ padding: "16px", borderRadius: "20px", marginBottom: "16px", background: "#ffffff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Layers size={16} style={{ color: "var(--green)" }} />
                  <span style={{ fontWeight: 800, fontSize: "14px", color: "var(--text)" }}>
                    Topologi Jejaring Relasional Entitas
                  </span>
                  <span style={{ fontSize: "11px", background: "#e6efe6", color: "var(--dark-green)", padding: "2px 8px", borderRadius: "12px", fontWeight: 700 }}>
                    {effectiveGraph.nodes.length} Simpul • {effectiveGraph.edges.length} Relasi
                  </span>
                </div>
                <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                  Klik simpul atau relasi untuk melihat rincian metadata
                </span>
              </div>

              <SubgraphViewer
                nodes={effectiveGraph.nodes}
                edges={effectiveGraph.edges}
              />
            </div>

            {/* Bottom 3-Column Relational Insights */}
            <div className="graph-insights-grid">
              {/* Card 1: Topologi Simpul & Relasi */}
              <div className="card" style={{ padding: "18px", borderRadius: "18px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                  <Network size={16} style={{ color: "var(--green)" }} />
                  <span style={{ fontWeight: 700, fontSize: "13px" }}>Ringkasan Topologi Graf</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "6px", borderBottom: "1px solid var(--line)" }}>
                    <span style={{ color: "var(--muted)" }}>Total Simpul (Nodes):</span>
                    <strong style={{ color: "var(--dark-green)" }}>{effectiveGraph.nodes.length} Entitas</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "6px", borderBottom: "1px solid var(--line)" }}>
                    <span style={{ color: "var(--muted)" }}>Total Relasi (Edges):</span>
                    <strong style={{ color: "var(--dark-green)" }}>{effectiveGraph.edges.length} Hubungan</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "6px", borderBottom: "1px solid var(--line)" }}>
                    <span style={{ color: "var(--muted)" }}>Konektivitas DPJP:</span>
                    <strong>{effectiveGraph.edges.filter((e) => e.source.includes("DOC") || e.target.includes("DOC")).length} Relasi</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--muted)" }}>Karakter Pola:</span>
                    <span
                      style={{
                        fontWeight: 700,
                        color:
                          activeGraphClaim?.fraud_scenario === "C"
                            ? "#dc2626"
                            : activeGraphClaim?.fraud_scenario === "B"
                            ? "#b45309"
                            : "var(--dark-green)",
                      }}
                    >
                      {activeGraphClaim?.fraud_scenario === "C"
                        ? "Anomali Multilokasi"
                        : activeGraphClaim?.fraud_scenario === "B"
                        ? "Beban Konsentrasi"
                        : activeGraphClaim?.fraud_scenario === "A"
                        ? "Rujukan Siklik"
                        : "Relasi Wajar"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 2: Penjelasan Analisis AI R-GCN */}
              <div className="card" style={{ padding: "18px", borderRadius: "18px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                  <Zap size={16} style={{ color: "#d97706" }} />
                  <span style={{ fontWeight: 700, fontSize: "13px" }}>Deteksi AI Graph R-GCN</span>
                  <span style={{ fontSize: "10px", background: "#fef3c7", color: "#b45309", padding: "2px 6px", borderRadius: "8px", fontWeight: 700 }}>
                    XAI EXPLANATION
                  </span>
                </div>
                <div style={{ fontSize: "12px", marginBottom: "8px", fontWeight: 600, color: "#1e241f" }}>
                  Pemicu Utama: {activeGraphClaim?.xai_explanation?.primary_fraud_trigger || "Pola Relasi Terverifikasi"}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {activeGraphClaim?.xai_explanation?.evidence_reasons?.map((reason, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "6px",
                        fontSize: "11px",
                        color: "#475569",
                        lineHeight: 1.4,
                      }}
                    >
                      <ChevronRight size={13} style={{ color: "var(--green)", flexShrink: 0, marginTop: "1px" }} />
                      <span>{reason}</span>
                    </div>
                  )) || (
                    <div style={{ fontSize: "11px", color: "var(--muted)" }}>
                      Tidak ditemukan anomali keterhubungan kritis pada berkas ini.
                    </div>
                  )}
                </div>
              </div>

              {/* Card 3: Matriks Relasi Antar-Entitas */}
              <div className="card" style={{ padding: "18px", borderRadius: "18px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                  <Database size={16} style={{ color: "var(--green)" }} />
                  <span style={{ fontWeight: 700, fontSize: "13px" }}>Matriks Relasi Entitas</span>
                </div>
                <div style={{ maxHeight: "170px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px" }}>
                  {effectiveGraph.edges.map((e, idx) => {
                    const isConflict = (e.relation || "").toLowerCase().includes("conflict");
                    return (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "6px 8px",
                          borderRadius: "8px",
                          background: isConflict ? "#fee2e2" : "#f8fafc",
                          fontSize: "11px",
                          border: `1px solid ${isConflict ? "#fecaca" : "#f1f5f9"}`,
                        }}
                      >
                        <span style={{ fontFamily: "monospace", fontWeight: 700, color: isConflict ? "#991b1b" : "#334155" }}>
                          {e.source.length > 12 ? `${e.source.substring(0, 10)}…` : e.source}
                        </span>
                        <span
                          style={{
                            fontSize: "10px",
                            fontWeight: 700,
                            padding: "1px 6px",
                            borderRadius: "6px",
                            background: isConflict ? "#f87171" : "#e2e8f0",
                            color: isConflict ? "#ffffff" : "#475569",
                          }}
                        >
                          {isConflict ? "KONFLIK ⚠" : e.relation}
                        </span>
                        <span style={{ fontFamily: "monospace", fontWeight: 700, color: isConflict ? "#991b1b" : "#334155" }}>
                          {e.target.length > 12 ? `${e.target.substring(0, 10)}…` : e.target}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderInvestigation = () => (
    <div className="section-with-subnav">
      {/* Sub-nav */}
      <div className="subnav-container">
        <div className="card subnav-card">
          {([
            ["queue", "Antrean Berkas Kasus", <ClipboardList size={16}/>],
            ["my_cases", "Tugas Berkas Saya", <UserCheck size={16}/>],
            ["evidence_center", "Pusat Telaah Bukti Medis", <FolderOpen size={16}/>],
            ["alert_explorer", "Penyaringan & Daftar Klaim", <AlertCircle size={16}/>],
            ["graph", "Peta Jejaring Faskes & Dokter", <Network size={16}/>],
          ] as const).map(([view, label, icon]) => (
            <button key={view} onClick={() => setInvestigationView(view as InvestigationView)}
              style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", borderRadius: "14px", border: "none", background: investigationView === view ? "#e6efe6" : "transparent", color: investigationView === view ? "var(--dark-green)" : "#475569", fontWeight: investigationView === view ? 700 : 500, fontSize: "13px", cursor: "pointer", textAlign: "left", transition: "all 0.18s" }}>
              <span style={{ color: investigationView === view ? "var(--green)" : "var(--muted)" }}>{icon}</span>{label}
            </button>
          ))}
        </div>
      </div>
      <div key={investigationView} className="animate-fade-in" style={{ flex: 1, minWidth: 0 }}>
        {investigationView === "queue" && renderInvestigationQueue(false)}
        {investigationView === "my_cases" && renderInvestigationQueue(true)}
        {investigationView === "evidence_center" && renderEvidenceCenter()}
        {investigationView === "alert_explorer" && renderAlertExplorer()}
        {investigationView === "graph" && renderGraphExplorer()}
      </div>
    </div>
  );

  // ============================================================
  // SECTION: DATA INTELLIGENCE
  // ============================================================

  const renderDataIngestion = () => (
    <div>
      <SectionHeader title="Riwayat Penerimaan Berkas Klaim" subtitle="Pencatatan resmi proses penerimaan dan validasi berkas klaim faskes. Semua metrik bersumber dari pangkalan data aktual." action={<button className="button button-secondary" onClick={fetchIngestion} disabled={ingestionLoading}><RefreshCw size={14} className={ingestionLoading ? "animate-spin" : ""}/>Segarkan</button>}/>
      {ingestionLoading ? <SkeletonDataIngestion /> : ingestionData ? (
        <>
          <div className="grid-responsive-cards">
            <MetricCard title="TOTAL BERKAS KLAIM" value={ingestionData.database_summary?.total_claims_in_db?.toLocaleString("id-ID")} subtitle="Berkas klaim tersimpan resmi" icon={<Database size={18}/>}/>
            <MetricCard title="TOTAL PESERTA TERLAYANI" value={ingestionData.database_summary?.total_patients_in_db?.toLocaleString("id-ID")} subtitle="Identitas terproteksi UU PDP" icon={<User size={18}/>}/>
            <MetricCard title="DOKTER PENANGGUNG JAWAB (DPJP)" value={ingestionData.database_summary?.total_doctors_in_db?.toLocaleString("id-ID")} subtitle="Profil dokter terdaftar" icon={<Stethoscope size={18}/>}/>
            <MetricCard title="FASKES MITRA TERDAFTAR" value={ingestionData.database_summary?.total_facilities_in_db?.toLocaleString("id-ID")} subtitle="Fasilitas kesehatan rujukan & pertama" icon={<Building2 size={18}/>}/>
          </div>
          {ingestionData.note && (
            <div style={{ padding: "12px 16px", borderRadius: "12px", background: "#fef3c7", border: "1px solid #fde68a", color: "#92400e", marginBottom: "16px", fontSize: "12px" }}>
              <AlertTriangle size={14} style={{ display: "inline", marginRight: "6px" }}/>{ingestionData.note}
            </div>
          )}
          <div className="card" style={{ padding: "18px" }}>
            <strong style={{ display: "block", marginBottom: "12px" }}>Buku Catatan Penerimaan Berkas Gelombang (Batch Ingestion)</strong>
            {ingestionData.batches?.length === 0 ? (
              <EmptyState icon={<Database size={32}/>} message="Belum ada riwayat penerimaan berkas tercatat" sub="Data akan muncul otomatis setelah berkas klaim diimpor"/>
            ) : (
              <div className="table-responsive" style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                  <thead><tr style={{ borderBottom: "1px solid var(--line)", background: "var(--surface)" }}>
                    {["ID Gelombang", "Sumber Berkas", "Jenis Pelayanan", "Baris Masuk", "Format Sesuai", "Format Ditolak", "Klaim Ganda", "Status Proses", "Waktu Terima", "Petugas Pengunggah"].map(h => (
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
                        <td style={{ padding: "8px 12px" }}><span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "8px", background: b.status === "COMPLETED" ? "#d1fae5" : "#fef3c7", color: b.status === "COMPLETED" ? "#059669" : "#d97706" }}>{b.status === "COMPLETED" ? "SELESAI" : b.status}</span></td>
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
        <EmptyState icon={<Database size={48}/>} message="Gagal memuat riwayat penerimaan data" sub="Pastikan pangkalan data resmi dalam kondisi aktif"/>
      )}
    </div>
  );

  const renderModelEval = () => (
    <div>
      <SectionHeader title="Akurasi Sistem Skrining &amp; Umpan Balik Verifikator" subtitle="Status model deteksi anomali relasi heterogen &amp; ekspor data pembelajaran dari hasil telaah resmi verifikator"/>
      <div className="grid-responsive-2" style={{ gap: "16px", marginBottom: "20px" }}>
        <MetricCard title="VERSI MODEL AKTIF" value={perfData?.model?.current_version ? `v${perfData.model.current_version}` : "v1.0.0"} subtitle={`Terakhir diperbarui: ${formatDate(perfData?.model?.last_inference)}`} icon={<Zap size={18}/>}/>
        <MetricCard title="CAKUPAN PENAPISAN KLAIM" value={perfData?.data_quality?.assessment_coverage_pct !== undefined ? `${perfData.data_quality.assessment_coverage_pct}%` : null} subtitle="Persentase berkas klaim yang telah diskrining oleh sistem" color="#0284c7" icon={<Target size={18}/>}/>
      </div>
      <div className="card" style={{ padding: "18px", marginBottom: "20px" }}>
        <ControlledFeedbackPanel backendUrl={BACKEND_URL} authToken={currentUser.token} />
      </div>
    </div>
  );

  const renderDataIntelligence = () => (
    <div className="section-with-subnav">
      <div className="subnav-container">
        <div className="card subnav-card">
          {([["ingestion", "Penerimaan Berkas", <Database size={16}/>], ["quality", "Validasi Mutu Berkas", <CheckSquare size={16}/>], ["alert_explorer", "Penyaringan Klaim", <AlertCircle size={16}/>], ["model_eval", "Akurasi Skrining", <Zap size={16}/>]] as const).map(([v, l, ic]) => (
            <button key={v} onClick={() => setDataView(v as DataView)}
              style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", borderRadius: "14px", border: "none", background: dataView === v ? "#e6efe6" : "transparent", color: dataView === v ? "var(--dark-green)" : "#475569", fontWeight: dataView === v ? 700 : 500, fontSize: "13px", cursor: "pointer", textAlign: "left", transition: "all 0.18s" }}>
              <span style={{ color: dataView === v ? "var(--green)" : "var(--muted)" }}>{ic}</span>{l}
            </button>
          ))}
        </div>
      </div>
      <div key={dataView} className="animate-fade-in" style={{ flex: 1 }}>
        {dataView === "ingestion" && renderDataIngestion()}
        {dataView === "quality" && (
          <div>
            <SectionHeader title="Validasi Mutu Berkas Klaim" subtitle="Tingkat kelengkapan, kepatuhan format, dan sebaran tingkat risiko klaim pelayanan"/>
            {perfLoading ? <SkeletonCardsGrid count={6} /> : perfData ? (
              <div className="grid-responsive-cards">
                <MetricCard title="TOTAL SELURUH KLAIM" value={perfData.data_quality?.total_claims?.toLocaleString("id-ID")} icon={<Database size={18}/>}/>
                <MetricCard title="SELESAI DISKRINING" value={perfData.data_quality?.assessed_claims?.toLocaleString("id-ID")} subtitle={`Cakupan: ${perfData.data_quality?.assessment_coverage_pct}%`} color="#059669" icon={<CheckCircle2 size={18}/>}/>
                <MetricCard title="MENUNGGU DISKRINING" value={perfData.data_quality?.not_assessed?.toLocaleString("id-ID")} color="#d97706" icon={<Hourglass size={18}/>}/>
                <MetricCard title="INDIKASI ANOMALI TINGGI" value={perfData.data_quality?.high_risk?.toLocaleString("id-ID")} color="#dc2626" icon={<ShieldAlert size={18}/>}/>
                <MetricCard title="INDIKASI ANOMALI SEDANG" value={perfData.data_quality?.medium_risk?.toLocaleString("id-ID")} color="#d97706" icon={<AlertTriangle size={18}/>}/>
                <MetricCard title="KLAIM WAJAR / SESUAI" value={perfData.data_quality?.low_risk?.toLocaleString("id-ID")} color="#059669" icon={<ShieldCheck size={18}/>}/>
              </div>
            ) : <SkeletonCardsGrid count={6} />}
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
      <SectionHeader title="Dasbor Kinerja Penanganan Klaim &amp; Verifikasi" subtitle={`Metrik operasional riil — 30 hari terakhir • Diperbarui: ${formatDate(new Date().toISOString())}`}
        action={<button className="button button-secondary" onClick={fetchPerformance} disabled={perfLoading}><RefreshCw size={14} className={perfLoading ? "animate-spin" : ""}/>Segarkan</button>}/>
      {perfLoading ? <SkeletonPerformanceDashboard /> : perfData ? (
        <>
          <div style={{ padding: "12px 16px", borderRadius: "12px", background: "#f0f9ff", border: "1px solid #bae6fd", color: "#0369a1", marginBottom: "20px", fontSize: "12px" }}>
            <Info size={14} style={{ display: "inline", marginRight: "6px" }}/>
            Semua metrik operasional dihitung langsung dari data riil transaksi klaim tanpa rekayasa.
          </div>
          <div className="grid-responsive-cards">
            <MetricCard title="TOTAL KASUS SELESAI" value={perfData.investigation?.throughput_all_time} subtitle="Berkas selesai diputuskan &amp; ditutup" color="#059669" icon={<TrendingUp size={18}/>}/>
            <MetricCard title="BERKAS MENUNGGU TELAAH" value={perfData.investigation?.backlog} subtitle="Menanti tindak lanjut petugas" color="#d97706" icon={<Inbox size={18}/>}/>
            <MetricCard title="RATA-RATA WAKTU PENELAAHAN" value={perfData.investigation?.median_investigation_hours !== null ? `${perfData.investigation.median_investigation_hours} jam` : null} subtitle="Dihitung sejak awal telaah hingga putusan" icon={<Clock size={18}/>}/>
            <MetricCard title="RASIO TELAAH BERKAS" value={perfData.alert_quality?.alert_review_rate !== null ? `${perfData.alert_quality.alert_review_rate}%` : null} subtitle={`${perfData.alert_quality?.reviewed_in_period} berkas ditelaah dalam periode`} color="#0284c7" icon={<Eye size={18}/>}/>
          </div>
          <div className="grid-responsive-cards">
            <MetricCard title="TINGKAT KLAIM SAH SETELAH TELAAH" value={perfData.alert_quality?.verified_false_positive_rate !== null ? `${perfData.alert_quality.verified_false_positive_rate}%` : null} subtitle="Berkas tersaring anomali yang dikonfirmasi wajar & sah oleh verifikator" color="#b45309" icon={<Scale size={18}/>}/>
            <MetricCard title="KELENGKAPAN CATATAN TELAAH" value={perfData.evidence?.evidence_completeness_pct !== null ? `${perfData.evidence.evidence_completeness_pct}%` : null} subtitle={`${perfData.evidence?.cases_with_evidence} berkas memiliki catatan pertimbangan`} color="#059669" icon={<BookOpen size={18}/>}/>
            <MetricCard title="KETEPATAN PRIORITAS PENAPISAN" value={null} subtitle={perfData.alert_quality?.precision_at_k_note || "Tingkat kesesuaian urutan anomali teratas dengan telaah petugas"} icon={<Target size={18}/>}/>
            <MetricCard title="TOTAL AKTIVITAS TERCATAT" value={perfData.audit_trail?.audit_events_in_period} subtitle="Tindakan resmi masuk buku log audit" icon={<History size={18}/>}/>
          </div>

          {/* Priority distribution with visual progress bars */}
          <div className="card" style={{ padding: "18px", marginBottom: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <strong style={{ fontSize: "13px" }}>Sebaran Tingkat Urgensi Berkas Pemeriksaan</strong>
              <span style={{ fontSize: "11px", color: "var(--muted)" }}>Prioritas tindak lanjut berkas klaim</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "12px", marginTop: "12px" }}>
              {Object.entries(perfData.investigation?.priority_distribution || {}).map(([p, count]) => {
                const totalPriority = Object.values(perfData.investigation?.priority_distribution || {}).reduce((a: number, b: any) => a + Number(b || 0), 0) || 1;
                const pct = Math.round((Number(count || 0) / totalPriority) * 100);
                const cfg = PRIORITY_CONFIG[p] || { label: p, color: "#64748b", bg: "#f1f5f9", dot: "#64748b" };
                return (
                  <div key={p} style={{ padding: "14px 16px", borderRadius: "14px", background: cfg.bg, border: `1px solid ${cfg.color}30` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <span style={{ fontSize: "11px", color: cfg.color, fontWeight: 700 }}>{cfg.label}</span>
                      <span style={{ fontSize: "11px", fontWeight: 800, color: cfg.color }}>{pct}%</span>
                    </div>
                    <div style={{ fontSize: "26px", fontWeight: 800, color: cfg.color, marginBottom: "8px" }}>{Number(count || 0)}</div>
                    <div style={{ height: "6px", width: "100%", borderRadius: "4px", background: "#ffffff", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: cfg.color, borderRadius: "4px", transition: "width 0.5s ease" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card" style={{ padding: "16px" }}>
            <div style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 700, marginBottom: "8px" }}>CATATAN PRINSIP OPERASIONAL BPJS KESEHATAN</div>
            <div style={{ fontSize: "12px", color: "#374151", lineHeight: 1.6 }}>
              • Berkas klaim yang belum selesai ditelaah tidak serta-merta dianggap bebas anomali ataupun keliru.<br/>
              • Klaim yang ditahan pada skrining pra-pembayaran merupakan langkah kehati-hatian pencegahan kerugian dana jaminan sosial kesehatan, bukan vonis kecurangan.<br/>
              • Nilai rupiah yang ditahan adalah pagu tarif klaim yang sedang dikonfirmasi keabsahannya sebelum pembayaran dicairkan kepada pihak rumah sakit.<br/>
              • Garis dasar acuan: Sistem beroperasi langsung berbasis data transaksi riil dan pembelajaran berkesinambungan.
            </div>
          </div>
        </>
      ) : <EmptyState icon={<BarChart3 size={48}/>} message="Data dasbor belum dimuat" sub="Klik Segarkan atau periksa koneksi"/>}
    </div>
  );

  const renderReports = () => (
    <div className="section-with-subnav">
      <div className="subnav-container">
        <div className="card subnav-card">
          {([["performance", "Kinerja Operasional", <BarChart3 size={16}/>], ["outcomes", "Hasil Putusan Berkas", <Award size={16}/>], ["model", "Akurasi Skrining", <Zap size={16}/>], ["audit", "Buku Log Audit", <History size={16}/>]] as const).map(([v, l, ic]) => (
            <button key={v} onClick={() => setReportsView(v as ReportsView)}
              style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", borderRadius: "14px", border: "none", background: reportsView === v ? "#e6efe6" : "transparent", color: reportsView === v ? "var(--dark-green)" : "#475569", fontWeight: reportsView === v ? 700 : 500, fontSize: "13px", cursor: "pointer", textAlign: "left", transition: "all 0.18s" }}>
              <span style={{ color: reportsView === v ? "var(--green)" : "var(--muted)" }}>{ic}</span>{l}
            </button>
          ))}
        </div>
      </div>
      <div key={reportsView} className="animate-fade-in" style={{ flex: 1 }}>
        {reportsView === "performance" && renderPerformanceDashboard()}
        {reportsView === "outcomes" && (
          <div>
            <SectionHeader
              title="Hasil Akhir Putusan Berkas Kasus"
              subtitle="Rekapitulasi ketetapan pemeriksaan berkas oleh verifikator dan tim pencegahan kecurangan (anti-fraud)"
              action={
                <button className="button button-secondary" onClick={exportCasesCsv}>
                  <Download size={14}/> Unduh Rekap Kasus (CSV)
                </button>
              }
            />
            <div className="grid-responsive-3" style={{ gap: "16px", marginBottom: "20px" }}>
              <MetricCard title="BERKAS SELESAI DIPUTUSKAN" value={perfData?.investigation?.resolved_cases} color="#059669" icon={<CheckCircle2 size={18}/>}/>
              <MetricCard title="BERKAS DITUTUP ADMINISTRATIF" value={perfData?.investigation?.closed_cases} icon={<Lock size={18}/>}/>
              <MetricCard title="BERKAS DIESKALASI KE AUDIT" value={perfData?.investigation?.escalated_cases} color="#dc2626" icon={<ArrowUpRight size={18}/>}/>
            </div>
            {perfData?.investigation?.outcomes_distribution && (
              <div className="card" style={{ padding: "18px", marginBottom: "20px" }}>
                <strong>Distribusi Hasil Putusan Kasus (Outcomes)</strong>
                <div className="grid-responsive-2" style={{ gap: "12px", marginTop: "12px" }}>
                  {Object.entries(OUTCOME_LABELS).map(([key, cfg]) => {
                    const totalOutcomes = Object.values(perfData.investigation.outcomes_distribution).reduce((a: number, b: any) => a + Number(b || 0), 0) || 1;
                    const count = Number(perfData.investigation.outcomes_distribution[key] ?? 0);
                    const pct = Math.round((count / totalOutcomes) * 100);
                    return (
                      <div key={key} style={{ padding: "14px 16px", borderRadius: "14px", background: cfg.bg, border: `1px solid ${cfg.color}30` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <div style={{ fontSize: "12px", fontWeight: 700, color: cfg.color }}>{cfg.label}</div>
                            <div style={{ fontSize: "10px", fontFamily: "monospace", color: "var(--muted)" }}>{key}</div>
                          </div>
                          <strong style={{ fontSize: "24px", color: cfg.color }}>{count}</strong>
                        </div>
                        <div style={{ marginTop: "10px", height: "6px", width: "100%", borderRadius: "4px", background: "#ffffff", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: cfg.color, borderRadius: "4px", transition: "width 0.5s ease" }} />
                        </div>
                      </div>
                    );
                  })}
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
            <SectionHeader title="Buku Catatan Log Audit Terpadu" subtitle="Seluruh aktivitas pemeriksaan, penetapan, dan pengalihan berkas tercatat dengan identitas petugas resmi dan stempel waktu"
              action={
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ position: "relative" }}>
                    <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }}/>
                    <input value={auditSearchQuery} onChange={e => setAuditSearchQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && fetchAuditLogs()} placeholder="Cari petugas, aksi, nomor berkas…"
                      style={{ padding: "6px 12px 6px 32px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "12px", width: "190px" }}/>
                  </div>
                  <select value={auditActionFilter} onChange={e => setAuditActionFilter(e.target.value)} style={{ padding: "6px 10px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "12px" }}>
                    <option value="ALL">Semua Jenis Tindakan</option>
                    <option value="CLAIM_INGESTED">Penerimaan Klaim (CLAIM_INGESTED)</option>
                    <option value="CASE_CREATED">Pembuatan Berkas (CASE_CREATED)</option>
                    <option value="CASE_ASSIGNED">Penugasan Berkas (CASE_ASSIGNED)</option>
                    <option value="CASE_TRANSITIONED">Perubahan Status (CASE_TRANSITIONED)</option>
                    <option value="HUMAN_REVIEW_RELEASE">Persetujuan Sah (HUMAN_REVIEW_RELEASE)</option>
                    <option value="HUMAN_REVIEW_CLARIFY">Klarifikasi Faskes (HUMAN_REVIEW_CLARIFY)</option>
                    <option value="HUMAN_REVIEW_ESCALATE_AUDIT">Eskalasi ke Audit (HUMAN_REVIEW_ESCALATE_AUDIT)</option>
                    <option value="ADMIN_USER_CREATED">Pendaftaran Akun (ADMIN_USER_CREATED)</option>
                  </select>
                  <button className="button button-secondary" onClick={exportAuditCsv}>
                    <Download size={14}/> Unduh Rekap Log (CSV)
                  </button>
                  <button className="button button-secondary" onClick={fetchAuditLogs} disabled={auditLoading}><RefreshCw size={14} className={auditLoading ? "animate-spin" : ""}/>Segarkan</button>
                </div>
              }/>
            {!hasPermission(currentUser.role, ["view_audit"]) ? (
              <div className="card" style={{ padding: "24px", textAlign: "center" }}>
                <Lock size={32} style={{ color: "var(--muted)", marginBottom: "12px" }}/>
                <p style={{ color: "var(--muted)" }}>Akun dengan peran <RoleBadge role={currentUser.role}/> tidak memiliki izin untuk membuka buku catatan log audit operasional.</p>
              </div>
            ) : auditLoading ? (
              <SkeletonTable
                headers={["Waktu Aktivitas", "Nama Petugas", "Tupoksi / Peran", "Jenis Tindakan", "Nomor Berkas / Target", "Keterangan Lengkap"]}
                rows={6}
              />
            ) : (
              <div className="card table-responsive" style={{ padding: "0", overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                  <thead><tr style={{ borderBottom: "1px solid var(--line)", background: "var(--surface)" }}>
                    {["Waktu Aktivitas", "Nama Petugas", "Tupoksi / Peran", "Jenis Tindakan", "Nomor Berkas / Target", "Keterangan Lengkap"].map(h => (
                      <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: "11px", fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {auditLogs.length === 0 ? (
                      <tr><td colSpan={6} style={{ textAlign: "center", padding: "32px", color: "var(--muted)" }}>Belum ada log audit tersimpan</td></tr>
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
    <div className="section-with-subnav" style={{ width: "100%" }}>
      {currentUser.role !== "ADMINISTRATOR" && (
        <div className="card" style={{ padding: "24px", textAlign: "center", width: "100%" }}>
          <Lock size={32} style={{ color: "var(--muted)", marginBottom: "12px" }}/>
          <p style={{ color: "var(--muted)" }}>Panel Administrasi hanya dapat diakses oleh <strong>Administrator Sistem</strong> untuk tata kelola hak akses dan keamanan gerbang data.</p>
          <p style={{ color: "var(--muted)", fontSize: "12px" }}>Tupoksi akun Anda saat ini: <RoleBadge role={currentUser.role}/></p>
        </div>
      )}
      {currentUser.role === "ADMINISTRATOR" && (
        <>
          <div className="subnav-container">
            <div className="card subnav-card">
              {([["users", "Kelola Akun Petugas", <Users size={16}/>], ["health", "Kondisi Infrastruktur", <Activity size={16}/>], ["audit_trail", "Buku Log Audit", <History size={16}/>]] as const).map(([v, l, ic]) => (
                <button key={v} onClick={() => setAdminView(v as AdminView)}
                  style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", borderRadius: "14px", border: "none", background: adminView === v ? "#e6efe6" : "transparent", color: adminView === v ? "var(--dark-green)" : "#475569", fontWeight: adminView === v ? 700 : 500, fontSize: "13px", cursor: "pointer", textAlign: "left", transition: "all 0.18s" }}>
                  <span style={{ color: adminView === v ? "var(--green)" : "var(--muted)" }}>{ic}</span>{l}
                </button>
              ))}
            </div>
          </div>
          <div key={adminView} className="animate-fade-in" style={{ flex: 1 }}>
            {adminView === "users" && (
              <div>
                <SectionHeader title="Kelola Akun Petugas &amp; Hak Akses Berdasarkan Tupoksi" subtitle="Sesuai prinsip pemisahan kewenangan (segregation of duties), Administrator tidak memiliki hak mengubah hasil verifikasi medis ataupun menetapkan vonis klaim"/>
                {userMgmtError && <div style={{ padding: "10px 14px", background: "#faecec", color: "#a53e3e", borderRadius: "12px", marginBottom: "12px", fontSize: "12px" }}>{userMgmtError}</div>}
                {userMgmtSuccess && <div style={{ padding: "10px 14px", background: "#d1fae5", color: "#059669", borderRadius: "12px", marginBottom: "12px", fontSize: "12px" }}>{userMgmtSuccess}</div>}
                <form onSubmit={handleCreateUser} className="card" style={{ padding: "18px", marginBottom: "16px" }}>
                  <strong style={{ display: "block", marginBottom: "12px" }}>Registrasi Akun Petugas Baru</strong>
                  <div className="grid-responsive-2" style={{ gap: "10px" }}>
                    {[["Nama Pengguna (Username)", newUsername, setNewUsername, "contoh: verifikator_jateng", "text"], ["Nama Lengkap Petugas", newFullName, setNewFullName, "contoh: Dr. Rina S.", "text"], ["Kata Sandi Akun", newPassword, setNewPassword, "Minimal 8 karakter", "password"]].map(([label, val, setter, ph, type]) => (
                      <div key={label as string}>
                        <label style={{ fontSize: "11px", color: "var(--muted)", display: "block", marginBottom: "4px" }}>{label as string}:</label>
                        <input type={type as string} required value={val as string} onChange={e => (setter as any)(e.target.value)} placeholder={ph as string}
                          style={{ width: "100%", padding: "8px 12px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "12px" }}/>
                      </div>
                    ))}
                    <div>
                      <label style={{ fontSize: "11px", color: "var(--muted)", display: "block", marginBottom: "4px" }}>Tupoksi &amp; Kewenangan:</label>
                      <select value={newRole} onChange={e => setNewRole(e.target.value as AppRole)} style={{ width: "100%", padding: "8px 12px", borderRadius: "10px", border: "1px solid var(--line)", fontSize: "12px" }}>
                        <option value="VERIFIKATOR">VERIFIKATOR — Telaah keabsahan berkas, tarif INA-CBG &amp; pra-pembayaran</option>
                        <option value="INVESTIGATOR">INVESTIGATOR — Telusuri anomali relasi faskes-dokter &amp; investigasi</option>
                        <option value="SUPERVISOR">SUPERVISOR — Pantau antrean berkas, pembagian tugas &amp; eskalasi</option>
                        <option value="DATA_ANALYST">DATA_ANALYST — Pantau kelengkapan berkas &amp; evaluasi akurasi sistem</option>
                        <option value="ADMINISTRATOR">ADMINISTRATOR — Kelola hak akses akun &amp; integritas gerbang sistem</option>
                      </select>
                    </div>
                  </div>
                  <button type="submit" className="button button-primary" style={{ marginTop: "12px" }}>Daftarkan Akun Petugas</button>
                </form>
                <div className="card table-responsive" style={{ padding: "0", overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                    <thead><tr style={{ borderBottom: "1px solid var(--line)", background: "var(--surface)" }}>
                      {["Nama Pengguna", "Nama Lengkap", "Tupoksi / Peran", "Status Akun", "Tanggal Terdaftar", "Tindakan"].map(h => <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: "11px" }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {usersLoading ? (
                        <SkeletonUserRows count={4} />
                      ) : managedUsers.map(u => (
                        <tr key={u.id} style={{ borderBottom: "1px solid var(--line)" }}>
                          <td style={{ padding: "10px 14px", fontFamily: "monospace", fontWeight: 700 }}>{u.username}</td>
                          <td style={{ padding: "10px 14px" }}>{u.fullName}</td>
                          <td style={{ padding: "10px 14px" }}><RoleBadge role={u.role}/></td>
                          <td style={{ padding: "10px 14px" }}><span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "8px", background: u.isActive ? "#d1fae5" : "#fee2e2", color: u.isActive ? "#059669" : "#dc2626" }}>{u.isActive ? "AKTIF" : "NONAKTIF"}</span></td>
                          <td style={{ padding: "10px 14px", fontSize: "11px", color: "var(--muted)" }}>{formatDate(u.createdAt)}</td>
                          <td style={{ padding: "10px 14px" }}>
                            <button onClick={() => toggleUserActive(u.id, u.isActive)} className="button button-secondary" style={{ minHeight: "28px", padding: "4px 10px", fontSize: "11px" }}>{u.isActive ? "Nonaktifkan Akun" : "Aktifkan Akun"}</button>
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
                <SectionHeader title="Kondisi Infrastruktur &amp; Pangkalan Data" subtitle="Status kesiapan server aplikasi dan pangkalan data resmi BPJS" action={<button className="button button-secondary" onClick={fetchHealth}><RefreshCw size={14}/>Periksa Kondisi Sistem</button>}/>
                {healthStatus ? (
                  <div className="grid-responsive-2" style={{ gap: "16px" }}>
                    {[
                      { name: "Pangkalan Data Resmi BPJS (PostgreSQL)", connected: isDbConnected, detail: healthStatus.database },
                      { name: "Layanan Skrining Cerdas Relasi (FastAPI R-GCN)", connected: isAiConnected, detail: healthStatus.ai_engine || healthStatus.ai_service },
                    ].map(svc => (
                      <div key={svc.name} className="card" style={{ padding: "18px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <strong>{svc.name}</strong>
                          <span style={{ fontSize: "11px", fontWeight: 700, padding: "4px 12px", borderRadius: "20px", background: svc.connected ? "#d1fae5" : "#fee2e2", color: svc.connected ? "#059669" : "#dc2626" }}>{svc.connected ? "● SIAP & AKTIF" : "● TIDAK TERHUBUNG"}</span>
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "8px", fontFamily: "monospace", wordBreak: "break-all" }}>{JSON.stringify(svc.detail)}</div>
                      </div>
                    ))}
                    <div className="card" style={{ padding: "18px", gridColumn: "1 / -1" }}>
                      <strong>Data Teknis Kesiapan Server (JSON)</strong>
                      <pre style={{ marginTop: "8px", fontSize: "11px", background: "#f9fafb", padding: "12px", borderRadius: "8px", overflow: "auto" }}>{JSON.stringify(healthStatus, null, 2)}</pre>
                    </div>
                  </div>
                ) : <EmptyState icon={<Activity size={48}/>} message="Belum ada data kesiapan sistem" sub="Klik tombol Periksa Kondisi Sistem"/>}
              </div>
            )}
            {adminView === "audit_trail" && (
              <div>
                <SectionHeader title="Buku Catatan Log Audit Terpadu (Seluruh Sistem)" subtitle="Semua aktivitas penting tercatat resmi dengan identitas petugas, stempel waktu, dan detail perubahan"
                  action={
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                      <div style={{ position: "relative" }}>
                        <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }}/>
                        <input value={auditSearchQuery} onChange={e => setAuditSearchQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && fetchAuditLogs()} placeholder="Cari petugas, aksi, nomor berkas…"
                          style={{ padding: "6px 12px 6px 32px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "12px", width: "190px" }}/>
                      </div>
                      <select value={auditActionFilter} onChange={e => setAuditActionFilter(e.target.value)} style={{ padding: "6px 10px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "12px" }}>
                        <option value="ALL">Semua Jenis Tindakan</option>
                        <option value="CLAIM_INGESTED">Penerimaan Klaim (CLAIM_INGESTED)</option>
                        <option value="CASE_CREATED">Pembuatan Berkas (CASE_CREATED)</option>
                        <option value="CASE_ASSIGNED">Penugasan Berkas (CASE_ASSIGNED)</option>
                        <option value="CASE_TRANSITIONED">Perubahan Status (CASE_TRANSITIONED)</option>
                        <option value="HUMAN_REVIEW_RELEASE">Persetujuan Sah (HUMAN_REVIEW_RELEASE)</option>
                        <option value="HUMAN_REVIEW_CLARIFY">Klarifikasi Faskes (HUMAN_REVIEW_CLARIFY)</option>
                        <option value="HUMAN_REVIEW_ESCALATE_AUDIT">Eskalasi ke Audit (HUMAN_REVIEW_ESCALATE_AUDIT)</option>
                        <option value="ADMIN_USER_CREATED">Pendaftaran Akun (ADMIN_USER_CREATED)</option>
                      </select>
                      <button className="button button-secondary" onClick={exportAuditCsv}>
                        <Download size={14}/> Unduh Rekap Log (CSV)
                      </button>
                      <button className="button button-secondary" onClick={fetchAuditLogs} disabled={auditLoading}><RefreshCw size={14} className={auditLoading ? "animate-spin" : ""}/>Segarkan</button>
                    </div>
                  }/>
                {auditLoading ? (
                  <SkeletonTable
                    headers={["Waktu Aktivitas", "Nama Petugas", "Tupoksi / Peran", "Jenis Tindakan", "Nomor Berkas / Target", "Keterangan Lengkap"]}
                    rows={6}
                  />
                ) : (
                  <div className="card table-responsive" style={{ padding: "0", overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                      <thead><tr style={{ borderBottom: "1px solid var(--line)", background: "var(--surface)" }}>
                        {["Waktu Aktivitas", "Nama Petugas", "Tupoksi / Peran", "Jenis Tindakan", "Nomor Berkas / Target", "Keterangan Lengkap"].map(h => <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: "11px" }}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {auditLogs.length === 0 ? <tr><td colSpan={6} style={{ textAlign: "center", padding: "32px", color: "var(--muted)" }}>Belum ada log audit tersimpan</td></tr>
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
  // MAIN RENDER (PRODUCTION AUTH GATE & LAYOUT)
  // ============================================================

  if (authChecking) {
    return (
      <div
        style={{
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(ellipse at top, #0d281e 0%, #06140e 60%, #030805 100%)",
          color: "#ffffff",
          fontFamily: "'Manrope', sans-serif",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            className="animate-spin"
            style={{
              width: "44px",
              height: "44px",
              border: "3px solid rgba(52, 211, 153, 0.2)",
              borderTopColor: "#34d399",
              borderRadius: "50%",
              margin: "0 auto 16px auto",
            }}
          />
          <div style={{ fontSize: "15px", fontWeight: 700, color: "#34d399" }}>
            Memverifikasi Sesi Kredensial BPJS...
          </div>
          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
            Pangkalan Data PostgreSQL Terenkripsi
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser.token) {
    return (
      <LoginPage
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          setAuthChecking(false);
        }}
        backendUrl={BACKEND_URL}
      />
    );
  }

  return (
    <>
      {/* Offline Alert Banner */}
      {!isOnline && (
        <div
          style={{
            background: "#7f1d1d",
            color: "#fecaca",
            padding: "8px 14px",
            fontSize: "11px",
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            width: "100%",
            borderRadius: "14px",
            marginBottom: "8px",
            boxSizing: "border-box",
          }}
        >
          <WifiOff size={14} />
          <span>Mode Offline Terdeteksi: Sambungan internet terputus. Cache lokal PWA aktif.</span>
        </div>
      )}

      {/* TOPBAR */}
      <header className="topbar">
        <div className="topbar-brand" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            className="mobile-menu-toggle"
            onClick={() => setMobileMenuOpen(true)}
            title="Buka Menu Navigasi"
            aria-label="Buka Menu Navigasi"
          >
            <Menu size={19} />
          </button>
          <div className="brand" style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }} onClick={() => setActiveSection("overview")}>
            <div className="brand-symbol">
              <ShieldCheck size={24} strokeWidth={2.4}/>
            </div>
            <div className="brand-name">
              AURA<span>JKN</span>
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
          <button
            className="button button-secondary topbar-desktop-btn"
            style={{
              minHeight: "36px",
              padding: "6px 12px",
              fontSize: "12px",
              borderRadius: "20px",
              alignItems: "center",
              gap: "6px",
              background: isDesktopStandalone ? "#f0fdf4" : "var(--surface)",
              color: isDesktopStandalone ? "#15803d" : "#334155",
              border: isDesktopStandalone ? "1px solid #86efac" : "1px solid var(--line)"
            }}
            onClick={() => setShowDesktopModal(true)}
            title={isDesktopStandalone ? "Aplikasi Desktop Mandiri Aktif" : "Pasang Aplikasi Desktop Windows"}
          >
            {isDesktopStandalone ? (
              <CheckCircle2 size={14} style={{ color: "#16a34a" }} />
            ) : (
              <Monitor size={14} style={{ color: "#098a58" }} />
            )}
            <span style={{ fontWeight: 600 }}>
              {isDesktopStandalone ? "Desktop App" : "App Desktop"}
            </span>
          </button>
          {/* Bell Notification Button */}
          <button
            className="icon-button"
            style={{
              position: "relative",
              width: "36px",
              height: "36px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "50%",
              background: showNotifCenter ? "#e2e8f0" : "transparent",
            }}
            title={`Pusat Notifikasi Operasional (${unreadNotifCount} belum dibaca)`}
            onClick={() => setShowNotifCenter(v => !v)}
          >
            <Bell size={18} style={{ color: unreadNotifCount > 0 ? "#0f172a" : "#64748b" }} />
            {unreadNotifCount > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: "2px",
                  right: "2px",
                  minWidth: "16px",
                  height: "16px",
                  padding: "0 4px",
                  borderRadius: "8px",
                  background: "#dc2626",
                  color: "#ffffff",
                  fontSize: "10px",
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "2px solid #ffffff",
                  boxShadow: "0 2px 4px rgba(220, 38, 38, 0.4)",
                }}
              >
                {unreadNotifCount > 99 ? "99+" : unreadNotifCount}
              </span>
            )}
          </button>
          <div className="relative">
            <button className="button button-secondary topbar-role-btn" onClick={() => setRoleMenuOpen(v => !v)}>
              <UserCheck size={14} style={{ color: rCfg.color }}/>
              <span className="role-full-label">{rCfg.label}</span>
              <span className="role-short-label">{ROLE_SHORT_LABELS[currentUser.role] || "Peran"}</span>
              <ChevronDown size={13}/>
            </button>
            {roleMenuOpen && (
              <div className="card animate-slide-down" style={{ position: "absolute", right: 0, top: "44px", zIndex: 50, padding: "8px", borderRadius: "16px", width: "240px", maxWidth: "calc(100vw - 24px)", boxShadow: "0 10px 25px rgba(0,0,0,0.12)" }}>
                <div style={{ padding: "6px 10px", fontSize: "10px", color: "var(--muted)", fontWeight: 700 }}>PILIH PERAN OPERASIONAL (RBAC):</div>
                {(["ADMINISTRATOR","VERIFIKATOR","INVESTIGATOR","SUPERVISOR","DATA_ANALYST"] as const).map(role => {
                  const cfg = ROLE_CONFIG[role];
                  return (
                    <button key={role} onClick={() => { switchRole(role); setRoleMenuOpen(false); }} style={{ width: "100%", textAlign: "left", padding: "8px 12px", borderRadius: "10px", fontSize: "12px", fontWeight: currentUser.role === role ? 700 : 400, color: currentUser.role === role ? cfg.color : "#374151", background: currentUser.role === role ? cfg.bg : "transparent", cursor: "pointer", border: "none" }}>
                      <div style={{ fontWeight: 700 }}>{cfg.label}</div>
                      <div style={{ fontSize: "10px", color: "var(--muted)", fontWeight: 400 }}>{cfg.description}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="topbar-divider"/>
          <div className="relative">
            <button
              className="profile-button"
              title={currentUser.fullName}
              onClick={() => setProfileMenuOpen(v => !v)}
              style={{ cursor: "pointer" }}
            >
              <span className="avatar avatar-profile" style={{ background: rCfg.bg, color: rCfg.color, border: `2px solid ${rCfg.color}` }}>
                {currentUser.fullName ? currentUser.fullName.substring(0, 2).toUpperCase() : "US"}
              </span>
            </button>
            {profileMenuOpen && (
              <div
                className="card animate-slide-down"
                style={{
                  position: "absolute",
                  right: 0,
                  top: "48px",
                  zIndex: 60,
                  padding: "16px",
                  borderRadius: "18px",
                  width: "280px",
                  maxWidth: "calc(100vw - 24px)",
                  boxShadow: "0 15px 35px rgba(0,0,0,0.18)",
                  background: "#ffffff",
                  border: "1px solid #e2e8f0"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
                  <span className="avatar avatar-profile" style={{ width: "40px", height: "40px", fontSize: "15px", background: rCfg.bg, color: rCfg.color, border: `2px solid ${rCfg.color}` }}>
                    {currentUser.fullName ? currentUser.fullName.substring(0, 2).toUpperCase() : "US"}
                  </span>
                  <div style={{ overflow: "hidden" }}>
                    <div style={{ fontWeight: 800, fontSize: "13px", color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {currentUser.fullName}
                    </div>
                    <div style={{ fontSize: "11px", color: "#64748b" }}>
                      @{currentUser.username}
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: "12px" }}>
                  <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "8px", background: rCfg.bg, color: rCfg.color }}>
                    {rCfg.label}
                  </span>
                </div>

                <div style={{ background: "#f8fafc", padding: "8px 10px", borderRadius: "10px", fontSize: "11px", color: "#64748b", marginBottom: "14px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Lock size={12} style={{ color: "#098a58" }} />
                  <span>Sesi Aman Kriptografis HMAC</span>
                </div>

                <button
                  onClick={handleLogout}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    padding: "10px",
                    borderRadius: "10px",
                    background: "#fef2f2",
                    color: "#dc2626",
                    fontWeight: 700,
                    fontSize: "12px",
                    border: "1px solid #fecaca",
                    cursor: "pointer",
                    transition: "all 0.2s ease"
                  }}
                >
                  <LogOut size={14} />
                  <span>Keluar dari Sistem (Logout)</span>
                </button>
              </div>
            )}
          </div>
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
          <button title="Simulasi Pengajuan Klaim Baru" onClick={() => setShowSimulatorModal(true)}>
            <PlusCircle size={20} strokeWidth={1.6}/><span className="sidebar-tooltip">Simulasi Pengajuan Klaim</span>
          </button>
          <button title="Prinsip Integritas Data Aktif" onClick={() => alert("AURA-JKN Zero Mock Policy Aktif: Seluruh data bersumber dari pangkalan data resmi BPJS (PostgreSQL). Tidak ada skor atau grafik yang direkayasa.")}>
            <ShieldCheck size={20} strokeWidth={1.6} style={{ color: "var(--green)" }}/><span className="sidebar-tooltip">Integritas Data Terjamin (Zero Mock)</span>
          </button>
        </nav>
        <nav className="sidebar-group sidebar-bottom">
          <button title="Pangkalan Data" onClick={fetchClaims}>
            <Database size={20} strokeWidth={1.6}/><span className="sidebar-tooltip">{data?.summary.total_claims?.toLocaleString("id-ID") ?? "—"} Berkas di Database</span>
          </button>
        </nav>
      </aside>

      {/* MAIN CONTENT */}
      <main id="main-content" className="main-content">
        {/* Global Review Banner */}
        {reviewBanner && activeSection !== "investigation" && (
          <div className="animate-slide-down" style={{ padding: "12px 16px", borderRadius: "12px", marginBottom: "16px", background: reviewBanner.success ? "#d1fae5" : "#fee2e2", color: reviewBanner.success ? "#059669" : "#dc2626", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "13px", fontWeight: 600 }}>{reviewBanner.message}</span>
            <button onClick={() => setReviewBanner(null)} className="icon-button"><X size={14}/></button>
          </div>
        )}

        {/* Section Router */}
        <div key={activeSection} className="animate-fade-in">
          {activeSection === "overview" && renderOverview()}
          {activeSection === "investigation" && renderInvestigation()}
          {activeSection === "data_intelligence" && renderDataIntelligence()}
          {activeSection === "reports" && renderReports()}
          {activeSection === "administration" && renderAdministration()}
        </div>
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

      {/* DESKTOP INSTALL MODAL */}
      <DesktopInstallModal
        isOpen={showDesktopModal}
        onClose={() => setShowDesktopModal(false)}
        deferredPrompt={installPrompt}
        isStandalone={isDesktopStandalone}
        onTriggerInstall={handleTriggerDesktopInstall}
      />

      {/* NOTIFICATION CENTER */}
      <NotificationCenter
        isOpen={showNotifCenter}
        onClose={() => setShowNotifCenter(false)}
        notifications={notifications}
        unreadCount={unreadNotifCount}
        onMarkAsRead={handleMarkAsRead}
        onMarkAllAsRead={handleMarkAllAsRead}
        onRefresh={fetchNotifications}
        onNavigate={handleNotificationNavigate}
        activeRole={currentUser.role}
        roleLabel={rCfg.label}
        roleBg={rCfg.bg}
        roleColor={rCfg.color}
      />

      {/* MOBILE SLIDE-OVER NAVIGATION DRAWER */}
      {mobileMenuOpen && (
        <div
          className="mobile-drawer-backdrop"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="mobile-drawer-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="mobile-drawer-header">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span className="avatar avatar-profile" style={{ width: "38px", height: "38px", fontSize: "14px", background: rCfg.bg, color: rCfg.color, border: `2px solid ${rCfg.color}` }}>
                  {currentUser.fullName ? currentUser.fullName.substring(0, 2).toUpperCase() : "US"}
                </span>
                <div style={{ overflow: "hidden" }}>
                  <div style={{ fontWeight: 800, fontSize: "13px", color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {currentUser.fullName}
                  </div>
                  <div style={{ fontSize: "11px", color: "#64748b" }}>
                    @{currentUser.username} &bull; <span style={{ fontWeight: 700, color: rCfg.color }}>{ROLE_SHORT_LABELS[currentUser.role] || currentUser.role}</span>
                  </div>
                </div>
              </div>
              <button
                className="icon-button"
                onClick={() => setMobileMenuOpen(false)}
                title="Tutup Menu"
                style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#f1f5f9" }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Drawer Body Scroll */}
            <div className="mobile-drawer-body">
              {/* Role Switcher Pill Bar */}
              <div style={{ marginBottom: "18px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Peran Operasional (RBAC):
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                  {(["ADMINISTRATOR", "VERIFIKATOR", "INVESTIGATOR", "SUPERVISOR", "DATA_ANALYST"] as const).map(role => {
                    const cfg = ROLE_CONFIG[role];
                    const isCurrent = currentUser.role === role;
                    return (
                      <button
                        key={role}
                        onClick={() => { switchRole(role); setMobileMenuOpen(false); }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "8px 12px",
                          borderRadius: "10px",
                          border: isCurrent ? `1.5px solid ${cfg.color}` : "1px solid #f1f5f9",
                          background: isCurrent ? cfg.bg : "#ffffff",
                          color: isCurrent ? cfg.color : "#475569",
                          fontWeight: isCurrent ? 700 : 500,
                          fontSize: "12px",
                          textAlign: "left",
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: isCurrent ? cfg.color : "#cbd5e1" }} />
                          <span>{cfg.label}</span>
                        </div>
                        {isCurrent && <span style={{ fontSize: "10px", fontWeight: 800, padding: "1px 6px", borderRadius: "6px", background: cfg.color, color: "#ffffff" }}>AKTIF</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Navigation Sections */}
              <div style={{ marginBottom: "18px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Navigasi Utama:
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  {NAV_ITEMS.filter(n => n.roles.includes("all") || n.roles.includes(currentUser.role)).map(n => {
                    const isActive = activeSection === n.key;
                    return (
                      <button
                        key={n.key}
                        onClick={() => {
                          setActiveSection(n.key);
                          setMobileMenuOpen(false);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          padding: "10px 12px",
                          borderRadius: "12px",
                          border: "none",
                          background: isActive ? "#eef7f2" : "transparent",
                          color: isActive ? "var(--dark-green)" : "#334155",
                          fontWeight: isActive ? 700 : 500,
                          fontSize: "13px",
                          textAlign: "left",
                          cursor: "pointer",
                        }}
                      >
                        <span style={{ color: isActive ? "var(--green)" : "#64748b" }}>{n.icon}</span>
                        <span>{n.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Quick Actions & Tools */}
              <div style={{ marginBottom: "18px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Aksi &amp; Fitur Operasional:
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <button
                    onClick={() => { setShowSimulatorModal(true); setMobileMenuOpen(false); }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "10px 12px",
                      borderRadius: "12px",
                      border: "1px solid #bbf7d0",
                      background: "#f0fdf4",
                      color: "#166534",
                      fontWeight: 700,
                      fontSize: "12px",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <PlusCircle size={16} style={{ color: "var(--green)" }} />
                    <span>Simulasi Pemasukan Klaim Baru</span>
                  </button>
                  <button
                    onClick={() => { setShowNotifCenter(true); setMobileMenuOpen(false); }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 12px",
                      borderRadius: "12px",
                      border: "1px solid var(--line)",
                      background: "#ffffff",
                      color: "#334155",
                      fontWeight: 600,
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <Bell size={16} style={{ color: "#64748b" }} />
                      <span>Pusat Notifikasi Operasional</span>
                    </div>
                    {unreadNotifCount > 0 && (
                      <span style={{ padding: "1px 6px", borderRadius: "8px", background: "#dc2626", color: "#fff", fontSize: "10px", fontWeight: 800 }}>
                        {unreadNotifCount}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => { setShowDesktopModal(true); setMobileMenuOpen(false); }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "10px 12px",
                      borderRadius: "12px",
                      border: "1px solid var(--line)",
                      background: "#ffffff",
                      color: "#334155",
                      fontWeight: 600,
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                  >
                    <Monitor size={16} style={{ color: "#098a58" }} />
                    <span>Aplikasi Desktop Windows Mandiri</span>
                  </button>
                </div>
              </div>

              {/* System Integrity & Logout */}
              <div style={{ marginTop: "auto", paddingTop: "14px", borderTop: "1px solid #f1f5f9" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "var(--muted)", marginBottom: "12px" }}>
                  <ShieldCheck size={14} style={{ color: "var(--green)" }} />
                  <span>Integritas Pangkalan Data Resmi (Zero Mock)</span>
                </div>
                <button
                  onClick={handleLogout}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    padding: "10px",
                    borderRadius: "12px",
                    background: "#fef2f2",
                    color: "#dc2626",
                    fontWeight: 700,
                    fontSize: "12px",
                    border: "1px solid #fecaca",
                    cursor: "pointer",
                  }}
                >
                  <LogOut size={15} />
                  <span>Keluar dari Sistem (Logout)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <nav className="mobile-bottom-nav" aria-label="Navigasi Bawah Seluler">
        <button
          onClick={() => {
            setActiveSection("overview");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          className={`mobile-bottom-nav-item ${activeSection === "overview" && !mobileMenuOpen ? "active" : ""}`}
          aria-label="Beranda"
        >
          <div className="mobile-nav-icon"><LayoutGrid size={19} /></div>
          <span className="mobile-nav-label">Beranda</span>
        </button>

        <button
          onClick={() => {
            setActiveSection("investigation");
            setInvestigationView("queue");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          className={`mobile-bottom-nav-item ${activeSection === "investigation" && investigationView !== "graph" && !mobileMenuOpen ? "active" : ""}`}
          aria-label="Kasus"
        >
          <div className="mobile-nav-icon" style={{ position: "relative" }}>
            <ClipboardList size={19} />
            {cases.length > 0 && (
              <span className="mobile-nav-badge">{cases.length}</span>
            )}
          </div>
          <span className="mobile-nav-label">Kasus</span>
        </button>

        <button
          onClick={() => {
            setActiveSection("investigation");
            setInvestigationView("graph");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          className={`mobile-bottom-nav-item ${activeSection === "investigation" && investigationView === "graph" && !mobileMenuOpen ? "active" : ""}`}
          aria-label="Peta Graf"
        >
          <div className="mobile-nav-icon"><Network size={19} /></div>
          <span className="mobile-nav-label">Graf</span>
        </button>

        <button
          onClick={() => {
            setActiveSection("data_intelligence");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          className={`mobile-bottom-nav-item ${activeSection === "data_intelligence" && !mobileMenuOpen ? "active" : ""}`}
          aria-label="Pusat Data"
        >
          <div className="mobile-nav-icon"><Database size={19} /></div>
          <span className="mobile-nav-label">Data</span>
        </button>

        <button
          onClick={() => setMobileMenuOpen(true)}
          className={`mobile-bottom-nav-item ${mobileMenuOpen ? "active" : ""}`}
          aria-label="Menu Lengkap"
        >
          <div className="mobile-nav-icon" style={{ position: "relative" }}>
            <SlidersHorizontal size={19} />
            {unreadNotifCount > 0 && (
              <span className="mobile-nav-dot" />
            )}
          </div>
          <span className="mobile-nav-label">Menu</span>
        </button>
      </nav>
    </>
  );
}

export default App;
