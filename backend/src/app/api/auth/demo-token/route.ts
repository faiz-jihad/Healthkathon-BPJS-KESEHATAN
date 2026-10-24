import { signAuthToken, VALID_ROLES, UserRole, normalizeRole, DEMO_USERS } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/demo-token
 * Issues a demo Bearer token for a given role.
 * Supports both new 5-role system and legacy role aliases.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawRole = (body.role || "").toUpperCase();

    // Normalize legacy roles (FRAUD_ANALYST → INVESTIGATOR, etc.)
    const requestedRole = normalizeRole(rawRole) as UserRole;

    if (!VALID_ROLES.includes(requestedRole)) {
      return Response.json(
        {
          status: "VALIDATION_ERROR",
          error: `Role '${rawRole}' tidak valid. Pilihan role yang sah: ${VALID_ROLES.join(", ")}`,
          valid_roles: VALID_ROLES,
          role_descriptions: {
            ADMINISTRATOR: "Mengelola akun, permission, dan konfigurasi sistem",
            VERIFIKATOR: "Meninjau klaim dan memberikan catatan pemeriksaan",
            INVESTIGATOR: "Menelusuri kasus, graph, dan mendokumentasikan temuan",
            SUPERVISOR: "Memantau antrean, mengelola eskalasi, dan evaluasi tim",
            DATA_ANALYST: "Memantau kualitas data dan evaluasi model AI",
          },
        },
        { status: 400 }
      );
    }

    const profile = DEMO_USERS[requestedRole];

    const token = signAuthToken(profile);

    return Response.json({
      status: "TOKEN_ISSUED",
      token,
      user: profile,
      token_type: "Bearer",
      expires_in: 86400,
      role_permissions_summary: {
        role: requestedRole,
        can_view_cases: ["ADMINISTRATOR", "VERIFIKATOR", "INVESTIGATOR", "SUPERVISOR", "DATA_ANALYST"].includes(requestedRole),
        can_investigate: ["INVESTIGATOR", "VERIFIKATOR"].includes(requestedRole),
        can_escalate: ["INVESTIGATOR", "VERIFIKATOR", "SUPERVISOR"].includes(requestedRole),
        can_resolve: ["INVESTIGATOR", "SUPERVISOR"].includes(requestedRole),
        can_manage_users: requestedRole === "ADMINISTRATOR",
        can_view_performance: ["ADMINISTRATOR", "SUPERVISOR", "DATA_ANALYST"].includes(requestedRole),
        can_view_model_metrics: ["DATA_ANALYST", "ADMINISTRATOR"].includes(requestedRole),
      },
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
