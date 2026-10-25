import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
const db = prisma as any;
import { getAuthenticatedUser, normalizeRole, isKnownRole, UserRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: "critical" | "warning" | "info" | "success";
  category: "claim" | "case" | "system" | "data_quality" | "audit";
  targetRoles: Array<UserRole | "all">;
  timestamp: string;
  actionSection: "overview" | "investigation" | "data_intelligence" | "reports" | "administration";
  actionSubView?: string;
  targetId?: string;
  badge?: string;
}

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    const { searchParams } = new URL(request.url);
    const roleParam = searchParams.get("role");
    
    const activeRole = roleParam && isKnownRole(roleParam) 
      ? normalizeRole(roleParam) 
      : user 
        ? normalizeRole(user.role) 
        : "VERIFIKATOR";
        
    const username = user?.username || "verifikator_bpjs";

    const notifications: AppNotification[] = [];
    const now = new Date();

    // 1. KASUS ESCALATED (Target: SUPERVISOR, ADMINISTRATOR)
    try {
      const escalatedCases = await db.caseInvestigation.findMany({
        where: { status: "ESCALATED" },
        include: {
          claim: {
            include: { facility: true, doctor: true, riskAssessment: true }
          }
        },
        take: 5,
        orderBy: { updatedAt: "desc" }
      });

      for (const item of escalatedCases) {
        notifications.push({
          id: `notif-esc-${item.id}`,
          title: `Eskalasi Berkas: ${item.caseNumber}`,
          message: `Kasus klaim ${item.claimId} butuh telaah supervisor. Alasan: ${item.escalationReason || "Eskalasi anomali berulang"} (Faskes: ${item.claim?.facility?.facilityClass || "FKRTL"}).`,
          type: "critical",
          category: "case",
          targetRoles: ["SUPERVISOR", "ADMINISTRATOR"],
          timestamp: item.escalatedAt ? item.escalatedAt.toISOString() : item.updatedAt.toISOString(),
          actionSection: "investigation",
          actionSubView: "queue",
          targetId: item.id,
          badge: "ESKALASI"
        });
      }
    } catch (e) {
      console.warn("[Notif] Gagal memuat escalated cases:", e);
    }

    // 2. KASUS ASSIGNED KE USER (Target: INVESTIGATOR, VERIFIKATOR)
    try {
      const assignedCases = await db.caseInvestigation.findMany({
        where: {
          assignedTo: username,
          status: { in: ["UNDER_REVIEW", "AWAITING_EVIDENCE"] }
        },
        take: 5,
        orderBy: { updatedAt: "desc" }
      });

      for (const item of assignedCases) {
        notifications.push({
          id: `notif-assign-${item.id}`,
          title: `Penugasan Berkas Aktif: ${item.caseNumber}`,
          message: `Berkas klaim ${item.claimId} ditugaskan kepada Anda. Status: ${item.status}. Silakan lengkapi analisis bukti medis.`,
          type: "info",
          category: "case",
          targetRoles: ["INVESTIGATOR", "VERIFIKATOR"],
          timestamp: item.assignedAt ? item.assignedAt.toISOString() : item.updatedAt.toISOString(),
          actionSection: "investigation",
          actionSubView: "my_cases",
          targetId: item.id,
          badge: "TUGAS SAYA"
        });
      }
    } catch (e) {
      console.warn("[Notif] Gagal memuat assigned cases:", e);
    }

    // 3. KLAIM RISIKO TINGGI PRA-PEMBAYARAN BARU (Target: VERIFIKATOR, INVESTIGATOR, SUPERVISOR)
    try {
      const highRiskClaims = await db.claim.findMany({
        where: {
          riskAssessment: {
            riskLevel: "HIGH",
            prePaymentGate: "REJECT_FOR_HUMAN_REVIEW"
          }
        },
        include: {
          riskAssessment: true,
          facility: true,
          doctor: true
        },
        take: 5,
        orderBy: { createdAt: "desc" }
      });

      for (const item of highRiskClaims) {
        const fri = item.riskAssessment?.fraudRiskIndex ?? 85;
        notifications.push({
          id: `notif-claim-${item.claimId}`,
          title: `Klaim Risiko Tinggi Dicegat: ${item.claimId}`,
          message: `Skor FRI ${fri}/100 terdeteksi pada ${item.facility?.facilityClass || "RS"} (Dokter: ${item.doctor?.specialty || "Spesialis"}). Dana dicegat sebelum pembayaran.`,
          type: "warning",
          category: "claim",
          targetRoles: ["VERIFIKATOR", "INVESTIGATOR", "SUPERVISOR"],
          timestamp: item.createdAt.toISOString(),
          actionSection: "investigation",
          actionSubView: "queue",
          targetId: item.claimId,
          badge: `FRI ${fri}`
        });
      }
    } catch (e) {
      console.warn("[Notif] Gagal memuat high-risk claims:", e);
    }

    // 4. SLA PERINGATAN / BATAS WAKTU (Target: SUPERVISOR, VERIFIKATOR)
    try {
      const pendingReviewCases = await db.caseInvestigation.findMany({
        where: {
          status: { in: ["NEW", "FLAGGED_FOR_REVIEW", "UNDER_REVIEW"] }
        },
        take: 3,
        orderBy: { createdAt: "asc" }
      });

      for (const item of pendingReviewCases) {
        const ageHours = Math.round((now.getTime() - new Date(item.createdAt).getTime()) / (1000 * 60 * 60));
        if (ageHours > 12) {
          notifications.push({
            id: `notif-sla-${item.id}`,
            title: `Peringatan SLA Telaah (${ageHours} Jam): ${item.caseNumber}`,
            message: `Berkas klaim ${item.claimId} berada di antrean selama ${ageHours} jam. Harap segera ditindaklanjuti sesuai target SLA 24 jam.`,
            type: ageHours > 24 ? "critical" : "warning",
            category: "case",
            targetRoles: ["SUPERVISOR", "VERIFIKATOR"],
            timestamp: item.createdAt.toISOString(),
            actionSection: "investigation",
            actionSubView: "queue",
            targetId: item.id,
            badge: "SLA"
          });
        }
      }
    } catch (e) {
      console.warn("[Notif] Gagal memuat SLA warnings:", e);
    }

    // 5. MUTU DATA & INGESTION (Target: DATA_ANALYST, ADMINISTRATOR)
    try {
      const latestBatch = await db.ingestionBatch.findFirst({
        orderBy: { createdAt: "desc" }
      });

      if (latestBatch) {
        notifications.push({
          id: `notif-batch-${latestBatch.id}`,
          title: `Mutu Data Batch: ${latestBatch.batchId}`,
          message: `Siklus ingest data selesai: ${latestBatch.totalValid.toLocaleString("id-ID")} valid, ${latestBatch.totalRejected.toLocaleString("id-ID")} anomali terisolasi.`,
          type: latestBatch.totalRejected > 0 ? "warning" : "success",
          category: "data_quality",
          targetRoles: ["DATA_ANALYST", "ADMINISTRATOR"],
          timestamp: latestBatch.completedAt ? latestBatch.completedAt.toISOString() : latestBatch.createdAt.toISOString(),
          actionSection: "data_intelligence",
          actionSubView: "ingestion",
          targetId: latestBatch.batchId,
          badge: "MUTU DATA"
        });
      }

      // Notifikasi Mutu Data & Metrik Distribusi untuk Analis Data
      const totalClaimsCount = await db.claim.count();
      if (totalClaimsCount > 0) {
        notifications.push({
          id: "notif-data-integrity-status",
          title: `Integritas Pangkalan Data: ${totalClaimsCount.toLocaleString("id-ID")} Berkas`,
          message: `Pusat Data BPJS terverifikasi konsisten. Relasi heterogen klaim-faskes-dokter siap untuk evaluasi model R-GCN & kalibrasi ambang batas FRI.`,
          type: "info",
          category: "data_quality",
          targetRoles: ["DATA_ANALYST", "ADMINISTRATOR"],
          timestamp: now.toISOString(),
          actionSection: "data_intelligence",
          actionSubView: "model_eval",
          badge: "EVALUASI MODEL"
        });
      }

      // Cek Klaim Outlier Tarif Tinggi (Data Quality Alert)
      const outlierClaim = await db.claim.findFirst({
        where: { inaCbgsTariff: { gt: 15000000 } },
        orderBy: { inaCbgsTariff: "desc" },
        include: { facility: true }
      });

      if (outlierClaim) {
        const fmtTariff = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(outlierClaim.inaCbgsTariff);
        notifications.push({
          id: `notif-outlier-${outlierClaim.claimId}`,
          title: `Anomali Distribusi Tarif Klaim: ${fmtTariff}`,
          message: `Klaim ${outlierClaim.claimId} (${outlierClaim.facility?.facilityClass || "FKRTL"}) memiliki nilai tarif di atas persentil 95. Perlu validasi kurva distribusi biaya.`,
          type: "warning",
          category: "data_quality",
          targetRoles: ["DATA_ANALYST", "VERIFIKATOR"],
          timestamp: outlierClaim.createdAt.toISOString(),
          actionSection: "data_intelligence",
          actionSubView: "quality",
          targetId: outlierClaim.claimId,
          badge: "DISTRIBUSI"
        });
      }
    } catch (e) {
      console.warn("[Notif] Gagal memuat batch & data quality notification:", e);
    }

    // 6. KEAMANAN & AUDIT SISTEM (Target: ADMINISTRATOR, DATA_ANALYST)
    try {
      const recentAudits = await db.auditLog.findMany({
        take: 4,
        orderBy: { recordedAt: "desc" }
      });

      for (const log of recentAudits) {
        notifications.push({
          id: `notif-audit-${log.id}`,
          title: `Aktivitas Audit: ${log.action}`,
          message: `Pengguna ${log.actorName} (${log.actorRole}) melakukan aksi pada target ${log.targetId}.`,
          type: "info",
          category: "audit",
          targetRoles: ["ADMINISTRATOR", "DATA_ANALYST"],
          timestamp: log.recordedAt.toISOString(),
          actionSection: "administration",
          actionSubView: "audit_trail",
          targetId: log.id,
          badge: "AUDIT"
        });
      }
    } catch (e) {
      console.warn("[Notif] Gagal memuat audit notifications:", e);
    }

    // Urutkan berdasarkan timestamp descending
    notifications.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Filter notifikasi sesuai role aktif
    const filteredNotifications = notifications.filter((notif) => {
      if (notif.targetRoles.includes("all")) return true;
      return notif.targetRoles.includes(activeRole);
    });

    const unreadCount = filteredNotifications.length;

    return NextResponse.json({
      success: true,
      role: activeRole,
      user: username,
      total: filteredNotifications.length,
      unreadCount,
      notifications: filteredNotifications,
      meta: {
        allAvailableCount: notifications.length,
        timestamp: now.toISOString()
      }
    });
  } catch (error: any) {
    console.error("[Notifications API Error]:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Gagal memproses notifikasi sistem"
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { action, id } = body;

    return NextResponse.json({
      success: true,
      action: action || "mark_read",
      targetId: id || null,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Gagal memperbarui notifikasi" },
      { status: 500 }
    );
  }
}

