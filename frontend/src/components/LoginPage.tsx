import React, { useState } from "react";
import {
  ShieldCheck,
  Lock,
  User,
  Key,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  Sparkles,
  Database,
  CheckCircle2,
  Shield,
  Activity,
  ChevronRight
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
    color: "#0284c7",
    bg: "#e0f2fe",
    desc: "Verifikasi berkas, telaah pra-pembayaran klaim & INA-CBG",
  },
  {
    role: "INVESTIGATOR",
    label: "Investigator Anti-Fraud",
    username: "investigator_aura",
    password: "investigator_password_2026",
    color: "#d97706",
    bg: "#fef3c7",
    desc: "Analisis graf relasi faskes-dokter & investigasi sindikat",
  },
  {
    role: "SUPERVISOR",
    label: "Supervisor Antrean",
    username: "supervisor_aura",
    password: "supervisor_password_2026",
    color: "#059669",
    bg: "#d1fae5",
    desc: "Persetujuan eskalasi, pemantauan SLA 24 jam & beban tim",
  },
  {
    role: "DATA_ANALYST",
    label: "Analis Mutu Data",
    username: "analyst_aura",
    password: "analyst_password_2026",
    color: "#4f46e5",
    bg: "#e0e7ff",
    desc: "Evaluasi model AI Graph RGCN & kalibrasi ambang batas FRI",
  },
  {
    role: "ADMINISTRATOR",
    label: "Administrator Keamanan",
    username: "admin_aura",
    password: "admin_password_2026",
    color: "#334155",
    bg: "#f1f5f9",
    desc: "Manajemen akun RBAC, jejak audit & integritas sistem",
  },
];

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess, backendUrl }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e?: React.FormEvent, customUser?: string, customPass?: string) => {
    if (e) e.preventDefault();
    const finalUser = (customUser || username).trim();
    const finalPass = customPass || password;

    if (!finalUser || !finalPass) {
      setErrorMsg("Mohon masukkan nama pengguna dan kata sandi.");
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
    handleSubmit(undefined, acc.username, acc.password);
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "radial-gradient(ellipse at top, #0d281e 0%, #06140e 60%, #030805 100%)",
        color: "#ffffff",
        padding: "24px 16px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Dynamic Background Glow Elements */}
      <div
        style={{
          position: "absolute",
          top: "-150px",
          right: "-100px",
          width: "450px",
          height: "450px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(9, 138, 88, 0.25) 0%, transparent 70%)",
          filter: "blur(50px)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "-150px",
          left: "-100px",
          width: "500px",
          height: "500px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(3, 105, 161, 0.18) 0%, transparent 70%)",
          filter: "blur(60px)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          width: "100%",
          maxWidth: "1020px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          gap: "32px",
          alignItems: "center",
          position: "relative",
          zIndex: 10,
        }}
      >
        {/* Kolom Kiri: Branding & Kredibilitas Sistem */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "46px",
                height: "46px",
                borderRadius: "14px",
                background: "linear-gradient(135deg, #098a58 0%, #076641 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 8px 24px rgba(9, 138, 88, 0.4)",
              }}
            >
              <ShieldCheck size={26} strokeWidth={2.4} style={{ color: "#ffffff" }} />
            </div>
            <div>
              <div
                style={{
                  fontSize: "22px",
                  fontWeight: 900,
                  letterSpacing: "-0.5px",
                  lineHeight: 1.1,
                }}
              >
                AURA<span style={{ color: "#34d399" }}>JKN</span>
              </div>
              <div style={{ fontSize: "11px", color: "#a7f3d0", fontWeight: 600, letterSpacing: "0.5px" }}>
                BPJS KESEHATAN • SISTEM SKRINING PRA-PEMBAYARAN
              </div>
            </div>
          </div>

          <div>
            <h1
              style={{
                fontSize: "28px",
                fontWeight: 800,
                color: "#f8fafc",
                lineHeight: 1.3,
                margin: "0 0 10px 0",
              }}
            >
              Autonomous Relational Anti-Fraud & Graph Intelligence
            </h1>
            <p
              style={{
                fontSize: "14px",
                color: "#94a3b8",
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              Gerbang verifikasi berkas klaim digital terintegrasi model Graph RGCN dan pangkalan data PostgreSQL. Menjamin keabsahan klaim, pencegahan kecurangan, dan akurasi pra-pembayaran sebelum dana dicairkan.
            </p>
          </div>

          {/* Keunggulan Produksi BPJS */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "10px 14px",
                borderRadius: "12px",
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
              }}
            >
              <CheckCircle2 size={18} style={{ color: "#34d399", flexShrink: 0 }} />
              <div style={{ fontSize: "12px", color: "#cbd5e1" }}>
                <strong>Zero Mock Architecture:</strong> Data live bersumber dari pangkalan data resmi PostgreSQL.
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "10px 14px",
                borderRadius: "12px",
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
              }}
            >
              <Lock size={18} style={{ color: "#38bdf8", flexShrink: 0 }} />
              <div style={{ fontSize: "12px", color: "#cbd5e1" }}>
                <strong>Keamanan Berstandar PBKDF2:</strong> Token kriptografis HMAC SHA-256 berkepatuhan UU PDP No. 27/2022.
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "10px 14px",
                borderRadius: "12px",
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
              }}
            >
              <Activity size={18} style={{ color: "#fbbf24", flexShrink: 0 }} />
              <div style={{ fontSize: "12px", color: "#cbd5e1" }}>
                <strong>5 Peran Terisolasi (RBAC):</strong> Hak akses ketat sesuai tupoksi operasional verifikasi & investigasi.
              </div>
            </div>
          </div>
        </div>

        {/* Kolom Kanan: Card Login Form */}
        <div
          style={{
            background: "rgba(15, 23, 42, 0.85)",
            backdropFilter: "blur(16px)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            borderRadius: "24px",
            padding: "32px 28px",
            boxShadow: "0 25px 60px -15px rgba(0, 0, 0, 0.6)",
          }}
        >
          <div style={{ marginBottom: "20px" }}>
            <h2
              style={{
                fontSize: "20px",
                fontWeight: 800,
                color: "#ffffff",
                margin: "0 0 6px 0",
              }}
            >
              Masuk ke Dashboard
            </h2>
            <p style={{ fontSize: "13px", color: "#94a3b8", margin: 0 }}>
              Gunakan akun resmi operasional BPJS Kesehatan Anda.
            </p>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div
              style={{
                background: "rgba(239, 68, 68, 0.15)",
                border: "1px solid rgba(239, 68, 68, 0.4)",
                borderRadius: "12px",
                padding: "10px 14px",
                marginBottom: "16px",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                color: "#fca5a5",
                fontSize: "12px",
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Form Login */}
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#cbd5e1",
                  marginBottom: "6px",
                }}
              >
                Nama Pengguna (Username)
              </label>
              <div style={{ position: "relative" }}>
                <User
                  size={16}
                  style={{
                    position: "absolute",
                    left: "14px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#64748b",
                  }}
                />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. verifier_aura"
                  disabled={loading}
                  style={{
                    width: "100%",
                    padding: "12px 14px 12px 40px",
                    borderRadius: "12px",
                    background: "rgba(2, 6, 23, 0.7)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    color: "#ffffff",
                    fontSize: "14px",
                    outline: "none",
                  }}
                />
              </div>
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#cbd5e1",
                  marginBottom: "6px",
                }}
              >
                Kata Sandi (Password)
              </label>
              <div style={{ position: "relative" }}>
                <Key
                  size={16}
                  style={{
                    position: "absolute",
                    left: "14px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#64748b",
                  }}
                />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  disabled={loading}
                  style={{
                    width: "100%",
                    padding: "12px 40px 12px 40px",
                    borderRadius: "12px",
                    background: "rgba(2, 6, 23, 0.7)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    color: "#ffffff",
                    fontSize: "14px",
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  style={{
                    position: "absolute",
                    right: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    color: "#64748b",
                    cursor: "pointer",
                    padding: "4px",
                  }}
                  title={showPassword ? "Sembunyikan" : "Tampilkan"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: "8px",
                padding: "14px",
                borderRadius: "12px",
                background: "linear-gradient(135deg, #098a58 0%, #076641 100%)",
                color: "#ffffff",
                fontSize: "14px",
                fontWeight: 700,
                border: "none",
                cursor: loading ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                boxShadow: "0 6px 18px rgba(9, 138, 88, 0.35)",
                transition: "all 0.2s ease",
              }}
            >
              {loading ? (
                <span>Memverifikasi kredensial...</span>
              ) : (
                <>
                  <span>Masuk ke Sistem AURA-JKN</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Access Bar */}
          <div style={{ marginTop: "24px", paddingTop: "18px", borderTop: "1px solid rgba(255, 255, 255, 0.1)" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "11px",
                fontWeight: 700,
                color: "#34d399",
                marginBottom: "10px",
                textTransform: "uppercase",
              }}
            >
              <Sparkles size={13} />
              <span>Akses Cepat Pengujian Peran (1-Klik):</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              {PRESET_ACCOUNTS.map((acc) => (
                <button
                  key={acc.role}
                  type="button"
                  onClick={() => handleSelectPreset(acc)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: "10px",
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    textAlign: "left",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                  title={acc.desc}
                >
                  <div>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#ffffff" }}>
                      {acc.label}
                    </div>
                    <div style={{ fontSize: "9px", color: "#94a3b8" }}>
                      @{acc.username}
                    </div>
                  </div>
                  <ChevronRight size={13} style={{ color: "#64748b" }} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div
        style={{
          position: "absolute",
          bottom: "12px",
          left: 0,
          right: 0,
          textAlign: "center",
          fontSize: "11px",
          color: "rgba(255, 255, 255, 0.4)",
          padding: "0 16px",
        }}
      >
        © 2026 BPJS Kesehatan — Healthkathon Team FANTASTIC • Hak Cipta Dilindungi Undang-Undang
      </div>
    </div>
  );
};
