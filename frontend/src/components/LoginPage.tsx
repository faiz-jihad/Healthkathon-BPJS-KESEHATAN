import React, { useState } from "react";
import {
  Eye,
  EyeOff,
  ChevronDown,
  Check,
  CheckCircle2,
  ShieldCheck,
  Sparkles,
  AlertCircle,
  ArrowRight,
  Lock,
  User,
  Activity,
  Network,
  Database,
  FileCheck,
  Building2,
  Shield,
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
    color: "#0369a1",
    bg: "#e0f2fe",
    border: "#bae6fd",
  },
  {
    role: "INVESTIGATOR",
    label: "Investigator Anti-Fraud",
    username: "investigator_aura",
    password: "investigator_password_2026",
    fullName: "Budi Santoso, S.H.",
    desc: "Analisis jejaring graf relasi faskes-dokter & sindikat",
    color: "#b45309",
    bg: "#fef3c7",
    border: "#fde68a",
  },
  {
    role: "SUPERVISOR",
    label: "Supervisor Antrean",
    username: "supervisor_aura",
    password: "supervisor_password_2026",
    fullName: "Dra. Siti Rahmawati, M.Kes",
    desc: "Persetujuan eskalasi, pemantauan SLA 24 jam & beban tim",
    color: "#098a58",
    bg: "#e6efe6",
    border: "#cbe3d7",
  },
  {
    role: "DATA_ANALYST",
    label: "Analis Mutu Data",
    username: "analyst_aura",
    password: "analyst_password_2026",
    fullName: "Rendra Kurniawan, M.Kom",
    desc: "Evaluasi model AI Graph RGCN & kalibrasi ambang batas",
    color: "#1e3a5f",
    bg: "#eaf0f6",
    border: "#cbd5e1",
  },
  {
    role: "ADMINISTRATOR",
    label: "Administrator Sistem",
    username: "admin_aura",
    password: "admin_password_2026",
    fullName: "Admin Sistem AURA-JKN",
    desc: "Manajemen akun RBAC, jejak audit & integritas sistem",
    color: "#334155",
    bg: "#f1f5f9",
    border: "#e2e8f0",
  },
];

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess, backendUrl }) => {
  const [username, setUsername] = useState("verifier_aura");
  const [password, setPassword] = useState("verifier_password_2026");
  const [selectedRole, setSelectedRole] = useState("VERIFIKATOR");
  const [rememberMe, setRememberMe] = useState(true);

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [welcomeUser, setWelcomeUser] = useState<{
    fullName: string;
    username: string;
    role: string;
    roleLabel: string;
  } | null>(null);

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

    try {
      const res = await fetch(`${backendUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: finalUser,
          password: finalPass,
        }),
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

      if (res.ok && json?.token && json?.user) {
        sessionStorage.setItem("aura_token", json.token);
        const rLabel = PRESET_ACCOUNTS.find((a) => a.role === json.user.role)?.label || json.user.role;
        setWelcomeUser({
          fullName: json.user.fullName,
          username: json.user.username,
          role: json.user.role,
          roleLabel: rLabel,
        });
        setTimeout(() => {
          onLoginSuccess({
            id: json.user.id,
            username: json.user.username,
            fullName: json.user.fullName,
            role: json.user.role,
            token: json.token,
          });
        }, 1100);
      } else {
        const defaultErr = res.status >= 500
          ? `Layanan backend sedang memproses ulang (HTTP ${res.status}). Silakan coba beberapa detik lagi.`
          : "Gagal masuk: kredensial tidak valid.";
        setErrorMsg(json?.error || defaultErr);
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
    handleSubmit(undefined, acc.username, acc.password);
  };

  const handleRoleDropdownChange = (roleKey: string) => {
    setSelectedRole(roleKey);
    const matched = PRESET_ACCOUNTS.find((a) => a.role === roleKey);
    if (matched) {
      setUsername(matched.username);
      setPassword(matched.password);
    }
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "var(--surface, #f5f6f2)",
        padding: "32px 16px",
        fontFamily: "'Manrope', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {/* Main Elevated Enterprise Card */}
      <div
        className="login-card-animated"
        style={{
          width: "100%",
          maxWidth: "1040px",
          backgroundColor: "#ffffff",
          borderRadius: "24px",
          border: "1px solid #e2e8f0",
          boxShadow: "0 20px 45px -10px rgba(15, 23, 42, 0.08), 0 8px 16px -4px rgba(15, 23, 42, 0.03)",
          overflow: "hidden",
          display: "grid",
          gridTemplateColumns: "minmax(340px, 440px) 1fr",
        }}
      >
        {/* ========================================================= */}
        {/* LEFT COLUMN: Institutional Branding & Architecture        */}
        {/* ========================================================= */}
        <div
          style={{
            background: "linear-gradient(155deg, #076641 0%, #098a58 65%, #054e33 100%)",
            color: "#ffffff",
            padding: "48px 40px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            position: "relative",
          }}
        >
          {/* Subtle Background Pattern */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: "radial-gradient(circle at 80% 20%, rgba(255, 255, 255, 0.1) 0%, transparent 40%), radial-gradient(circle at 20% 80%, rgba(255, 255, 255, 0.06) 0%, transparent 50%)",
              pointerEvents: "none",
            }}
          />

          {/* Top: Brand Identity */}
          <div style={{ position: "relative", zIndex: 2 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "28px" }}>
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "12px",
                  background: "rgba(255, 255, 255, 0.16)",
                  border: "1px solid rgba(255, 255, 255, 0.25)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.12)",
                }}
              >
                <ShieldCheck size={26} strokeWidth={2.4} color="#ffffff" />
              </div>
              <div>
                <div style={{ fontSize: "20px", fontWeight: 800, letterSpacing: "-0.5px", lineHeight: 1.1 }}>
                  AURA<span style={{ color: "#a7f3d0", marginLeft: "2px" }}>JKN</span>
                </div>
                <div style={{ fontSize: "11px", letterSpacing: "1px", textTransform: "uppercase", color: "#d1fae5", fontWeight: 600 }}>
                  BPJS Kesehatan
                </div>
              </div>
            </div>

            <div
              style={{
                display: "inline-block",
                padding: "4px 12px",
                borderRadius: "9999px",
                background: "rgba(255, 255, 255, 0.14)",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                fontSize: "11px",
                fontWeight: 700,
                color: "#d1fae5",
                letterSpacing: "0.5px",
                marginBottom: "16px",
              }}
            >
              INSTRUMEN PENGAWASAN KLAIM JKN
            </div>

            <h1
              style={{
                fontSize: "24px",
                fontWeight: 800,
                lineHeight: 1.3,
                margin: "0 0 12px 0",
                letterSpacing: "-0.4px",
                color: "#ffffff",
              }}
            >
              Sistem Skrining & Integritas Klaim Terpadu
            </h1>

            <p
              style={{
                fontSize: "13px",
                lineHeight: 1.6,
                color: "#d1fae5",
                margin: "0 0 32px 0",
                opacity: 0.92,
              }}
            >
              Platform kecerdasan buatan terpadu untuk menapis anomali, mendeteksi sindikat klaim fiktif, serta melindungi dana jaminan kesehatan nasional secara objektif dan akuntabel.
            </p>

            {/* Feature Cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div
                style={{
                  background: "rgba(255, 255, 255, 0.09)",
                  border: "1px solid rgba(255, 255, 255, 0.16)",
                  borderRadius: "14px",
                  padding: "12px 14px",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "12px",
                  backdropFilter: "blur(6px)",
                }}
              >
                <div style={{ padding: "6px", borderRadius: "8px", background: "rgba(255, 255, 255, 0.16)", color: "#ffffff" }}>
                  <FileCheck size={16} />
                </div>
                <div>
                  <div style={{ fontSize: "12.5px", fontWeight: 700, color: "#ffffff" }}>
                    Pre-Payment Gate Skrining
                  </div>
                  <div style={{ fontSize: "11.5px", color: "#d1fae5", marginTop: "2px", lineHeight: 1.4 }}>
                    Penyaringan otomatis berkas klaim berisiko tinggi sebelum otorisasi pencairan.
                  </div>
                </div>
              </div>

              <div
                style={{
                  background: "rgba(255, 255, 255, 0.09)",
                  border: "1px solid rgba(255, 255, 255, 0.16)",
                  borderRadius: "14px",
                  padding: "12px 14px",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "12px",
                  backdropFilter: "blur(6px)",
                }}
              >
                <div style={{ padding: "6px", borderRadius: "8px", background: "rgba(255, 255, 255, 0.16)", color: "#ffffff" }}>
                  <Network size={16} />
                </div>
                <div>
                  <div style={{ fontSize: "12.5px", fontWeight: 700, color: "#ffffff" }}>
                    Heterogeneous Graph R-GCN
                  </div>
                  <div style={{ fontSize: "11.5px", color: "#d1fae5", marginTop: "2px", lineHeight: 1.4 }}>
                    Analisis jejaring multi-entitas dokter, faskes, dan riwayat pasien berbasis grafik relasi.
                  </div>
                </div>
              </div>

              <div
                style={{
                  background: "rgba(255, 255, 255, 0.09)",
                  border: "1px solid rgba(255, 255, 255, 0.16)",
                  borderRadius: "14px",
                  padding: "12px 14px",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "12px",
                  backdropFilter: "blur(6px)",
                }}
              >
                <div style={{ padding: "6px", borderRadius: "8px", background: "rgba(255, 255, 255, 0.16)", color: "#ffffff" }}>
                  <Database size={16} />
                </div>
                <div>
                  <div style={{ fontSize: "12.5px", fontWeight: 700, color: "#ffffff" }}>
                    Zero Mock Policy
                  </div>
                  <div style={{ fontSize: "11.5px", color: "#d1fae5", marginTop: "2px", lineHeight: 1.4 }}>
                    Seluruh kalkulasi dan inferensi terhubung live ke pangkalan data PostgreSQL operasional.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Security Footer */}
          <div
            style={{
              position: "relative",
              zIndex: 2,
              marginTop: "32px",
              paddingTop: "18px",
              borderTop: "1px solid rgba(255, 255, 255, 0.16)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "11.5px",
              color: "#d1fae5",
            }}
          >
            <Lock size={13} style={{ flexShrink: 0, opacity: 0.8 }} />
            <span>Kepatuhan Keamanan Informasi & UU Perlindungan Data Pribadi (UU PDP No. 27/2022)</span>
          </div>
        </div>

        {/* ========================================================= */}
        {/* RIGHT COLUMN: Executive Authentication Form               */}
        {/* ========================================================= */}
        <div style={{ padding: "48px 44px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          {welcomeUser ? (
            <div
              className="login-welcome-box"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
                padding: "24px 12px",
                gap: "18px",
              }}
            >
              <div
                className="welcome-check-pulse"
                style={{
                  width: "68px",
                  height: "68px",
                  borderRadius: "50%",
                  backgroundColor: "#ecfdf5",
                  border: "2px solid #098a58",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 10px 24px -4px rgba(9, 138, 88, 0.25)",
                  color: "#098a58",
                }}
              >
                <CheckCircle2 size={38} strokeWidth={2.4} />
              </div>

              <div>
                <span
                  style={{
                    display: "inline-block",
                    fontSize: "11px",
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "#076641",
                    backgroundColor: "#e6efe6",
                    padding: "3px 12px",
                    borderRadius: "9999px",
                    marginBottom: "10px",
                  }}
                >
                  Autentikasi Kedinasan Terverifikasi
                </span>
                <h2
                  style={{
                    fontSize: "24px",
                    fontWeight: 800,
                    color: "#0f172a",
                    margin: 0,
                    letterSpacing: "-0.4px",
                  }}
                >
                  Selamat Datang Kembali
                </h2>
                <p
                  style={{
                    fontSize: "16px",
                    fontWeight: 700,
                    color: "#098a58",
                    marginTop: "6px",
                    marginBottom: "2px",
                  }}
                >
                  {welcomeUser.fullName}
                </p>
                <p
                  style={{
                    fontSize: "12.5px",
                    color: "#64748b",
                    margin: 0,
                    fontWeight: 500,
                  }}
                >
                  {welcomeUser.roleLabel} • ID: {welcomeUser.username}
                </p>
              </div>

              <div style={{ width: "100%", maxWidth: "320px", marginTop: "4px" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "11.5px",
                    color: "#64748b",
                    marginBottom: "6px",
                    fontWeight: 600,
                  }}
                >
                  <span>Membuka Ruang Kerja AURA-JKN...</span>
                  <span style={{ color: "#098a58", fontWeight: 700 }}>100%</span>
                </div>
                <div
                  style={{
                    width: "100%",
                    height: "6px",
                    backgroundColor: "#e2e8f0",
                    borderRadius: "9999px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    className="welcome-progress-fill"
                    style={{
                      height: "100%",
                      backgroundColor: "#098a58",
                      borderRadius: "9999px",
                    }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
              {/* Form Title */}
              <div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "#076641",
                    backgroundColor: "#e6efe6",
                    padding: "3px 10px",
                    borderRadius: "6px",
                    letterSpacing: "0.5px",
                    textTransform: "uppercase",
                    marginBottom: "10px",
                  }}
                >
                  <Building2 size={12} />
                  PORTAL KEDINASAN RESMI
                </div>
                <h2
                  style={{
                    fontSize: "26px",
                    fontWeight: 800,
                    color: "#0f172a",
                    letterSpacing: "-0.5px",
                    margin: "0 0 6px 0",
                  }}
                >
                  Masuk ke Ruang Kerja
                </h2>
                <p
                  style={{
                    fontSize: "13px",
                    color: "#64748b",
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  Silakan pilih peran akun uji atau masukkan NIP petugas resmi untuk mengakses instrumen audit.
                </p>
              </div>

              {/* Quick Preset Selector */}
              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "14px",
                  padding: "12px 14px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "#475569",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    marginBottom: "10px",
                  }}
                >
                  <Sparkles size={13} style={{ color: "var(--green, #098a58)" }} />
                  Akses Cepat Pengujian (1-Klik):
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {PRESET_ACCOUNTS.map((acc) => {
                    const isSelected = username === acc.username;
                    return (
                      <button
                        key={acc.role}
                        type="button"
                        onClick={() => handleSelectPreset(acc)}
                        style={{
                          padding: "5px 11px",
                          borderRadius: "8px",
                          fontSize: "12px",
                          fontWeight: 600,
                          backgroundColor: isSelected ? acc.bg : "#ffffff",
                          color: isSelected ? acc.color : "#475569",
                          border: isSelected ? `1.5px solid ${acc.color}` : "1px solid #e2e8f0",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          transition: "all 0.15s ease",
                          boxShadow: isSelected ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                        }}
                      >
                        {isSelected && <Check size={12} strokeWidth={2.5} />}
                        {acc.label.replace("Petugas ", "")}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Error Message */}
              {errorMsg && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "10px 14px",
                    borderRadius: "10px",
                    backgroundColor: "#fef2f2",
                    border: "1px solid #fecaca",
                    color: "#dc2626",
                    fontSize: "12.5px",
                    fontWeight: 500,
                  }}
                >
                  <AlertCircle size={16} style={{ flexShrink: 0 }} />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Login Form */}
              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {/* Field 1: Username / NIP */}
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12.5px", fontWeight: 600, color: "#334155" }}>
                    NIP / Nama Pengguna Kedinasan
                  </label>
                  <div style={{ position: "relative" }}>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Contoh: verifier_aura"
                      required
                      style={{
                        width: "100%",
                        padding: "10px 12px 10px 36px",
                        borderRadius: "10px",
                        border: "1px solid #cbd5e1",
                        fontSize: "13.5px",
                        color: "#0f172a",
                        backgroundColor: "#f8fafc",
                        outline: "none",
                        transition: "all 0.2s ease",
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = "#098a58";
                        e.target.style.boxShadow = "0 0 0 3px rgba(9, 138, 88, 0.12)";
                        e.target.style.backgroundColor = "#ffffff";
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = "#cbd5e1";
                        e.target.style.boxShadow = "none";
                        e.target.style.backgroundColor = "#f8fafc";
                      }}
                    />
                    <User
                      size={15}
                      style={{
                        position: "absolute",
                        left: "12px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "#64748b",
                        pointerEvents: "none",
                      }}
                    />
                  </div>
                </div>

                {/* Field 2: Password */}
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label style={{ fontSize: "12.5px", fontWeight: 600, color: "#334155" }}>
                      Kata Sandi
                    </label>
                    <span
                      style={{
                        fontSize: "11.5px",
                        color: "#098a58",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                      onClick={() => setErrorMsg("Untuk reset kredensial, hubungi Administrator Keamanan TI BPJS Kesehatan.")}
                    >
                      Bantuan Sandi?
                    </span>
                  </div>
                  <div style={{ position: "relative" }}>
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••••••"
                      required
                      style={{
                        width: "100%",
                        padding: "10px 38px 10px 36px",
                        borderRadius: "10px",
                        border: "1px solid #cbd5e1",
                        fontSize: "13.5px",
                        color: "#0f172a",
                        backgroundColor: "#f8fafc",
                        outline: "none",
                        transition: "all 0.2s ease",
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = "#098a58";
                        e.target.style.boxShadow = "0 0 0 3px rgba(9, 138, 88, 0.12)";
                        e.target.style.backgroundColor = "#ffffff";
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = "#cbd5e1";
                        e.target.style.boxShadow = "none";
                        e.target.style.backgroundColor = "#f8fafc";
                      }}
                    />
                    <Lock
                      size={15}
                      style={{
                        position: "absolute",
                        left: "12px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "#64748b",
                        pointerEvents: "none",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: "absolute",
                        right: "10px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "#64748b",
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        padding: "4px",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Field 3: Unit Kerja / Peran Kedinasan */}
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "12.5px", fontWeight: 600, color: "#334155" }}>
                    Peran Operasional
                  </label>
                  <div style={{ position: "relative" }}>
                    <select
                      value={selectedRole}
                      onChange={(e) => handleRoleDropdownChange(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "10px 32px 10px 12px",
                        borderRadius: "10px",
                        border: "1px solid #cbd5e1",
                        fontSize: "13px",
                        color: "#0f172a",
                        fontWeight: 600,
                        backgroundColor: "#f8fafc",
                        outline: "none",
                        appearance: "none",
                        cursor: "pointer",
                      }}
                    >
                      {PRESET_ACCOUNTS.map((acc) => (
                        <option key={acc.role} value={acc.role}>
                          {acc.label} — {acc.fullName}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={15}
                      style={{
                        position: "absolute",
                        right: "12px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "#64748b",
                        pointerEvents: "none",
                      }}
                    />
                  </div>
                </div>

                {/* Remember Me */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "2px" }}>
                  <input
                    type="checkbox"
                    id="rememberMe"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    style={{ accentColor: "#098a58", cursor: "pointer", width: "15px", height: "15px" }}
                  />
                  <label
                    htmlFor="rememberMe"
                    style={{ fontSize: "12px", color: "#64748b", cursor: "pointer", userSelect: "none" }}
                  >
                    Ingat sesi autentikasi pada perangkat ini
                  </label>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    backgroundColor: "#098a58",
                    color: "#ffffff",
                    fontSize: "13.5px",
                    fontWeight: 700,
                    padding: "12px 24px",
                    borderRadius: "12px",
                    border: "none",
                    boxShadow: "0 4px 14px rgba(9, 138, 88, 0.3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    cursor: loading ? "wait" : "pointer",
                    transition: "all 0.2s ease",
                    marginTop: "6px",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#076641")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#098a58")}
                >
                  {loading ? "Memverifikasi Kredensial..." : "Masuk ke Ruang Kerja"}
                  <ArrowRight size={16} />
                </button>
              </form>

              {/* Security Notice Footnote */}
              <div
                style={{
                  fontSize: "11px",
                  color: "#94a3b8",
                  lineHeight: 1.5,
                  textAlign: "center",
                  borderTop: "1px solid #f1f5f9",
                  paddingTop: "14px",
                  margin: 0,
                }}
              >
                Dilindungi otentikasi kriptografis HMAC-SHA256 & TLS 1.3. Setiap aktivitas verifikasi klaim dicatat dalam buku catatan audit digital kedinasan BPJS Kesehatan.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Responsive Stacking CSS */}
      <style>{`
        @media (max-width: 860px) {
          .login-card-animated {
            grid-template-columns: 1fr !important;
            max-width: 520px !important;
          }
        }
      `}</style>
    </div>
  );
};
