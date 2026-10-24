import { prisma } from "@/lib/prisma";
import {
  getAuthenticatedUser,
  requirePermission,
  PERMISSIONS,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/audit-logs - Query & Export audit history (Administrator, Supervisor, Data Analyst)
 * Supports ?action=..., ?target_id=..., ?search=..., and ?format=csv|json
 */
export async function GET(request: Request) {
  const caller = getAuthenticatedUser(request);
  const authError = requirePermission(caller, PERMISSIONS.VIEW_AUDIT_LOGS);
  if (authError) return authError;

  try {
    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));
    const actionFilter = url.searchParams.get("action");
    const targetFilter = url.searchParams.get("target_id");
    const search = (url.searchParams.get("search") || "").trim();
    const format = (url.searchParams.get("format") || "json").toLowerCase();

    const andConditions: any[] = [];
    if (actionFilter && actionFilter !== "ALL") {
      andConditions.push({ action: actionFilter });
    }
    if (targetFilter) {
      andConditions.push({ targetId: { contains: targetFilter, mode: "insensitive" } });
    }
    if (search) {
      andConditions.push({
        OR: [
          { actorName: { contains: search, mode: "insensitive" } },
          { action: { contains: search, mode: "insensitive" } },
          { targetId: { contains: search, mode: "insensitive" } },
        ],
      });
    }

    const where: any = andConditions.length > 0 ? { AND: andConditions } : {};

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { recordedAt: "desc" },
        skip: format === "csv" ? 0 : (page - 1) * limit,
        take: format === "csv" ? 500 : limit,
      }),
    ]);

    if (format === "csv") {
      const headers = [
        "id",
        "recorded_at",
        "actor_name",
        "actor_role",
        "action",
        "target_id",
        "metadata",
      ];
      const escapeCsv = (val: any) => {
        if (val === null || val === undefined) return "";
        const str =
          typeof val === "object"
            ? JSON.stringify(val).replace(/"/g, '""')
            : String(val).replace(/"/g, '""');
        return /[,"\n]/.test(str) ? `"${str}"` : str;
      };
      const rows = logs.map((l) =>
        [
          l.id,
          l.recordedAt.toISOString(),
          l.actorName,
          l.actorRole,
          l.action,
          l.targetId,
          l.metadata || {},
        ]
          .map(escapeCsv)
          .join(",")
      );
      const csvContent = [headers.join(","), ...rows].join("\n");
      return new Response(csvContent, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="aura_jkn_audit_trail_report.csv"',
        },
      });
    }

    return Response.json({
      status: "SUCCESS",
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      logs,
    });
  } catch (dbErr: any) {
    return Response.json(
      {
        status: "DATA_SOURCE_UNAVAILABLE",
        error: `Layanan database PostgreSQL tidak dapat dihubungi: ${dbErr?.message || "Koneksi gagal"}. Log audit tidak dapat dimuat.`,
      },
      { status: 503 }
    );
  }
}
