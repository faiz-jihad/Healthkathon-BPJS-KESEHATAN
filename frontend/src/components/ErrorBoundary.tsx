import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, ShieldAlert } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[AURA-JKN Production Error]:", error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100dvh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#f8fafc",
            padding: "24px",
            fontFamily: "'Manrope', sans-serif",
          }}
        >
          <div
            style={{
              maxWidth: "520px",
              width: "100%",
              background: "#ffffff",
              borderRadius: "20px",
              padding: "32px",
              boxShadow: "0 20px 40px rgba(0,0,0,0.08)",
              border: "1px solid #fee2e2",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                background: "#fef2f2",
                color: "#dc2626",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px auto",
              }}
            >
              <ShieldAlert size={28} />
            </div>

            <h2 style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a", margin: "0 0 8px 0" }}>
              Terjadi Kendala Sistem Operasional
            </h2>
            <p style={{ fontSize: "13px", color: "#64748b", margin: "0 0 20px 0", lineHeight: 1.6 }}>
              Aplikasi mendeteksi anomali pada antarmuka. Integritas data di pangkalan data PostgreSQL BPJS tetap aman dan terlindungi.
            </p>

            {this.state.error && (
              <div
                style={{
                  background: "#f1f5f9",
                  padding: "10px 14px",
                  borderRadius: "10px",
                  fontSize: "11px",
                  fontFamily: "monospace",
                  color: "#475569",
                  textAlign: "left",
                  marginBottom: "20px",
                  maxHeight: "100px",
                  overflowY: "auto",
                }}
              >
                {this.state.error.message}
              </div>
            )}

            <button
              onClick={this.handleReload}
              style={{
                padding: "12px 24px",
                borderRadius: "12px",
                background: "#098a58",
                color: "#ffffff",
                fontSize: "13px",
                fontWeight: 700,
                border: "none",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                boxShadow: "0 4px 12px rgba(9, 138, 88, 0.25)",
              }}
            >
              <RefreshCw size={15} />
              <span>Muat Ulang Halaman</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
