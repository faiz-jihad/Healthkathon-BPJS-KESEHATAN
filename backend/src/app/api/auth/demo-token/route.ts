import { signAuthToken, VALID_ROLES, UserRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const requestedRole = (body.role || "").toUpperCase() as UserRole;

    if (!VALID_ROLES.includes(requestedRole)) {
      return Response.json(
        {
          status: "VALIDATION_ERROR",
          error: `Role '${requestedRole}' tidak valid. Pilihan role yang sah: ${VALID_ROLES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const demoProfiles: Record<UserRole, { id: string; username: string; fullName: string }> = {
      ADMINISTRATOR: {
        id: "usr_admin_001",
        username: "admin_aura",
        fullName: "Administrator Keamanan Sistem BPJS",
      },
      FRAUD_ANALYST: {
        id: "usr_analyst_001",
        username: "analyst_aura",
        fullName: "Analis Investigasi Fraud BPJS",
      },
      CLAIM_VERIFIER: {
        id: "usr_verifier_001",
        username: "verifier_aura",
        fullName: "Verifikator Pra-Pembayaran Klaim BPJS",
      },
      AUDITOR: {
        id: "usr_auditor_001",
        username: "auditor_aura",
        fullName: "Auditor Kepatuhan & Tata Kelola BPJS",
      },
    };

    const profile = demoProfiles[requestedRole];
    const principal = {
      ...profile,
      role: requestedRole,
    };

    const token = signAuthToken(principal);

    return Response.json({
      status: "TOKEN_ISSUED",
      token,
      user: principal,
      token_type: "Bearer",
      expires_in: 86400,
    });
  } catch (err: any) {
    return Response.json(
      {
        status: "INTERNAL_ERROR",
        error: `Gagal menerbitkan demo token: ${err?.message || "Internal error"}`,
      },
      { status: 500 }
    );
  }
}
