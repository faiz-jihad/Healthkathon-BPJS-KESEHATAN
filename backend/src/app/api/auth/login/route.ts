import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword, signAuthToken, VALID_ROLES } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return Response.json(
        {
          status: "VALIDATION_ERROR",
          error: "Payload login harus berupa JSON dengan field 'username' dan 'password'.",
        },
        { status: 400 }
      );
    }

    const { username, password } = body;

    if (!username || typeof username !== "string" || username.trim().length < 3) {
      return Response.json(
        {
          status: "VALIDATION_ERROR",
          error: "Field 'username' wajib diisi minimal 3 karakter.",
        },
        { status: 400 }
      );
    }

    if (!password || typeof password !== "string" || password.length < 6) {
      return Response.json(
        {
          status: "VALIDATION_ERROR",
          error: "Field 'password' wajib diisi minimal 6 karakter.",
        },
        { status: 400 }
      );
    }

    const cleanUsername = username.trim().toLowerCase();

    // Query user from PostgreSQL
    let user = null;
    try {
      user = await prisma.user.findUnique({
        where: { username: cleanUsername },
      });
    } catch (dbErr: any) {
      return Response.json(
        {
          status: "DATA_SOURCE_UNAVAILABLE",
          error: `Layanan database PostgreSQL tidak dapat dihubungi: ${dbErr?.message || "Koneksi gagal"}. Tidak dapat memverifikasi kredensial.`,
        },
        { status: 503 }
      );
    }

    if (!user) {
      return Response.json(
        {
          status: "INVALID_CREDENTIALS",
          error: "Kombinasi username atau password salah.",
        },
        { status: 401 }
      );
    }

    if (!user.isActive) {
      return Response.json(
        {
          status: "ACCOUNT_DISABLED",
          error: "Akun ini telah dinonaktifkan oleh Administrator. Hubungi administrator sistem.",
        },
        { status: 403 }
      );
    }

    const isValid = verifyPassword(password, user.passwordHash, user.salt);
    if (!isValid) {
      return Response.json(
        {
          status: "INVALID_CREDENTIALS",
          error: "Kombinasi username atau password salah.",
        },
        { status: 401 }
      );
    }

    const principal = {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role as any,
    };

    const token = signAuthToken(principal);

    // Record audit log for successful login
    try {
      await prisma.auditLog.create({
        data: {
          actorName: user.fullName,
          actorRole: user.role,
          action: "USER_LOGIN_SUCCESS",
          targetId: user.id,
          metadata: { username: user.username, timestamp: new Date().toISOString() },
        },
      });
    } catch {
      // Non-blocking for audit log on login
    }

    return Response.json({
      status: "LOGIN_SUCCESS",
      token,
      user: principal,
      token_type: "Bearer",
      expires_in: 86400,
    });
  } catch (err: any) {
    return Response.json(
      {
        status: "INTERNAL_ERROR",
        error: `Terjadi kesalahan saat memproses login: ${err?.message || "Internal server error"}`,
      },
      { status: 500 }
    );
  }
}
