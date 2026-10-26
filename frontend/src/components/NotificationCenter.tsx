import React, { useState, useEffect } from "react";
import {
  Bell,
  X,
  CheckCheck,
  AlertTriangle,
  ShieldAlert,
  Info,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Clock,
  Filter,
  Volume2,
  VolumeX,
  Laptop
} from "lucide-react";
import { AppNotificationItem } from "../types/aura";

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: AppNotificationItem[];
  unreadCount: number;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onRefresh: () => void;
  onNavigate: (section: any, subView?: string, targetId?: string) => void;
  activeRole: string;
  roleLabel: string;
  roleBg: string;
  roleColor: string;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  isOpen,
  onClose,
  notifications,
  unreadCount,
  onMarkAsRead,
  onMarkAllAsRead,
  onRefresh,
  onNavigate,
  activeRole,
  roleLabel,
  roleBg,
  roleColor,
}) => {
  const [activeFilter, setActiveFilter] = useState<"all" | "unread" | "critical" | "role">("all");
  const [desktopNotifGranted, setDesktopNotifGranted] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [isClosing, setIsClosing] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setDesktopNotifGranted(Notification.permission === "granted");
    }
  }, []);

  const handleClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 260);
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isClosing]);

  const requestDesktopPermission = async () => {
    if (typeof window !== "undefined" && "Notification" in window) {
      const perm = await Notification.requestPermission();
      setDesktopNotifGranted(perm === "granted");
      if (perm === "granted") {
        new Notification("AURA-JKN: Notifikasi Desktop Aktif", {
          body: "Anda akan menerima pemberitahuan otomatis saat berkas klaim kritis terdeteksi.",
          icon: "/aura-jkn-logo.png",
        });
      }
    }
  };

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await onRefresh();
    setTimeout(() => setRefreshing(false), 500);
  };

  if (!isOpen) return null;

  // Filter notifications
  const filteredList = notifications.filter((item) => {
    if (activeFilter === "unread") return !item.isRead;
    if (activeFilter === "critical") return item.type === "critical" || item.badge === "SLA" || item.badge === "ESKALASI";
    if (activeFilter === "role") return item.targetRoles.includes(activeRole);
    return true;
  });

  const criticalCount = notifications.filter(
    (n) => n.type === "critical" || n.badge === "SLA" || n.badge === "ESKALASI"
  ).length;

  const formatTimeAgo = (isoString: string) => {
    try {
      const diffMs = Date.now() - new Date(isoString).getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return "Baru saja";
      if (diffMins < 60) return `${diffMins} mnt lalu`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours} jam lalu`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays} hari lalu`;
    } catch {
      return "-";
    }
  };

  const getTypeStyle = (type: string) => {
    switch (type) {
      case "critical":
        return {
          icon: <ShieldAlert size={16} className="text-red-500" />,
          border: "#fecaca",
          bg: "#fef2f2",
          badgeBg: "#fee2e2",
          badgeColor: "#dc2626",
        };
      case "warning":
        return {
          icon: <AlertTriangle size={16} className="text-amber-500" />,
          border: "#fde68a",
          bg: "#fffbeb",
          badgeBg: "#fef3c7",
          badgeColor: "#d97706",
        };
      case "success":
        return {
          icon: <CheckCircle2 size={16} className="text-emerald-500" />,
          border: "#a7f3d0",
          bg: "#f0fdf4",
          badgeBg: "#d1fae5",
          badgeColor: "#059669",
        };
      case "info":
      default:
        return {
          icon: <Info size={16} className="text-sky-500" />,
          border: "#bae6fd",
          bg: "#f0f9ff",
          badgeBg: "#e0f2fe",
          badgeColor: "#0284c7",
        };
    }
  };

  return (
    <div
      className={`drawer-backdrop ${isClosing ? "is-closing" : ""}`}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(15, 23, 42, 0.45)",
        backdropFilter: "blur(4px)",
        display: "flex",
        justifyContent: "flex-end",
      }}
      onClick={handleClose}
    >
      <div
        className={isClosing ? "drawer-slide-out" : "drawer-slide-in"}
        style={{
          width: "100%",
          maxWidth: "480px",
          height: "100%",
          background: "#ffffff",
          boxShadow: "-12px 0 36px rgba(0, 0, 0, 0.16)",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Panel */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid #f1f5f9",
            background: "#ffffff",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "10px",
                  background: "#ecfdf5",
                  color: "#076641",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Bell size={20} />
              </div>
              <div>
                <h3
                  style={{
                    margin: 0,
                    fontSize: "16px",
                    fontWeight: 800,
                    color: "#0f172a",
                  }}
                >
                  Pusat Notifikasi
                </h3>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: "12px",
                      background: roleBg,
                      color: roleColor,
                    }}
                  >
                    {roleLabel}
                  </span>
                  <span style={{ fontSize: "11px", color: "#64748b" }}>
                    • {unreadCount} belum dibaca
                  </span>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <button
                className="icon-button"
                onClick={handleManualRefresh}
                title="Segarkan notifikasi"
                style={{ padding: "6px", borderRadius: "8px" }}
              >
                <RefreshCw size={16} className={refreshing ? "animate-spin text-green" : ""} />
              </button>
              <button
                className="icon-button"
                onClick={handleClose}
                title="Tutup"
                style={{ padding: "6px", borderRadius: "8px" }}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Desktop Notification Banner */}
          {"Notification" in window && !desktopNotifGranted && (
            <div
              style={{
                background: "linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)",
                border: "1px solid #a7f3d0",
                borderRadius: "10px",
                padding: "8px 12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px",
                marginBottom: "12px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Laptop size={15} style={{ color: "#098a58" }} />
                <span style={{ fontSize: "12px", color: "#065f46", fontWeight: 600 }}>
                  Aktifkan pop-up Windows Desktop?
                </span>
              </div>
              <button
                onClick={requestDesktopPermission}
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#ffffff",
                  background: "#098a58",
                  padding: "4px 10px",
                  borderRadius: "6px",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Aktifkan
              </button>
            </div>
          )}

          {/* Action Row & Filter Tabs */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "8px",
              marginTop: "4px",
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: "4px",
                background: "#f1f5f9",
                padding: "3px",
                borderRadius: "10px",
                overflowX: "auto",
                maxWidth: "100%",
              }}
            >
              <button
                onClick={() => setActiveFilter("all")}
                style={{
                  padding: "4px 10px",
                  borderRadius: "8px",
                  fontSize: "11px",
                  fontWeight: activeFilter === "all" ? 700 : 500,
                  background: activeFilter === "all" ? "#ffffff" : "transparent",
                  color: activeFilter === "all" ? "#0f172a" : "#64748b",
                  boxShadow: activeFilter === "all" ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                  border: "none",
                }}
              >
                Semua ({notifications.length})
              </button>
              <button
                onClick={() => setActiveFilter("unread")}
                style={{
                  padding: "4px 10px",
                  borderRadius: "8px",
                  fontSize: "11px",
                  fontWeight: activeFilter === "unread" ? 700 : 500,
                  background: activeFilter === "unread" ? "#ffffff" : "transparent",
                  color: activeFilter === "unread" ? "#0f172a" : "#64748b",
                  boxShadow: activeFilter === "unread" ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                  border: "none",
                }}
              >
                Belum Dibaca ({unreadCount})
              </button>
              <button
                onClick={() => setActiveFilter("critical")}
                style={{
                  padding: "4px 10px",
                  borderRadius: "8px",
                  fontSize: "11px",
                  fontWeight: activeFilter === "critical" ? 700 : 500,
                  background: activeFilter === "critical" ? "#ffffff" : "transparent",
                  color: activeFilter === "critical" ? "#dc2626" : "#64748b",
                  boxShadow: activeFilter === "critical" ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                  border: "none",
                }}
              >
                Kritis ({criticalCount})
              </button>
            </div>

            {unreadCount > 0 && (
              <button
                onClick={onMarkAllAsRead}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "#098a58",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: "4px 8px",
                }}
                title="Tandai semua sudah dibaca"
              >
                <CheckCheck size={14} />
                <span>Baca Semua</span>
              </button>
            )}
          </div>
        </div>

        {/* List Notifikasi */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          {filteredList.length === 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "60px 20px",
                textAlign: "center",
                color: "#94a3b8",
              }}
            >
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "50%",
                  background: "#f1f5f9",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "12px",
                  color: "#cbd5e1",
                }}
              >
                <Bell size={28} />
              </div>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "#475569" }}>
                Tidak ada notifikasi saat ini
              </div>
              <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "4px" }}>
                Semua berkas dan sistem operasional dalam kondisi terkendali.
              </div>
            </div>
          ) : (
            filteredList.map((notif) => {
              const typeCfg = getTypeStyle(notif.type);
              const isUnread = !notif.isRead;

              return (
                <div
                  key={notif.id}
                  className="animate-fade-in"
                  style={{
                    padding: "14px 16px",
                    borderRadius: "14px",
                    background: isUnread ? "#ffffff" : "#f8fafc",
                    border: `1px solid ${isUnread ? typeCfg.border : "#e2e8f0"}`,
                    boxShadow: isUnread
                      ? "0 4px 12px rgba(0, 0, 0, 0.04)"
                      : "none",
                    position: "relative",
                    transition: "all 0.2s ease",
                  }}
                >
                  {/* Status dot unread */}
                  {isUnread && (
                    <div
                      style={{
                        position: "absolute",
                        top: "14px",
                        right: "14px",
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: "#098a58",
                      }}
                      title="Belum dibaca"
                    />
                  )}

                  <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                    <div style={{ marginTop: "2px", flexShrink: 0 }}>
                      {typeCfg.icon}
                    </div>
                    <div style={{ flex: 1, paddingRight: isUnread ? "16px" : "0" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          flexWrap: "wrap",
                          marginBottom: "4px",
                        }}
                      >
                        {notif.badge && (
                          <span
                            style={{
                              fontSize: "10px",
                              fontWeight: 800,
                              padding: "1px 6px",
                              borderRadius: "6px",
                              background: typeCfg.badgeBg,
                              color: typeCfg.badgeColor,
                            }}
                          >
                            {notif.badge}
                          </span>
                        )}
                        <span
                          style={{
                            fontSize: "11px",
                            color: "#94a3b8",
                            display: "flex",
                            alignItems: "center",
                            gap: "3px",
                          }}
                        >
                          <Clock size={11} />
                          {formatTimeAgo(notif.timestamp)}
                        </span>
                      </div>

                      <div
                        style={{
                          fontSize: "13px",
                          fontWeight: isUnread ? 700 : 600,
                          color: isUnread ? "#0f172a" : "#475569",
                          lineHeight: 1.4,
                          marginBottom: "4px",
                        }}
                      >
                        {notif.title}
                      </div>

                      <p
                        style={{
                          margin: 0,
                          fontSize: "12px",
                          color: "#64748b",
                          lineHeight: 1.5,
                        }}
                      >
                        {notif.message}
                      </p>

                      {/* Action buttons inside card */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginTop: "10px",
                          paddingTop: "8px",
                          borderTop: "1px dashed #f1f5f9",
                        }}
                      >
                        <button
                          onClick={() => {
                            onMarkAsRead(notif.id);
                            onNavigate(notif.actionSection, notif.actionSubView, notif.targetId);
                            onClose();
                          }}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            fontSize: "11px",
                            fontWeight: 700,
                            color: "#076641",
                            background: "#ecfdf5",
                            padding: "4px 10px",
                            borderRadius: "6px",
                            border: "1px solid #a7f3d0",
                            cursor: "pointer",
                          }}
                        >
                          <ExternalLink size={12} />
                          <span>Buka & Tindak Lanjuti</span>
                        </button>

                        {isUnread && (
                          <button
                            onClick={() => onMarkAsRead(notif.id)}
                            style={{
                              fontSize: "11px",
                              color: "#94a3b8",
                              background: "transparent",
                              border: "none",
                              cursor: "pointer",
                              padding: "4px",
                            }}
                            title="Tandai dibaca"
                          >
                            Tandai dibaca
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Panel */}
        <div
          style={{
            padding: "14px 20px",
            borderTop: "1px solid #f1f5f9",
            background: "#f8fafc",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ fontSize: "11px", color: "#64748b" }}>
            Sinkronisasi Otomatis Setiap 30 Detik
          </div>
          <button
            onClick={onClose}
            style={{
              padding: "6px 14px",
              borderRadius: "8px",
              fontSize: "12px",
              fontWeight: 600,
              color: "#475569",
              background: "#ffffff",
              border: "1px solid #cbd5e1",
              cursor: "pointer",
            }}
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
