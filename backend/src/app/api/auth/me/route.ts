import { getAuthenticatedUser, ROLE_PERMISSIONS } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = getAuthenticatedUser(request);

  if (!user) {
    return Response.json(
      {
        status: "UNAUTHENTICATED",
        error: "Sesi tidak valid atau token otorisasi tidak disertakan. Sertakan header 'Authorization: Bearer <token>'.",
      },
      { status: 401 }
    );
  }

  return Response.json({
    status: "AUTHENTICATED",
    user,
    permissions: ROLE_PERMISSIONS[user.role] || [],
  });
}
