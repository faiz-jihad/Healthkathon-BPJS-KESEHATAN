import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, VALID_ROLES, UserRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: { userId: string } }
) {
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

  if (caller.role !== "ADMINISTRATOR") {
    return Response.json(
      {
        status: "UNAUTHORIZED_ROLE",
        error: `Role '${caller.role}' tidak memiliki kewenangan mengubah data pengguna. Akses khusus Administrator.`,
      },
      { status: 403 }
    );
  }

  const { userId } = params;
  if (!userId) {
    return Response.json(
      { status: "VALIDATION_ERROR", error: "Parameter userId wajib disertakan." },
      { status: 400 }
    );
  }

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return Response.json(
        { status: "VALIDATION_ERROR", error: "Payload harus berupa JSON." },
        { status: 400 }
      );
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser) {
      return Response.json(
        { status: "NOT_FOUND", error: `Pengguna dengan ID '${userId}' tidak ditemukan.` },
        { status: 404 }
      );
    }

    const updateData: any = {};

    if (typeof body.isActive === "boolean") {
      updateData.isActive = body.isActive;
    }

    if (body.role) {
      const upperRole = (body.role as string).toUpperCase() as UserRole;
      if (!VALID_ROLES.includes(upperRole)) {
        return Response.json(
          {
            status: "VALIDATION_ERROR",
            error: `Role '${body.role}' tidak valid. Pilihan: ${VALID_ROLES.join(", ")}`,
          },
          { status: 400 }
        );
      }
      updateData.role = upperRole;
    }

    if (Object.keys(updateData).length === 0) {
      return Response.json(
        {
          status: "VALIDATION_ERROR",
          error: "Sertakan field 'isActive' atau 'role' yang ingin diubah.",
        },
        { status: 400 }
      );
    }

    // Atomic transaction: Update user + Audit log
    const [updatedUser] = await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: updateData,
        select: {
          id: true,
          username: true,
          fullName: true,
          role: true,
          isActive: true,
          updatedAt: true,
        },
      }),
      prisma.auditLog.create({
        data: {
          actorName: caller.fullName,
          actorRole: caller.role,
          action: "ADMIN_USER_UPDATED",
          targetId: targetUser.username,
          metadata: {
            previousState: { isActive: targetUser.isActive, role: targetUser.role },
            newState: updateData,
            timestamp: new Date().toISOString(),
          },
        },
      }),
    ]);

    return Response.json({
      status: "USER_UPDATED",
      user: updatedUser,
    });
  } catch (dbErr: any) {
    return Response.json(
      {
        status: "DATA_SOURCE_UNAVAILABLE",
        error: `Layanan database PostgreSQL tidak dapat dihubungi: ${dbErr?.message || "Koneksi gagal"}.`,
      },
      { status: 503 }
    );
  }
}
