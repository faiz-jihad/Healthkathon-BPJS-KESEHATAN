import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/audit-logs - Query audit history (Auditor and Administrator only)
 */
export async function GET(request: Request) {
  const caller = getAuthenticatedUser(request);
  if (!caller) {
    return Response.json(
      {
        status: "UNAUTHENTICATED",
        error: "Akses ditolak. Token otorisasi tidak ditemukan.",
      },
      { status: 401 }
    );
  }

  // Only Administrator and Auditor can view complete operational audit logs
  if (caller.role !== "ADMINISTRATOR" && caller.role !== "AUDITOR") {
    return Response.json(
      {
        status: "UNAUTHORIZED_ROLE",
        error: `Role '${caller.role}' tidak memiliki kewenangan mengakses log audit operasional. Akses terbatas untuk Auditor dan Administrator.`,
      },
      { status: 403 }
    );
  }

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
