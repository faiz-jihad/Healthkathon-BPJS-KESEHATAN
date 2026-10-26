import React, { useState } from "react";
import {
  Monitor,
  Download,
  CheckCircle2,
  X,
  Sparkles,
  ExternalLink,
  Laptop,
  Layers,
  ShieldCheck,
  ChevronRight,
  Terminal,
  Cpu,
  Zap
} from "lucide-react";

interface DesktopInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  deferredPrompt: any | null;
  isStandalone: boolean;
  onTriggerInstall: () => Promise<void>;
}

export const DesktopInstallModal: React.FC<DesktopInstallModalProps> = ({
  isOpen,
  onClose,
  deferredPrompt,
  isStandalone,
  onTriggerInstall,
}) => {
  const [activeTab, setActiveTab] = useState<"pwa" | "tauri">("pwa");
  const [installedSuccess, setInstalledSuccess] = useState(false);

  if (!isOpen) return null;

  const handlePwaInstall = async () => {
    if (deferredPrompt) {
      await onTriggerInstall();
    } else {
      setInstalledSuccess(true);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(10, 25, 18, 0.65)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={onClose}
    >
      <div
        className="card animate-scale-in"
        style={{
          background: "#ffffff",
          borderRadius: "20px",
          width: "100%",
          maxWidth: "680px",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 25px 50px -12px rgba(6, 78, 59, 0.25)",
          border: "1px solid #d1fae5",
          padding: "24px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Modal */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "16px",
            borderBottom: "1px solid #f1f5f9",
            paddingBottom: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "14px",
                background: "linear-gradient(135deg, #098a58 0%, #076641 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ffffff",
                boxShadow: "0 8px 16px rgba(9, 138, 88, 0.25)",
              }}
            >
              <Monitor size={26} strokeWidth={2.2} />
            </div>
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  flexWrap: "wrap",
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: "18px",
                    fontWeight: 800,
                    color: "#0f172a",
                  }}
                >
                  Pasang Aplikasi Desktop AURA-JKN
                </h3>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: "12px",
                    background: "#ecfdf5",
                    color: "#065f46",
                    border: "1px solid #a7f3d0",
                  }}
                >
                  Windows Edition
                </span>
              </div>
              <p
                style={{
                  margin: "4px 0 0 0",
                  fontSize: "13px",
                  color: "#64748b",
                }}
              >
                Jalankan sistem audit pra-pembayaran BPJS di jendela mandiri tanpa gangguan tab browser.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="icon-button"
            style={{
              padding: "6px",
              borderRadius: "10px",
              background: "#f1f5f9",
              color: "#475569",
            }}
            title="Tutup"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Selection */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "10px",
            margin: "20px 0 16px 0",
            background: "#f8fafc",
            padding: "5px",
            borderRadius: "14px",
            border: "1px solid #e2e8f0",
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab("pwa")}
            style={{
              padding: "10px 14px",
              borderRadius: "10px",
              fontSize: "13px",
              fontWeight: activeTab === "pwa" ? 700 : 500,
              background: activeTab === "pwa" ? "#ffffff" : "transparent",
              color: activeTab === "pwa" ? "#076641" : "#64748b",
              boxShadow: activeTab === "pwa" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
              border: activeTab === "pwa" ? "1px solid #d1fae5" : "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              transition: "all 0.2s ease",
            }}
          >
            <Zap size={16} />
            <span>PWA Desktop (Instan Browser)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("tauri")}
            style={{
              padding: "10px 14px",
              borderRadius: "10px",
              fontSize: "13px",
              fontWeight: activeTab === "tauri" ? 700 : 500,
              background: activeTab === "tauri" ? "#ffffff" : "transparent",
              color: activeTab === "tauri" ? "#076641" : "#64748b",
              boxShadow: activeTab === "tauri" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
              border: activeTab === "tauri" ? "1px solid #d1fae5" : "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              transition: "all 0.2s ease",
            }}
          >
            <Cpu size={16} />
            <span>Tauri 2.0 (.exe Windows)</span>
          </button>
        </div>

        {/* Tab Content: PWA */}
        {activeTab === "pwa" && (
          <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {isStandalone ? (
              <div
                style={{
                  background: "#f0fdf4",
                  border: "1px solid #86efac",
                  padding: "16px",
                  borderRadius: "14px",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                }}
              >
                <CheckCircle2 size={24} style={{ color: "#16a34a", flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "#15803d" }}>
                    Aplikasi Sedang Berjalan dalam Mode Desktop Mandiri!
                  </div>
                  <div style={{ fontSize: "12px", color: "#166534" }}>
                    AURA-JKN sudah terpasang dan berjalan secara independen di Windows Anda.
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div
                  style={{
                    background: "linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)",
                    border: "1px solid #a7f3d0",
                    borderRadius: "14px",
                    padding: "16px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <Sparkles size={20} style={{ color: "#098a58" }} />
                      <span style={{ fontSize: "14px", fontWeight: 700, color: "#065f46" }}>
                        Pemasangan 1-Klik Tanpa Perlu Download Installer
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: "8px",
                        background: "#098a58",
                        color: "#ffffff",
                      }}
                    >
                      Paling Praktis
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: "13px", color: "#064e3b", lineHeight: 1.5 }}>
                    Mendukung Google Chrome, Microsoft Edge, Brave, dan Opera di Windows 10 & 11. 
                    Aplikasi akan terdaftar di Menu Start, Taskbar, dan memiliki jendela tersendiri tanpa URL bar.
                  </p>

                  <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
                    {deferredPrompt ? (
                      <button
                        onClick={handlePwaInstall}
                        className="button button-primary"
                        style={{
                          flex: 1,
                          padding: "12px 18px",
                          borderRadius: "12px",
                          fontSize: "14px",
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "8px",
                          background: "#098a58",
                          color: "#ffffff",
                          boxShadow: "0 6px 14px rgba(9, 138, 88, 0.28)",
                        }}
                      >
                        <Download size={18} />
                        <span>Pasang Sekarang ke Windows (1-Klik)</span>
                      </button>
                    ) : (
                      <div
                        style={{
                          background: "#ffffff",
                          border: "1px dashed #098a58",
                          borderRadius: "10px",
                          padding: "10px 14px",
                          fontSize: "12px",
                          color: "#065f46",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          width: "100%",
                        }}
                      >
                        <Monitor size={16} />
                        <span>
                          <strong>Petunjuk:</strong> Klik ikon install <strong>(tanda layar/komputer dengan panah bawah)</strong> di sebelah kanan bilah URL browser Anda untuk memasang langsung ke desktop.
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Langkah-langkah detail */}
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                    Cara Memasang Melalui Browser:
                  </div>

                  <div
                    className="grid-responsive-2"
                    style={{
                      gap: "12px",
                    }}
                  >
                    <div
                      style={{
                        padding: "12px",
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: "12px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                        <span
                          style={{
                            width: "20px",
                            height: "20px",
                            borderRadius: "50%",
                            background: "#0284c7",
                            color: "#ffffff",
                            fontSize: "11px",
                            fontWeight: 700,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          1
                        </span>
                        <span style={{ fontSize: "13px", fontWeight: 700, color: "#1e293b" }}>
                          Di Microsoft Edge
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: "12px", color: "#64748b" }}>
                        Klik ikon <strong>"Aplikasi Tersedia"</strong> di bilah alamat atas, lalu pilih <strong>"Instal AURA-JKN"</strong>.
                      </p>
                    </div>

                    <div
                      style={{
                        padding: "12px",
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: "12px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                        <span
                          style={{
                            width: "20px",
                            height: "20px",
                            borderRadius: "50%",
                            background: "#16a34a",
                            color: "#ffffff",
                            fontSize: "11px",
                            fontWeight: 700,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          2
                        </span>
                        <span style={{ fontSize: "13px", fontWeight: 700, color: "#1e293b" }}>
                          Di Google Chrome / Brave
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: "12px", color: "#64748b" }}>
                        Klik ikon <strong>"Install AURA-JKN"</strong> di bilah URL atau Menu Tiga Titik &gt; <em>Simpan dan Bagikan</em> &gt; <em>Instal AURA-JKN</em>.
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Keuntungan PWA Desktop */}
            <div
              className="grid-responsive-3"
              style={{
                gap: "10px",
                borderTop: "1px solid #f1f5f9",
                paddingTop: "14px",
              }}
            >
              <div style={{ textAlign: "center", padding: "8px" }}>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>0 MB Download</div>
                <div style={{ fontSize: "11px", color: "#64748b" }}>Instalasi instan tanpa berkas installer berat</div>
              </div>
              <div style={{ textAlign: "center", padding: "8px" }}>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>Auto-Update</div>
                <div style={{ fontSize: "11px", color: "#64748b" }}>Selalu mendapatkan versi terbaru tanpa patch manual</div>
              </div>
              <div style={{ textAlign: "center", padding: "8px" }}>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>Start Menu & Icon</div>
                <div style={{ fontSize: "11px", color: "#64748b" }}>Terintegrasi penuh dengan Taskbar Windows</div>
              </div>
            </div>
          </div>
        )}

        {/* Tab Content: Tauri 2.0 */}
        {activeTab === "tauri" && (
          <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div
              style={{
                background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
                border: "1px solid #cbd5e1",
                borderRadius: "14px",
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <Laptop size={20} style={{ color: "#0f172a" }} />
                  <span style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>
                    Tauri 2.0 Native Windows Installer (.exe & .msi)
                  </span>
                </div>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: "8px",
                    background: "#334155",
                    color: "#ffffff",
                  }}
                >
                  Binary Native
                </span>
              </div>
              <p style={{ margin: 0, fontSize: "13px", color: "#475569", lineHeight: 1.5 }}>
                Tauri 2.0 mengompilasi kode frontend AURA-JKN ke dalam binary Rust mandiri yang menggunakan <strong>Microsoft Edge WebView2</strong>. 
                Ukuran installer hanya ~10 MB dan konsumsi RAM hingga 80% lebih hemat dibanding Electron.
              </p>
            </div>

            {/* Dua Cara Mendapatkan Installer .EXE */}
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                Pilihan Pengadaan Installer .EXE:
              </div>

              {/* Opsi 1: GitHub Releases CI/CD (Rekomendasi) */}
              <div
                style={{
                  padding: "14px",
                  background: "#ffffff",
                  border: "1px solid #bbf7d0",
                  borderRadius: "12px",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <ShieldCheck size={18} style={{ color: "#098a58" }} />
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "#065f46" }}>
                      Opsi 1: Unduh dari GitHub Actions Release (Cloud Build)
                    </span>
                  </div>
                  <span style={{ fontSize: "10px", fontWeight: 700, color: "#098a58", background: "#ecfdf5", padding: "2px 6px", borderRadius: "6px" }}>
                    Siap Pakai
                  </span>
                </div>
                <p style={{ margin: "0 0 10px 0", fontSize: "12px", color: "#64748b", lineHeight: 1.5 }}>
                  Workflow CI/CD <code>.github/workflows/desktop-release.yml</code> secara otomatis mengompilasi installer <code>.exe</code> di runner Windows Server GitHub setiap rilis dibuat.
                </p>
                <a
                  href="https://github.com/akbrrhm/Healthkathon-BPJS-KESEHATAN/releases"
                  target="_blank"
                  rel="noreferrer"
                  className="button button-secondary"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 14px",
                    borderRadius: "8px",
                    fontSize: "12px",
                    fontWeight: 600,
                    textDecoration: "none",
                    color: "#076641",
                    border: "1px solid #a7f3d0",
                    background: "#f0fdf4",
                  }}
                >
                  <ExternalLink size={14} />
                  <span>Buka Halaman Rilis GitHub (.exe)</span>
                </a>
              </div>

              {/* Opsi 2: Compile Lokal dengan Rust */}
              <div
                style={{
                  padding: "14px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "12px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                  <Terminal size={16} style={{ color: "#475569" }} />
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#1e293b" }}>
                    Opsi 2: Kompilasi Mandiri di Komputer Lokal
                  </span>
                </div>
                <p style={{ margin: "0 0 8px 0", fontSize: "12px", color: "#64748b" }}>
                  Jika Anda memiliki Rust dan Visual Studio C++ Build Tools di Windows:
                </p>
                <pre
                  style={{
                    margin: 0,
                    padding: "8px 12px",
                    background: "#0f172a",
                    color: "#38bdf8",
                    borderRadius: "8px",
                    fontSize: "11px",
                    fontFamily: "monospace",
                    overflowX: "auto",
                  }}
                >
                  cd frontend
                  npm run tauri:build
                </pre>
                <div style={{ fontSize: "11px", color: "#64748b", marginTop: "6px" }}>
                  Hasil binary installer <code>.exe</code> akan otomatis berada di folder <code>src-tauri/target/release/bundle/nsis/</code>.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer Modal */}
        <div
          style={{
            marginTop: "20px",
            paddingTop: "16px",
            borderTop: "1px solid #f1f5f9",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "#64748b" }}>
            <ShieldCheck size={16} style={{ color: "#098a58" }} />
            <span>Terverifikasi BPJS Zero Mock Engine & PostgreSQL Live</span>
          </div>
          <button
            onClick={onClose}
            className="button button-secondary"
            style={{
              padding: "8px 18px",
              borderRadius: "10px",
              fontSize: "13px",
              fontWeight: 600,
            }}
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
