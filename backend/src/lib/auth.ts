import crypto from "node:crypto";

// ============================================================
// AURA-JKN Role & Permission System
// 5 Roles aligned with PRD Section C
// ============================================================

export type UserRole =
  | "ADMINISTRATOR"
  | "VERIFIKATOR"
  | "INVESTIGATOR"
  | "SUPERVISOR"
  | "DATA_ANALYST";

// Legacy role aliases kept for backward compatibility with existing tokens
export type LegacyRole = "FRAUD_ANALYST" | "CLAIM_VERIFIER" | "AUDITOR";
export type AnyRole = UserRole | LegacyRole;

export const VALID_ROLES: UserRole[] = [
  "ADMINISTRATOR",
  "VERIFIKATOR",
  "INVESTIGATOR",
  "SUPERVISOR",
  "DATA_ANALYST",
];

// Normalize legacy roles from old tokens to new roles
export function normalizeRole(role: string): UserRole {
  const map: Record<string, UserRole> = {
    FRAUD_ANALYST: "INVESTIGATOR",
    CLAIM_VERIFIER: "VERIFIKATOR",
    AUDITOR: "DATA_ANALYST",
  };
  const normalized = map[role] || role;
  return VALID_ROLES.includes(normalized as UserRole)
    ? (normalized as UserRole)
    : "VERIFIKATOR";
}

export interface AuthUserPrincipal {
  id: string;
  username: string;
  fullName: string;
  role: AnyRole;
}

export interface TokenPayload extends AuthUserPrincipal {
  iat: number;
  exp: number;
}

// Server Secret for signing tokens. In production, load from AUTH_SECRET env var.
const AUTH_SECRET =
  process.env.AUTH_SECRET ||
  "aura-jkn-secure-hmac-secret-healthkathon-2026-bpjs";

/**
 * Hash password using PBKDF2 with SHA-512 and random salt
 */
export function hashPassword(
  password: string,
  salt?: string
): { hash: string; salt: string } {
  const generatedSalt = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, generatedSalt, 10000, 64, "sha512")
    .toString("hex");
  return { hash, salt: generatedSalt };
}

/**
 * Verify password in timing-safe manner
 */
export function verifyPassword(
  password: string,
  hash: string,
  salt: string
): boolean {
  try {
    const calculatedHash = crypto
      .pbkdf2Sync(password, salt, 10000, 64, "sha512")
      .toString("hex");
    return crypto.timingSafeEqual(
      Buffer.from(hash, "hex"),
      Buffer.from(calculatedHash, "hex")
    );
  } catch {
    return false;
  }
}

/**
 * Sign payload into a standard HMAC-SHA256 Token (Header.Payload.Signature)
 */
export function signAuthToken(
  user: AuthUserPrincipal,
  expiresInSeconds = 86400
): string {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = {
    ...user,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString(
    "base64url"
  );
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url"
  );
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const hmac = crypto.createHmac("sha256", AUTH_SECRET);
  hmac.update(signatureInput);
  const signature = hmac.digest("base64url");

  return `${signatureInput}.${signature}`;
}

/**
 * Verify and decode HMAC-SHA256 Token
 */
export function verifyAuthToken(token: string): TokenPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, signature] = parts;
    const signatureInput = `${encodedHeader}.${encodedPayload}`;

    const hmac = crypto.createHmac("sha256", AUTH_SECRET);
    hmac.update(signatureInput);
    const expectedSignature = hmac.digest("base64url");

    if (
      !crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      )
    ) {
      return null;
    }

    const payloadText = Buffer.from(encodedPayload, "base64url").toString(
      "utf8"
    );
    const rawPayload: any = JSON.parse(payloadText);

    // Normalize legacy roles transparently
    rawPayload.role = normalizeRole(rawPayload.role);

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (rawPayload.exp && rawPayload.exp < now) {
      return null;
    }

    if (!VALID_ROLES.includes(rawPayload.role)) {
      return null;
    }

    return rawPayload as TokenPayload;
  } catch {
    return null;
  }
}

/**
 * Extract authenticated user principal from Request Authorization header
 * Supports Bearer token as primary, with x-reviewer-role / x-demo-role fallback for seamless client transitions
 */
export function getAuthenticatedUser(
  request: Request
): AuthUserPrincipal | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7).trim();
    const payload = verifyAuthToken(token);
    if (payload) {
      return {
        id: payload.id,
        username: payload.username,
        fullName: payload.fullName,
        role: payload.role,
      };
    }
  }

  // Graceful fallback to client session headers (for initial client hydration and demo mode)
  const headerRole = request.headers.get("x-reviewer-role") || request.headers.get("x-demo-role");
  if (headerRole) {
    const normalized = normalizeRole(headerRole);
    const headerName = request.headers.get("x-reviewer-name") || "Petugas BPJS Kesehatan";
    return {
      id: "usr_session_" + normalized.toLowerCase(),
      username: normalized.toLowerCase() + "_aura",
      fullName: headerName,
      role: normalized,
    };
  }

  return null;
}

// ============================================================
// RBAC PERMISSION MATRIX
// PRD Section C — Role & Responsibility Mapping
// ============================================================

export const PERMISSIONS = {
  // Viewing
  VIEW_CLAIMS: "VIEW_CLAIMS",
  VIEW_CLAIMS_READONLY: "VIEW_CLAIMS_READONLY",
  VIEW_EVIDENCE: "VIEW_EVIDENCE",
  VIEW_GRAPH: "VIEW_GRAPH",
  VIEW_AUDIT_LOGS: "VIEW_AUDIT_LOGS",
  VIEW_CASE_QUEUE: "VIEW_CASE_QUEUE",
  VIEW_REVIEW_HISTORY: "VIEW_REVIEW_HISTORY",
  VIEW_INGESTION_HISTORY: "VIEW_INGESTION_HISTORY",
  VIEW_MODEL_METRICS: "VIEW_MODEL_METRICS",
  VIEW_DATA_QUALITY: "VIEW_DATA_QUALITY",
  VIEW_PERFORMANCE_DASHBOARD: "VIEW_PERFORMANCE_DASHBOARD",
  VIEW_HEALTH: "VIEW_HEALTH",

  // Investigation actions
  START_REVIEW: "START_REVIEW",
  RECORD_FINDING: "RECORD_FINDING",
  REQUEST_EVIDENCE: "REQUEST_EVIDENCE",
  ESCALATE_CASE: "ESCALATE_CASE",
  RESOLVE_CASE: "RESOLVE_CASE",
  CLOSE_CASE: "CLOSE_CASE",
  ASSIGN_CASE: "ASSIGN_CASE",
  INVESTIGATE_CLAIMS: "INVESTIGATE_CLAIMS",

  // Verifikator actions
  RECORD_REVIEW_DECISION: "RECORD_REVIEW_DECISION",
  SUBMIT_FOR_REVIEW: "SUBMIT_FOR_REVIEW",

  // Supervisor actions
  APPROVE_ESCALATION: "APPROVE_ESCALATION",
  MONITOR_TEAM: "MONITOR_TEAM",
  VIEW_ALL_CASES: "VIEW_ALL_CASES",

  // Data Analyst actions
  VIEW_MODEL_EVALUATION: "VIEW_MODEL_EVALUATION",
  EXPORT_REPORTS: "EXPORT_REPORTS",
  VIEW_DATA_PIPELINE: "VIEW_DATA_PIPELINE",

  // Admin actions
  MANAGE_USERS: "MANAGE_USERS",
  MANAGE_PERMISSIONS: "MANAGE_PERMISSIONS",
  VIEW_SYSTEM_HEALTH: "VIEW_SYSTEM_HEALTH",
  CONFIGURE_SYSTEM: "CONFIGURE_SYSTEM",

  // Ingestion
  TRIGGER_INGESTION: "TRIGGER_INGESTION",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  ADMINISTRATOR: [
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.MANAGE_PERMISSIONS,
    PERMISSIONS.VIEW_HEALTH,
    PERMISSIONS.VIEW_SYSTEM_HEALTH,
    PERMISSIONS.VIEW_AUDIT_LOGS,
    PERMISSIONS.VIEW_CLAIMS,
    PERMISSIONS.VIEW_CASE_QUEUE,
    PERMISSIONS.VIEW_REVIEW_HISTORY,
    PERMISSIONS.VIEW_INGESTION_HISTORY,
    PERMISSIONS.VIEW_PERFORMANCE_DASHBOARD,
    PERMISSIONS.VIEW_DATA_QUALITY,
    PERMISSIONS.VIEW_MODEL_METRICS,
    PERMISSIONS.VIEW_MODEL_EVALUATION,
    PERMISSIONS.EXPORT_REPORTS,
    PERMISSIONS.CONFIGURE_SYSTEM,
    PERMISSIONS.TRIGGER_INGESTION,
  ],

  VERIFIKATOR: [
    PERMISSIONS.VIEW_CLAIMS,
    PERMISSIONS.VIEW_EVIDENCE,
    PERMISSIONS.VIEW_GRAPH,
    PERMISSIONS.VIEW_CASE_QUEUE,
    PERMISSIONS.VIEW_REVIEW_HISTORY,
    PERMISSIONS.VIEW_PERFORMANCE_DASHBOARD,
    PERMISSIONS.VIEW_DATA_QUALITY,
    PERMISSIONS.VIEW_INGESTION_HISTORY,
    PERMISSIONS.START_REVIEW,
    PERMISSIONS.RECORD_REVIEW_DECISION,
    PERMISSIONS.REQUEST_EVIDENCE,
    PERMISSIONS.SUBMIT_FOR_REVIEW,
    PERMISSIONS.ESCALATE_CASE,
  ],

  INVESTIGATOR: [
    PERMISSIONS.VIEW_CLAIMS,
    PERMISSIONS.VIEW_EVIDENCE,
    PERMISSIONS.VIEW_GRAPH,
    PERMISSIONS.VIEW_CASE_QUEUE,
    PERMISSIONS.VIEW_REVIEW_HISTORY,
    PERMISSIONS.VIEW_PERFORMANCE_DASHBOARD,
    PERMISSIONS.VIEW_DATA_QUALITY,
    PERMISSIONS.VIEW_INGESTION_HISTORY,
    PERMISSIONS.INVESTIGATE_CLAIMS,
    PERMISSIONS.START_REVIEW,
    PERMISSIONS.RECORD_FINDING,
    PERMISSIONS.REQUEST_EVIDENCE,
    PERMISSIONS.ESCALATE_CASE,
    PERMISSIONS.RESOLVE_CASE,
    PERMISSIONS.EXPORT_REPORTS,
  ],

  SUPERVISOR: [
    PERMISSIONS.VIEW_CLAIMS,
    PERMISSIONS.VIEW_EVIDENCE,
    PERMISSIONS.VIEW_GRAPH,
    PERMISSIONS.VIEW_CASE_QUEUE,
    PERMISSIONS.VIEW_ALL_CASES,
    PERMISSIONS.VIEW_REVIEW_HISTORY,
    PERMISSIONS.VIEW_AUDIT_LOGS,
    PERMISSIONS.VIEW_PERFORMANCE_DASHBOARD,
    PERMISSIONS.VIEW_DATA_QUALITY,
    PERMISSIONS.VIEW_INGESTION_HISTORY,
    PERMISSIONS.APPROVE_ESCALATION,
    PERMISSIONS.ASSIGN_CASE,
    PERMISSIONS.MONITOR_TEAM,
    PERMISSIONS.CLOSE_CASE,
    PERMISSIONS.EXPORT_REPORTS,
  ],

  DATA_ANALYST: [
    PERMISSIONS.VIEW_CLAIMS_READONLY,
    PERMISSIONS.VIEW_DATA_QUALITY,
    PERMISSIONS.VIEW_MODEL_METRICS,
    PERMISSIONS.VIEW_MODEL_EVALUATION,
    PERMISSIONS.VIEW_INGESTION_HISTORY,
    PERMISSIONS.VIEW_DATA_PIPELINE,
    PERMISSIONS.VIEW_PERFORMANCE_DASHBOARD,
    PERMISSIONS.VIEW_AUDIT_LOGS,
    PERMISSIONS.EXPORT_REPORTS,
  ],
};

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/**
 * Assert permission — returns 403 Response if not allowed
 */
export function requirePermission(
  user: AuthUserPrincipal | null,
  permission: Permission
): Response | null {
  if (!user) {
    return Response.json(
      {
        status: "UNAUTHENTICATED",
        error: "Akses ditolak. Token otorisasi tidak ditemukan atau tidak valid.",
      },
      { status: 401 }
    );
  }
  if (!hasPermission(user.role, permission)) {
    return Response.json(
      {
        status: "UNAUTHORIZED_ROLE",
        error: `Role '${user.role}' tidak memiliki kewenangan untuk operasi '${permission}'.`,
        required_permission: permission,
        your_role: user.role,
      },
      { status: 403 }
    );
  }
  return null; // authorized
}

/**
 * Get display label for role
 */
export function getRoleLabel(role: UserRole | string): string {
  const labels: Record<string, string> = {
    ADMINISTRATOR: "Administrator Sistem",
    VERIFIKATOR: "Verifikator",
    INVESTIGATOR: "Investigator",
    SUPERVISOR: "Supervisor",
    DATA_ANALYST: "Data/AI Analyst",
    // legacy
    FRAUD_ANALYST: "Investigator",
    CLAIM_VERIFIER: "Verifikator",
    AUDITOR: "Data/AI Analyst",
  };
  return labels[role] || role;
}

/**
 * Demo users for each role (used in demo-token endpoint)
 */
export const DEMO_USERS: Record<UserRole, AuthUserPrincipal> = {
  ADMINISTRATOR: {
    id: "usr_admin_001",
    username: "admin_aura",
    fullName: "Administrator Sistem AURA-JKN",
    role: "ADMINISTRATOR",
  },
  VERIFIKATOR: {
    id: "usr_verifier_001",
    username: "verifier_aura",
    fullName: "Verifikator Pra-Pembayaran BPJS",
    role: "VERIFIKATOR",
  },
  INVESTIGATOR: {
    id: "usr_investigator_001",
    username: "investigator_aura",
    fullName: "Investigator Anomali Klaim BPJS",
    role: "INVESTIGATOR",
  },
  SUPERVISOR: {
    id: "usr_supervisor_001",
    username: "supervisor_aura",
    fullName: "Supervisor Tim Investigasi BPJS",
    role: "SUPERVISOR",
  },
  DATA_ANALYST: {
    id: "usr_analyst_001",
    username: "analyst_aura",
    fullName: "Data & AI Analyst BPJS",
    role: "DATA_ANALYST",
  },
};
