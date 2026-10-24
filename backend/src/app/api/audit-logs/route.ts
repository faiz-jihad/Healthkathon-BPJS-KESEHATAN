import { prisma } from "@/lib/prisma";
import {
  getAuthenticatedUser,
  requirePermission,
  PERMISSIONS,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/audit-logs - Query audit history (Administrator, Supervisor, Data Analyst)
 */
export async function GET(request: Request) {
  const caller = getAuthenticatedUser(request);
  const authError = requirePermission(caller, PERMISSIONS.VIEW_AUDIT_LOGS);
  if (authError) return authError;

  try {
    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));
    const actionFilter = url.searchParams.get("action");
    const targetFilter = url.searchParams.get("target_id");

    const where: any = {};
    if (actionFilter) {
      where.action = actionFilter;
    }
    if (targetFilter) {
      where.targetId = targetFilter;
    }

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { recordedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

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
