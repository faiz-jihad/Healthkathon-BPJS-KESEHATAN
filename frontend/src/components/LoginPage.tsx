import React, { useState } from "react";
import {
  Eye,
  EyeOff,
  ChevronDown,
  Info,
  Check,
  ShieldCheck,
  Sparkles,
  AlertCircle,
  ArrowRight,
  Shield,
  Lock,
} from "lucide-react";

interface LoginPageProps {
  onLoginSuccess: (user: {
    id: string;
    username: string;
    fullName: string;
    role: any;
    token: string;
  }) => void;
  backendUrl: string;
}

const PRESET_ACCOUNTS = [
  {
    role: "VERIFIKATOR",
    label: "Petugas Verifikator",
    username: "verifier_aura",
    password: "verifier_password_2026",
    fullName: "dr. Andi Pratama, Sp.PD",
    desc: "Verifikasi pra-pembayaran klaim & audit berkas INA-CBG",
  },
  {
    role: "INVESTIGATOR",
    label: "Investigator Anti-Fraud",
    username: "investigator_aura",
    password: "investigator_password_2026",
    fullName: "Budi Santoso, S.H.",
    desc: "Analisis jejaring graf relasi faskes-dokter & sindikat",
  },
  {
    role: "SUPERVISOR",
    label: "Supervisor Antrean",
    username: "supervisor_aura",
    password: "supervisor_password_2026",
    fullName: "Dra. Siti Rahmawati, M.Kes",
    desc: "Persetujuan eskalasi, pemantauan SLA 24 jam & beban tim",
  },
  {
    role: "DATA_ANALYST",
    label: "Analis Mutu Data",
    username: "analyst_aura",
    password: "analyst_password_2026",
    fullName: "Rendra Kurniawan, M.Kom",
    desc: "Evaluasi model AI Graph RGCN & kalibrasi ambang batas",
  },
  {
    role: "ADMINISTRATOR",
    label: "Administrator Keamanan",
    username: "admin_aura",
    password: "admin_password_2026",
    fullName: "Admin Sistem AURA-JKN",
    desc: "Manajemen akun RBAC, jejak audit & integritas sistem",
  },
];

/**
 * Geometric Bauhaus / Neo-Constructivist Vector Art
 * Precision-scaled SVG vector mosaic replicating the exact green geometric tiles from the design.
 */
const GeometricBauhausArt: React.FC = () => {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        maxWidth: "460px",
        aspectRatio: "1 / 1",
        borderRadius: "20px",
        overflow: "hidden",
        backgroundColor: "#224A1E",
        boxShadow: "0 12px 30px -8px rgba(34, 74, 30, 0.25)",
      }}
    >
      {/* Floating mini badge logo at top-left matching design */}
      <div
        style={{
          position: "absolute",
          top: "16px",
          left: "16px",
          zIndex: 5,
          width: "36px",
          height: "36px",
          borderRadius: "10px",
          backgroundColor: "#84CC16",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path
            d="M5 5C13 5 19 11 19 19H12C12 15.13 8.87 12 5 12V5Z"
            fill="#1E3E1A"
          />
          <circle cx="9" cy="9" r="2.5" fill="#A3E635" />
        </svg>
      </div>

      <svg
        viewBox="0 0 400 400"
        style={{ width: "100%", height: "100%", display: "block" }}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <clipPath id="tile-clip">
            <rect width="400" height="400" rx="20" />
          </clipPath>
        </defs>

        <g clipPath="url(#tile-clip)">
          {/* Base Background Grid */}
          <rect width="400" height="400" fill="#224A1E" />

          {/* ========================================================= */}
          {/* ROW 1 (y: 0 - 133) */}
          {/* ========================================================= */}
          {/* Tile (0,0): Deep Green base with quarter-circle cuts */}
          <rect x="0" y="0" width="133" height="133" fill="#2B5523" />
          <path
            d="M 0,0 L 60,0 C 60,60 120,60 120,133 L 0,133 Z"
            fill="#1E3E1A"
          />
          <path
            d="M 60,0 C 60,70 0,70 0,133 L 133,133 L 133,0 Z"
            fill="#3F762E"
            opacity="0.9"
          />

          {/* Tile (1,0): Bright Lime diagonal triangles & quarter circle */}
          <rect x="133" y="0" width="134" height="133" fill="#1E3E1A" />
          <polygon points="133,0 267,0 267,60" fill="#84CC16" />
          <polygon points="133,0 267,60 190,133 133,133" fill="#A3E635" />
          <polygon points="190,133 267,60 267,133" fill="#2B5523" />

          {/* Tile (2,0): Deep olive corner blocks */}
          <rect x="267" y="0" width="133" height="133" fill="#1C3817" />
          <path
            d="M 400,0 C 326,0 267,59 267,133 L 400,133 Z"
            fill="#346624"
          />
          <path
            d="M 400,0 C 350,0 310,40 310,90 L 400,90 Z"
            fill="#1C3817"
          />

          {/* ========================================================= */}
          {/* ROW 2 (y: 133 - 267) */}
          {/* ========================================================= */}
          {/* Tile (0,1): Massive curved quarter band (Left Road) */}
          <rect x="0" y="133" width="133" height="134" fill="#1C3817" />
          <path
            d="M 133,133 C 59,133 0,192 0,267 L 50,267 C 50,221 87,183 133,183 Z"
            fill="#84CC16"
          />
          <path
            d="M 133,183 C 87,183 50,221 50,267 L 133,267 Z"
            fill="#152B11"
          />

          {/* Tile (1,1): The iconic central leaf / petal in vibrant lime */}
          <rect x="133" y="133" width="134" height="134" fill="#1C3817" />
          <path
            d="M 133,267 C 133,193 200,133 267,133 C 267,207 200,267 133,267 Z"
            fill="#A3E635"
          />
          <path
            d="M 160,267 C 160,210 215,160 267,160 C 267,215 215,267 160,267 Z"
            fill="#BEF264"
            opacity="0.8"
          />

          {/* Tile (2,1): Large Concentric Target Bullseye with Square Cutout */}
          <rect x="267" y="133" width="133" height="134" fill="#1C3817" />
          {/* Outer Lime Ring */}
          <circle cx="334" cy="200" r="66" fill="#84CC16" />
          {/* Inner Dark Green Ring */}
          <circle cx="334" cy="200" r="46" fill="#1E3E1A" />
          {/* Center Lime Core */}
          <circle cx="334" cy="200" r="24" fill="#A3E635" />
          {/* Inset square notch cutting through bottom-left quadrant of target */}
          <rect x="267" y="200" width="67" height="67" fill="#84CC16" />
          <path
            d="M 267,200 L 334,200 L 334,267 L 267,267 Z"
            fill="#84CC16"
          />
          <path
            d="M 300,200 L 334,200 L 334,234 L 300,234 Z"
            fill="#A3E635"
          />

          {/* ========================================================= */}
          {/* ROW 3 (y: 267 - 400) */}
          {/* ========================================================= */}
          {/* Tile (0,2): Bottom Left Concentric Band Arcs */}
          <rect x="0" y="267" width="133" height="133" fill="#2B5523" />
          <path
            d="M 0,267 L 50,267 C 50,313 87,350 133,350 L 133,400 C 59,400 0,341 0,267 Z"
            fill="#1E3E1A"
          />
          <path
            d="M 0,334 C 36,334 66,364 66,400 L 0,400 Z"
            fill="#A3E635"
          />

          {/* Tile (1,2): Diagonal curved fan segments */}
          <rect x="133" y="267" width="134" height="133" fill="#224A1E" />
          <path
            d="M 133,267 C 207,267 267,327 267,400 L 133,400 Z"
            fill="#3F762E"
          />
          <path
            d="M 133,334 C 170,334 200,364 200,400 L 133,400 Z"
            fill="#84CC16"
          />
          <path
            d="M 133,367 C 151,367 167,383 167,400 L 133,400 Z"
            fill="#A3E635"
          />

          {/* Tile (2,2): Bottom Right Geometric Quarter Cut */}
          <rect x="267" y="267" width="133" height="133" fill="#1C3817" />
          <path
            d="M 400,267 C 326,267 267,326 267,400 L 334,400 C 334,363 363,334 400,334 Z"
            fill="#84CC16"
          />
          <path
            d="M 400,334 C 363,334 334,363 334,400 L 400,400 Z"
            fill="#A3E635"
          />
        </g>
      </svg>
    </div>
  );
};

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess, backendUrl }) => {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [username, setUsername] = useState("verifier_aura");
  const [password, setPassword] = useState("verifier_password_2026");
  const [firstName, setFirstName] = useState("Andi");
  const [lastName, setLastName] = useState("Pratama");
  const [selectedRole, setSelectedRole] = useState("VERIFIKATOR");
  const [selectedMonth, setSelectedMonth] = useState("January");
  const [dobDay, setDobDay] = useState("15");
  const [dobYear, setDobYear] = useState("1988");
  const [countryRegion, setCountryRegion] = useState("Indonesia (Kantor Pusat BPJS Kesehatan)");

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (e?: React.FormEvent, customUser?: string, customPass?: string) => {
    if (e) e.preventDefault();
    const finalUser = (customUser || username).trim();
    const finalPass = customPass || password;

    if (!finalUser || !finalPass) {
      setErrorMsg("Mohon masukkan nama pengguna / NIP dan kata sandi.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`${backendUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: finalUser,
          password: finalPass,
        }),
      });

      const json = await res.json();

      if (res.ok && json.token && json.user) {
        sessionStorage.setItem("aura_token", json.token);
        onLoginSuccess({
          id: json.user.id,
          username: json.user.username,
          fullName: json.user.fullName,
          role: json.user.role,
          token: json.token,
        });
      } else {
        setErrorMsg(json.error || "Gagal masuk: kredensial tidak valid.");
      }
    } catch (err: any) {
      setErrorMsg(`Koneksi ke backend gagal: ${err?.message || "Server tidak dapat dihubungi"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPreset = (acc: typeof PRESET_ACCOUNTS[0]) => {
    setUsername(acc.username);
    setPassword(acc.password);
    setSelectedRole(acc.role);
    setFirstName(acc.fullName.split(" ")[0]);
    setLastName(acc.fullName.split(" ").slice(1).join(" "));
    handleSubmit(undefined, acc.username, acc.password);
  };

  const handleRoleDropdownChange = (roleKey: string) => {
    setSelectedRole(roleKey);
    const matched = PRESET_ACCOUNTS.find((a) => a.role === roleKey);
    if (matched) {
      setUsername(matched.username);
      setPassword(matched.password);
      setFirstName(matched.fullName.split(" ")[0]);
      setLastName(matched.fullName.split(" ").slice(1).join(" "));
    }
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#F9FAF8",
        padding: "32px 16px",
        position: "relative",
        overflow: "hidden",
        fontFamily: "'Manrope', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {/* ========================================================================= */}
      {/* Decorative Floating Lime Orbs (Matching the Exact Visual Atmosphere)     */}
      {/* ========================================================================= */}
      {/* Top-Right Big Lime Orb */}
      <div
        style={{
          position: "absolute",
          top: "40px",
          right: "40px",
          width: "120px",
          height: "120px",
          borderRadius: "50%",
          backgroundColor: "#A3E635",
          opacity: 0.9,
          pointerEvents: "none",
        }}
      />
      {/* Top-Right Small Lime Orb */}
      <div
        style={{
          position: "absolute",
          top: "20px",
          right: "180px",
          width: "36px",
          height: "36px",
          borderRadius: "50%",
          backgroundColor: "#A3E635",
          opacity: 0.85,
          pointerEvents: "none",
        }}
      />
      {/* Bottom-Left Big Lime Orb */}
      <div
        style={{
          position: "absolute",
          bottom: "-50px",
          left: "-30px",
          width: "200px",
          height: "200px",
          borderRadius: "50%",
          backgroundColor: "#A3E635",
          opacity: 0.85,
          pointerEvents: "none",
        }}
      />
      {/* Bottom-Left Small Lime Orb */}
      <div
        style={{
          position: "absolute",
          bottom: "80px",
          left: "140px",
          width: "44px",
          height: "44px",
          borderRadius: "50%",
          backgroundColor: "#A3E635",
          opacity: 0.9,
          pointerEvents: "none",
        }}
      />

      {/* ========================================================================= */}
      {/* Main Elevated Card Container (White with Rounded Corners & Subtly Spaced) */}
      {/* ========================================================================= */}
      <div
        style={{
          width: "100%",
          maxWidth: "1080px",
          backgroundColor: "#FFFFFF",
          borderRadius: "28px",
          boxShadow:
            "0 30px 70px -15px rgba(34, 74, 30, 0.08), 0 10px 30px -5px rgba(0, 0, 0, 0.04), 0 0 0 1px rgba(0, 0, 0, 0.03)",
          padding: "48px 52px",
          position: "relative",
          zIndex: 10,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(320px, 440px) 1fr",
            gap: "56px",
            alignItems: "center",
          }}
          className="login-grid-container"
        >
          {/* ------------------------------------------------------------- */}
          {/* Left Column: Geometric Bauhaus Mosaic Graphic                 */}
          {/* ------------------------------------------------------------- */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              width: "100%",
            }}
          >
            <GeometricBauhausArt />
          </div>

          {/* ------------------------------------------------------------- */}
          {/* Right Column: Clean Minimalist Form                           */}
          {/* ------------------------------------------------------------- */}
          <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
            {/* Form Title & Switch Link */}
            <div>
              <h1
                style={{
                  fontSize: "32px",
                  fontWeight: 800,
                  color: "#1E293B",
                  letterSpacing: "-0.03em",
                  margin: 0,
                  lineHeight: 1.2,
                }}
              >
                {mode === "signin" ? "Masuk ke Akun" : "Create an account"}
              </h1>
              <p
                style={{
                  fontSize: "14px",
                  color: "#64748B",
                  marginTop: "8px",
                  marginBottom: 0,
                  fontWeight: 500,
                }}
              >
                {mode === "signin" ? (
                  <>
                    Belum memiliki akses dinas?{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setMode("signup");
                        setErrorMsg(null);
                      }}
                      style={{
                        color: "#0284C7",
                        fontWeight: 600,
                        textDecoration: "none",
                        padding: 0,
                        cursor: "pointer",
                      }}
                    >
                      Daftar Petugas Baru
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setMode("signin");
                        setErrorMsg(null);
                      }}
                      style={{
                        color: "#0284C7",
                        fontWeight: 600,
                        textDecoration: "none",
                        padding: 0,
                        cursor: "pointer",
                      }}
                    >
                      Sign in
                    </button>
                  </>
                )}
              </p>
            </div>

            {/* Error Notification Banner */}
            {errorMsg && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "10px 14px",
                  borderRadius: "10px",
                  backgroundColor: "#FEF2F2",
                  border: "1px solid #FCA5A5",
                  color: "#DC2626",
                  fontSize: "13px",
                  fontWeight: 500,
                }}
              >
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Success Notification Banner */}
            {successMsg && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "10px 14px",
                  borderRadius: "10px",
                  backgroundColor: "#F0FDF4",
                  border: "1px solid #86EFAC",
                  color: "#16A34A",
                  fontSize: "13px",
                  fontWeight: 500,
                }}
              >
                <Check size={16} style={{ flexShrink: 0 }} />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Form Fields */}
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Field 1: Email / Username */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label
                  style={{
                    fontSize: "13px",
                    fontWeight: 500,
                    color: "#64748B",
                  }}
                >
                  {mode === "signin" ? "Email address / NIP" : "Email address"}
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={mode === "signin" ? "verifier_aura / nama@bpjs-kesehatan.go.id" : "nama.petugas@bpjs-kesehatan.go.id"}
                  required
                  style={{
                    width: "100%",
                    padding: "8px 0",
                    border: "none",
                    borderBottom: "1.5px solid #E2E8F0",
                    fontSize: "15px",
                    color: "#1E293B",
                    fontWeight: 500,
                    outline: "none",
                    backgroundColor: "transparent",
                    transition: "border-color 0.2s ease",
                  }}
                  onFocus={(e) => (e.target.style.borderBottomColor = "#65A30D")}
                  onBlur={(e) => (e.target.style.borderBottomColor = "#E2E8F0")}
                />
              </div>

              {/* Field 2 (Signup Mode): First Name & Last Name */}
              {mode === "signup" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 500, color: "#64748B" }}>
                      First name
                    </label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Andi"
                      style={{
                        width: "100%",
                        padding: "8px 0",
                        border: "none",
                        borderBottom: "1.5px solid #E2E8F0",
                        fontSize: "15px",
                        color: "#1E293B",
                        fontWeight: 500,
                        outline: "none",
                        backgroundColor: "transparent",
                      }}
                      onFocus={(e) => (e.target.style.borderBottomColor = "#65A30D")}
                      onBlur={(e) => (e.target.style.borderBottomColor = "#E2E8F0")}
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 500, color: "#64748B" }}>
                      Last name
                    </label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Pratama"
                      style={{
                        width: "100%",
                        padding: "8px 0",
                        border: "none",
                        borderBottom: "1.5px solid #E2E8F0",
                        fontSize: "15px",
                        color: "#1E293B",
                        fontWeight: 500,
                        outline: "none",
                        backgroundColor: "transparent",
                      }}
                      onFocus={(e) => (e.target.style.borderBottomColor = "#65A30D")}
                      onBlur={(e) => (e.target.style.borderBottomColor = "#E2E8F0")}
                    />
                  </div>
                </div>
              )}

              {/* Field 3: Password with Eye Toggle */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "13px", fontWeight: 500, color: "#64748B" }}>
                  Password
                </label>
                <div style={{ position: "relative", width: "100%" }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••••••"
                    required
                    style={{
                      width: "100%",
                      padding: "8px 32px 8px 0",
                      border: "none",
                      borderBottom: "1.5px solid #E2E8F0",
                      fontSize: "15px",
                      color: "#1E293B",
                      fontWeight: 500,
                      outline: "none",
                      backgroundColor: "transparent",
                      transition: "border-color 0.2s ease",
                    }}
                    onFocus={(e) => (e.target.style.borderBottomColor = "#65A30D")}
                    onBlur={(e) => (e.target.style.borderBottomColor = "#E2E8F0")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: "absolute",
                      right: "0",
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "#94A3B8",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "4px",
                      cursor: "pointer",
                    }}
                    title={showPassword ? "Sembunyikan sandi" : "Tampilkan sandi"}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Field 4 (Signup Mode): Date of birth */}
              {mode === "signup" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 500, color: "#64748B" }}>
                      Date of birth
                    </label>
                    <Info size={14} style={{ color: "#65A30D" }} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: "16px" }}>
                    <div style={{ position: "relative" }}>
                      <select
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "8px 24px 8px 0",
                          border: "none",
                          borderBottom: "1.5px solid #E2E8F0",
                          fontSize: "14px",
                          color: "#1E293B",
                          backgroundColor: "transparent",
                          outline: "none",
                          appearance: "none",
                          cursor: "pointer",
                        }}
                      >
                        {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                      <ChevronDown size={14} style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", color: "#64748B", pointerEvents: "none" }} />
                    </div>
                    <div>
                      <input
                        type="text"
                        value={dobDay}
                        onChange={(e) => setDobDay(e.target.value)}
                        placeholder="Day"
                        style={{
                          width: "100%",
                          padding: "8px 0",
                          border: "none",
                          borderBottom: "1.5px solid #E2E8F0",
                          fontSize: "14px",
                          color: "#1E293B",
                          backgroundColor: "transparent",
                          outline: "none",
                        }}
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        value={dobYear}
                        onChange={(e) => setDobYear(e.target.value)}
                        placeholder="Year"
                        style={{
                          width: "100%",
                          padding: "8px 0",
                          border: "none",
                          borderBottom: "1.5px solid #E2E8F0",
                          fontSize: "14px",
                          color: "#1E293B",
                          backgroundColor: "transparent",
                          outline: "none",
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Field 5: Country / Region (Styled as Unit Kerja / Peran Kedinasan) */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "13px", fontWeight: 500, color: "#64748B" }}>
                  {mode === "signin" ? "Unit Kerja / Peran Kedinasan" : "Country/Region"}
                </label>
                <div style={{ position: "relative" }}>
                  {mode === "signin" ? (
                    <select
                      value={selectedRole}
                      onChange={(e) => handleRoleDropdownChange(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 24px 8px 0",
                        border: "none",
                        borderBottom: "1.5px solid #E2E8F0",
                        fontSize: "14px",
                        color: "#1E293B",
                        fontWeight: 600,
                        backgroundColor: "transparent",
                        outline: "none",
                        appearance: "none",
                        cursor: "pointer",
                      }}
                    >
                      {PRESET_ACCOUNTS.map((acc) => (
                        <option key={acc.role} value={acc.role}>
                          {acc.label} ({acc.fullName})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      value={countryRegion}
                      onChange={(e) => setCountryRegion(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 24px 8px 0",
                        border: "none",
                        borderBottom: "1.5px solid #E2E8F0",
                        fontSize: "14px",
                        color: "#1E293B",
                        fontWeight: 600,
                        backgroundColor: "transparent",
                        outline: "none",
                        appearance: "none",
                        cursor: "pointer",
                      }}
                    >
                      <option value="Indonesia (Kantor Pusat BPJS Kesehatan)">Indonesia (Kantor Pusat BPJS Kesehatan)</option>
                      <option value="Kedeputian Wilayah Jawa Barat">Kedeputian Wilayah Jawa Barat</option>
                      <option value="Kedeputian Wilayah Jawa Tengah & DIY">Kedeputian Wilayah Jawa Tengah & DIY</option>
                      <option value="Kedeputian Wilayah Jawa Timur">Kedeputian Wilayah Jawa Timur</option>
                      <option value="Kedeputian Wilayah Sumatera Utara">Kedeputian Wilayah Sumatera Utara</option>
                    </select>
                  )}
                  <ChevronDown
                    size={15}
                    style={{
                      position: "absolute",
                      right: 0,
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "#64748B",
                      pointerEvents: "none",
                    }}
                  />
                </div>
              </div>

              {/* Quick Preset Selector for Healthkathon Judges */}
              {mode === "signin" && (
                <div style={{ marginTop: "4px" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "8px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        color: "#64748B",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                      }}
                    >
                      <Sparkles size={12} style={{ color: "#65A30D" }} /> Akses Demo Juri (1-Klik):
                    </span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {PRESET_ACCOUNTS.map((acc) => {
                      const isSelected = username === acc.username;
                      return (
                        <button
                          key={acc.role}
                          type="button"
                          onClick={() => handleSelectPreset(acc)}
                          style={{
                            padding: "6px 12px",
                            borderRadius: "9999px",
                            fontSize: "12px",
                            fontWeight: 600,
                            backgroundColor: isSelected ? "#F0FDF4" : "#F8FAFC",
                            color: isSelected ? "#15803D" : "#475569",
                            border: isSelected ? "1.5px solid #84CC16" : "1px solid #E2E8F0",
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            transition: "all 0.15s ease",
                          }}
                        >
                          {isSelected && <Check size={12} />}
                          {acc.label.replace("Petugas ", "")}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Disclaimer / Terms text */}
              <p
                style={{
                  fontSize: "12px",
                  color: "#94A3B8",
                  lineHeight: 1.5,
                  margin: "6px 0 0 0",
                }}
              >
                By clicking {mode === "signin" ? "Sign in" : "Create account"}, I agree that:
                <br />
                I have read and accepted the{" "}
                <span style={{ color: "#0284C7", cursor: "pointer", fontWeight: 500 }}>
                  Terms of Use
                </span>
                . See our{" "}
                <span style={{ color: "#0284C7", cursor: "pointer", fontWeight: 500 }}>
                  Privacy Policy
                </span>{" "}
                for more details or to opt-out at any time (UU PDP No. 27/2022).
              </p>

              {/* Submit Button (Pill Button bottom-right aligned matching design) */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  marginTop: "6px",
                }}
              >
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    backgroundColor: "#65A30D",
                    color: "#FFFFFF",
                    fontSize: "14px",
                    fontWeight: 700,
                    padding: "12px 32px",
                    borderRadius: "9999px",
                    boxShadow: "0 8px 20px -4px rgba(101, 163, 13, 0.4)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    cursor: loading ? "wait" : "pointer",
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#4D7C0F")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#65A30D")}
                >
                  {loading
                    ? "Memverifikasi..."
                    : mode === "signin"
                    ? "Sign in"
                    : "Create account"}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Footer Note */}
        <div
          style={{
            marginTop: "36px",
            paddingTop: "20px",
            borderTop: "1px solid #F1F5F9",
            textAlign: "center",
            fontSize: "12px",
            color: "#94A3B8",
          }}
        >
          Protected by reCAPTCHA & BPJS Kesehatan Identity Security and subject to{" "}
          <span style={{ color: "#0284C7", cursor: "pointer" }}>Privacy Policy</span> and{" "}
          <span style={{ color: "#0284C7", cursor: "pointer" }}>Terms of Service</span>.
        </div>
      </div>

      {/* Responsive Stacking CSS */}
      <style>{`
        @media (max-width: 860px) {
          .login-grid-container {
            grid-template-columns: 1fr !important;
            gap: 32px !important;
          }
        }
      `}</style>
    </div>
  );
};
