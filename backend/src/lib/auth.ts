import crypto from "node:crypto";

export type UserRole = "ADMINISTRATOR" | "FRAUD_ANALYST" | "CLAIM_VERIFIER" | "AUDITOR";

export const VALID_ROLES: UserRole[] = [
  "ADMINISTRATOR",
  "FRAUD_ANALYST",
  "CLAIM_VERIFIER",
  "AUDITOR",
];

export interface AuthUserPrincipal {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
}

export interface TokenPayload extends AuthUserPrincipal {
  iat: number;
  exp: number;
}

// Server Secret for signing tokens. In production, load from AUTH_SECRET env var.
const AUTH_SECRET = process.env.AUTH_SECRET || "aura-jkn-secure-hmac-secret-healthkathon-2026-bpjs";

/**
 * Hash password using PBKDF2 with SHA-512 and random salt
 */
export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const generatedSalt = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, generatedSalt, 10000, 64, "sha512").toString("hex");
  return { hash, salt: generatedSalt };
}

/**
 * Verify password in timing-safe manner
 */
export function verifyPassword(password: string, hash: string, salt: string): boolean {
  try {
    const calculatedHash = crypto.pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex");
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(calculatedHash, "hex"));
  } catch {
    return false;
  }
}

/**
 * Sign payload into a standard HMAC-SHA256 Token (Header.Payload.Signature)
 */
export function signAuthToken(user: AuthUserPrincipal, expiresInSeconds = 86400): string {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = {
    ...user,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
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

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return null;
    }

    const payloadText = Buffer.from(encodedPayload, "base64url").toString("utf8");
    const payload: TokenPayload = JSON.parse(payloadText);

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null;
    }

    if (!VALID_ROLES.includes(payload.role)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Extract authenticated user principal from Request Authorization header
 */
export function getAuthenticatedUser(request: Request): AuthUserPrincipal | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.substring(7).trim();
  const payload = verifyAuthToken(token);
  if (!payload) return null;

  return {
    id: payload.id,
    username: payload.username,
    fullName: payload.fullName,
    role: payload.role,
  };
}

/**
 * RBAC Permission Matrix definition
 */
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  ADMINISTRATOR: [
    "MANAGE_USERS",
    "VIEW_HEALTH",
    "VIEW_AUDIT_LOGS",
    "VIEW_CLAIMS",
    "EXPORT_REPORTS",
  ],
  FRAUD_ANALYST: [
    "VIEW_CLAIMS",
    "INVESTIGATE_CLAIMS",
    "VIEW_EVIDENCE_GRAPH",
    "RECORD_INVESTIGATION_NOTES",
    "EXPORT_REPORTS",
  ],
  CLAIM_VERIFIER: [
    "VIEW_CLAIMS",
    "INVESTIGATE_CLAIMS",
    "VIEW_EVIDENCE_GRAPH",
    "RECORD_REVIEW_DECISION",
    "VIEW_REVIEW_HISTORY",
  ],
  AUDITOR: [
    "VIEW_CLAIMS_READONLY",
    "VIEW_AUDIT_LOGS",
    "VIEW_REVIEW_HISTORY",
    "EXPORT_REPORTS",
  ],
};

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: UserRole, permission: string): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
