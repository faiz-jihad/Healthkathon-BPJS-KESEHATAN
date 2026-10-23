import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, hashPassword, VALID_ROLES, UserRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/users - List users (Administrator role only)
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

  if (caller.role !== "ADMINISTRATOR") {
    return Response.json(
      {
        status: "UNAUTHORIZED_ROLE",
        error: `Role '${caller.role}' tidak memiliki kewenangan administrasi akun pengguna. Akses khusus Administrator.`,
      },
      { status: 403 }
    );
  }

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return Response.json({
      status: "SUCCESS",
      count: users.length,
      users,
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

/**
 * POST /api/admin/users - Create new user account (Administrator role only)
 */
export async function POST(request: Request) {
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
        error: `Role '${caller.role}' tidak memiliki kewenangan membuat akun baru. Akses khusus Administrator.`,
      },
      { status: 403 }
    );
  }

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return Response.json(
        {
          status: "VALIDATION_ERROR",
          error: "Payload harus berupa JSON dengan data pengguna lengkap.",
        },
        { status: 400 }
      );
    }

    const { username, password, fullName, role } = body;

    if (!username || typeof username !== "string" || username.trim().length < 3) {
      return Response.json(
        {
          status: "VALIDATION_ERROR",
          error: "Username wajib diisi minimal 3 karakter alfanumerik.",
        },
        { status: 400 }
      );
    }

    if (!password || typeof password !== "string" || password.length < 8) {
      return Response.json(
        {
          status: "VALIDATION_ERROR",
          error: "Password wajib diisi minimal 8 karakter demi keamanan audit BPJS.",
        },
        { status: 400 }
      );
    }

    if (!fullName || typeof fullName !== "string" || fullName.trim().length < 3) {
      return Response.json(
        {
          status: "VALIDATION_ERROR",
          error: "Nama lengkap pengguna wajib diisi minimal 3 karakter.",
        },
        { status: 400 }
      );
    }

    const upperRole = (role || "").toUpperCase() as UserRole;
    if (!VALID_ROLES.includes(upperRole)) {
      return Response.json(
        {
          status: "VALIDATION_ERROR",
          error: `Role '${role}' tidak valid. Pilihan role yang sah: ${VALID_ROLES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const cleanUsername = username.trim().toLowerCase();

    // Check username uniqueness
    const existing = await prisma.user.findUnique({
      where: { username: cleanUsername },
    });

    if (existing) {
      return Response.json(
        {
          status: "CONFLICT",
          error: `Username '${cleanUsername}' sudah terdaftar dalam sistem. Gunakan username lain.`,
        },
        { status: 409 }
      );
    }

    const { hash, salt } = hashPassword(password);

    // Atomic transaction: Create user + record AuditLog
    const [createdUser] = await prisma.$transaction([
      prisma.user.create({
        data: {
          username: cleanUsername,
          passwordHash: hash,
          salt,
          fullName: fullName.trim(),
          role: upperRole,
          isActive: true,
        },
        select: {
          id: true,
          username: true,
          fullName: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
      }),
      prisma.auditLog.create({
        data: {
          actorName: caller.fullName,
          actorRole: caller.role,
          action: "ADMIN_USER_CREATED",
          targetId: cleanUsername,
          metadata: {
            createdUserRole: upperRole,
            createdUserName: fullName.trim(),
            timestamp: new Date().toISOString(),
          },
        },
      }),
    ]);

    return Response.json(
      {
        status: "USER_CREATED",
        user: createdUser,
      },
      { status: 201 }
    );
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
