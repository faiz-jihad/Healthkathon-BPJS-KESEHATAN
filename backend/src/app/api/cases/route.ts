import { prisma } from "@/lib/prisma";
const db = prisma as any;
import {
  getAuthenticatedUser,
  requirePermission,
  PERMISSIONS,
  hasPermission,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

// ============================================================
// Case Investigation State Machine
// Valid transitions: who can do what
// ============================================================

type CaseStatus =
  | "NEW"
  | "FLAGGED_FOR_REVIEW"
  | "UNDER_REVIEW"
  | "AWAITING_EVIDENCE"
  | "ESCALATED"
  | "RESOLVED"
  | "CLOSED";

const VALID_TRANSITIONS: Record<
  CaseStatus,
  {
    to: CaseStatus[];
    requiredPermission: string;
    requiresNotes: boolean;
    description: string;
  }[]
> = {
  NEW: [
    {
      to: ["FLAGGED_FOR_REVIEW"],
      requiredPermission: PERMISSIONS.START_REVIEW,
      requiresNotes: false,
      description: "Tandai untuk ditinjau",
    },
  ],
  FLAGGED_FOR_REVIEW: [
    {
      to: ["UNDER_REVIEW"],
      requiredPermission: PERMISSIONS.START_REVIEW,
      requiresNotes: false,
      description: "Mulai review",
    },
    {
      to: ["CLOSED"],
      requiredPermission: PERMISSIONS.CLOSE_CASE,
      requiresNotes: true,
      description: "Tutup kasus (tanpa investigasi)",
    },
  ],
  UNDER_REVIEW: [
    {
      to: ["AWAITING_EVIDENCE"],
      requiredPermission: PERMISSIONS.REQUEST_EVIDENCE,
      requiresNotes: true,
      description: "Minta bukti tambahan",
    },
    {
      to: ["ESCALATED"],
      requiredPermission: PERMISSIONS.ESCALATE_CASE,
      requiresNotes: true,
      description: "Eskalasi ke supervisor",
    },
    {
      to: ["RESOLVED"],
      requiredPermission: PERMISSIONS.RESOLVE_CASE,
      requiresNotes: true,
      description: "Selesaikan kasus",
    },
  ],
  AWAITING_EVIDENCE: [
    {
      to: ["UNDER_REVIEW"],
      requiredPermission: PERMISSIONS.START_REVIEW,
      requiresNotes: false,
      description: "Lanjutkan review setelah bukti diterima",
    },
    {
      to: ["ESCALATED"],
      requiredPermission: PERMISSIONS.ESCALATE_CASE,
      requiresNotes: true,
      description: "Eskalasi karena bukti tidak mencukupi",
    },
    {
      to: ["RESOLVED"],
      requiredPermission: PERMISSIONS.RESOLVE_CASE,
      requiresNotes: true,
      description: "Selesaikan kasus",
    },
  ],
  ESCALATED: [
    {
      to: ["UNDER_REVIEW"],
      requiredPermission: PERMISSIONS.APPROVE_ESCALATION,
      requiresNotes: true,
      description: "Supervisor mengembalikan untuk review ulang",
    },
    {
      to: ["RESOLVED"],
      requiredPermission: PERMISSIONS.APPROVE_ESCALATION,
      requiresNotes: true,
      description: "Supervisor menyelesaikan kasus",
    },
    {
      to: ["CLOSED"],
      requiredPermission: PERMISSIONS.CLOSE_CASE,
      requiresNotes: true,
      description: "Tutup kasus yang dieskalasi",
    },
  ],
  RESOLVED: [
    {
      to: ["CLOSED"],
      requiredPermission: PERMISSIONS.CLOSE_CASE,
      requiresNotes: false,
      description: "Tutup kasus yang sudah selesai",
    },
  ],
  CLOSED: [], // terminal state
};

// ============================================================
// GET /api/cases — Investigation Queue & CSV Export
// ============================================================

export async function GET(request: Request) {
  const user = getAuthenticatedUser(request);
  const authError = requirePermission(user, PERMISSIONS.VIEW_CASE_QUEUE);
  if (authError) return authError;

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status"); // NEW | FLAGGED_FOR_REVIEW | etc
  const priorityFilter = url.searchParams.get("priority"); // HIGH | MEDIUM | LOW
  const assignedTo = url.searchParams.get("assigned_to"); // username
  const search = (url.searchParams.get("search") || "").toLowerCase().trim();
  const sortBy = url.searchParams.get("sort_by") || "priority_desc"; // priority_desc | created_asc | created_desc | sla_asc
  const format = (url.searchParams.get("format") || "json").toLowerCase();
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10))
  );

  try {
    const andConditions: any[] = [];

    // Supervisor and Admin see all cases; others see only assigned to them (or unassigned in their queue)
    const canViewAll = hasPermission(user!.role, PERMISSIONS.VIEW_ALL_CASES);
    if (!canViewAll && user && (!assignedTo || assignedTo === "ALL")) {
      // Verifikator/Investigator see: unassigned OR assigned to them
      andConditions.push({
        OR: [{ assignedTo: null }, { assignedTo: user.username }],
      });
    }

    if (statusFilter && statusFilter !== "ALL") {
      andConditions.push({ status: statusFilter });
    }
    if (priorityFilter && priorityFilter !== "ALL") {
      andConditions.push({ priority: priorityFilter });
    }
    if (assignedTo && assignedTo !== "ALL") {
      if (assignedTo === "UNASSIGNED") {
        andConditions.push({ assignedTo: null });
      } else {
        andConditions.push({ assignedTo });
      }
    }
    if (search) {
      andConditions.push({
        OR: [
          { caseNumber: { contains: search, mode: "insensitive" } },
          { claimId: { contains: search, mode: "insensitive" } },
          { assignedTo: { contains: search, mode: "insensitive" } },
        ],
      });
    }

    const where: any = andConditions.length > 0 ? { AND: andConditions } : {};

    let orderBy: any = [
      { priorityScore: "desc" },
      { createdAt: "asc" },
    ];
    if (sortBy === "created_asc") {
      orderBy = { createdAt: "asc" };
    } else if (sortBy === "created_desc") {
      orderBy = { createdAt: "desc" };
    } else if (sortBy === "sla_asc") {
      orderBy = [{ slaDeadline: "asc" }, { priorityScore: "desc" }];
    }

    const [total, cases] = await Promise.all([
      db.caseInvestigation.count({ where }),
      db.caseInvestigation.findMany({
        where,
        orderBy,
        skip: format === "csv" ? 0 : (page - 1) * limit,
        take: format === "csv" ? 500 : limit,
        include: {
          claim: {
            include: {
              patient: true,
              doctor: true,
              facility: true,
              riskAssessment: true,
              humanReviews: {
                orderBy: { reviewedAt: "desc" },
                take: 1,
              },
            },
          },
          transitions: {
            orderBy: { createdAt: "desc" },
            take: 3,
          },
        },
      }),
    ]);

    const now = new Date();

    const mappedCases = cases.map((c: any) => {
      const waitHours = c.reviewStartedAt
        ? null
        : Math.round(
            (now.getTime() - new Date(c.createdAt).getTime()) /
              (1000 * 60 * 60) * 10
          ) / 10;

      const slaBreached =
        c.slaDeadline ? now > new Date(c.slaDeadline) : null;

      // Priority reasoning
      const ra = c.claim?.riskAssessment;
      const priorityReasons: string[] = [];
      if (ra?.riskLevel === "HIGH") priorityReasons.push("Risiko AI: HIGH");
      if (ra?.spatialConflictDetected)
        priorityReasons.push("Konflik spasiotemporal terdeteksi");
      if (slaBreached) priorityReasons.push("SLA terlampaui");
      if (waitHours && waitHours > 48)
        priorityReasons.push(`Menunggu ${Math.floor(waitHours)} jam`);
      if (c.status === "ESCALATED") priorityReasons.push("Dieskalasi");
      if (priorityReasons.length === 0)
        priorityReasons.push("Prioritas standar berdasarkan urutan masuk");

      return {
        id: c.id,
        case_number: c.caseNumber,
        claim_id: c.claimId,
        status: c.status,
        priority: c.priority,
        priority_score: c.priorityScore,
        priority_reasons: priorityReasons,
        assigned_to: c.assignedTo,
        assigned_role: c.assignedRole,
        assigned_at: c.assignedAt,
        escalated_to: c.escalatedTo,
        escalated_at: c.escalatedAt,
        escalation_reason: c.escalationReason,
        wait_hours: waitHours,
        sla_deadline: c.slaDeadline,
        sla_breached: slaBreached,
        review_started_at: c.reviewStartedAt,
        resolved_at: c.resolvedAt,
        closed_at: c.closedAt,
        outcome: c.outcome,
        outcome_notes: c.outcomeNotes,
        created_at: c.createdAt,
        updated_at: c.updatedAt,
        // Claim summary
        claim_summary: c.claim
          ? {
              patient_id: c.claim.patientId,
              doctor_id: c.claim.doctorId,
              facility_id: c.claim.facilityId,
              service_date: c.claim.serviceDate,
              icd10_code: c.claim.icd10Code,
              ina_cbgs_tariff: c.claim.inaCbgsTariff,
              risk_level: ra?.riskLevel || "UNASSESSED",
              fraud_risk_index: ra?.fraudRiskIndex || null,
              fraud_probability: ra?.fraudProbability || null,
              primary_trigger: ra?.primaryFraudTrigger || null,
            }
          : null,
        recent_transitions: c.transitions.map((t: any) => ({
          from: t.fromStatus,
          to: t.toStatus,
          actor: t.actorName,
          role: t.actorRole,
          notes: t.notes,
          at: t.createdAt,
        })),
        available_actions: getAvailableActions(c.status as CaseStatus, user!.role),
      };
    });

    if (format === "csv") {
      const headers = [
        "case_number",
        "claim_id",
        "status",
        "priority",
        "priority_score",
        "assigned_to",
        "assigned_role",
        "outcome",
        "outcome_notes",
        "fraud_risk_index",
        "ina_cbgs_tariff",
        "sla_deadline",
        "created_at",
        "resolved_at",
      ];
      const escapeCsv = (val: any) => {
        if (val === null || val === undefined) return "";
        const str = String(val).replace(/"/g, '""');
        return /[,"\n]/.test(str) ? `"${str}"` : str;
      };
      const rows = mappedCases.map((mc: any) =>
        [
          mc.case_number,
          mc.claim_id,
          mc.status,
          mc.priority,
          mc.priority_score,
          mc.assigned_to || "",
          mc.assigned_role || "",
          mc.outcome || "",
          mc.outcome_notes || "",
          mc.claim_summary?.fraud_risk_index ?? "",
          mc.claim_summary?.ina_cbgs_tariff ?? "",
          mc.sla_deadline ? new Date(mc.sla_deadline).toISOString() : "",
          mc.created_at ? new Date(mc.created_at).toISOString() : "",
          mc.resolved_at ? new Date(mc.resolved_at).toISOString() : "",
        ]
          .map(escapeCsv)
          .join(",")
      );
      const csvContent = [headers.join(","), ...rows].join("\n");
      return new Response(csvContent, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="aura_jkn_cases_report.csv"',
        },
      });
    }

    // Queue summary
    const [queueStats] = await Promise.all([
      db.caseInvestigation.groupBy({
        by: ["status"],
        _count: { id: true },
      }),
    ]);

    const statusCounts: Record<string, number> = {};
    for (const row of queueStats) {
      statusCounts[row.status] = row._count.id;
    }

    return Response.json({
      status: "SUCCESS",
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
      queue_summary: statusCounts,
      cases: mappedCases,
    });
  } catch (dbErr: any) {
    return Response.json(
      {
        status: "DATA_SOURCE_UNAVAILABLE",
        error: `Database tidak dapat dihubungi: ${dbErr?.message || "Koneksi gagal"}`,
      },
      { status: 503 }
    );
  }
}

// ============================================================
// POST /api/cases — Create case from claim (or assign)
// ============================================================

export async function POST(request: Request) {
  const user = getAuthenticatedUser(request);
  const authError = requirePermission(user, PERMISSIONS.START_REVIEW);
  if (authError) return authError;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { status: "VALIDATION_ERROR", error: "Body harus berupa JSON valid." },
      { status: 400 }
    );
  }

  const { claim_id, action, notes, assigned_to } = body;

  if (!claim_id) {
    return Response.json(
      { status: "VALIDATION_ERROR", error: "Field 'claim_id' wajib diisi." },
      { status: 400 }
    );
  }

  try {
    // Check if claim exists
    const claim: any = await db.claim.findUnique({
      where: { claimId: claim_id },
      include: { riskAssessment: true, caseInvestigation: true },
    });

    if (!claim) {
      return Response.json(
        { status: "NOT_FOUND", error: `Klaim '${claim_id}' tidak ditemukan.` },
        { status: 404 }
      );
    }

    // Create case if not exists
    if (!claim.caseInvestigation) {
      const date = new Date();
      const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
      const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
      const caseNumber = `CASE-${dateStr}-${rand}`;

      // Calculate priority score
      const ra = claim.riskAssessment;
      let priorityScore = 50;
      let priority = "MEDIUM";
      if (ra) {
        priorityScore = Math.min(100, ra.fraudRiskIndex || 50);
        if (ra.spatialConflictDetected) priorityScore = Math.min(100, priorityScore + 10);
        if (ra.riskLevel === "HIGH") {
          priority = "HIGH";
          priorityScore = Math.max(priorityScore, 70);
        } else if (ra.riskLevel === "LOW") {
          priority = "LOW";
          priorityScore = Math.min(priorityScore, 30);
        }
      }

      const newCase = await prisma.$transaction(async (tx: any) => {
        const created = await tx.caseInvestigation.create({
          data: {
            claimId: claim_id,
            caseNumber,
            status: "FLAGGED_FOR_REVIEW",
            priority,
            priorityScore,
            assignedTo: assigned_to || null,
            assignedRole: assigned_to ? user!.role : null,
            assignedAt: assigned_to ? new Date() : null,
            slaDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7-day default SLA
          },
        });

        await tx.caseTransition.create({
          data: {
            caseId: created.id,
            fromStatus: "NEW",
            toStatus: "FLAGGED_FOR_REVIEW",
            actorName: user!.fullName,
            actorRole: user!.role,
            notes: notes || "Kasus dibuat dari alert sistem",
          },
        });

        await tx.auditLog.create({
          data: {
            actorName: user!.fullName,
            actorRole: user!.role,
            action: "CASE_CREATED",
            targetId: caseNumber,
            metadata: {
              claim_id,
              priority,
              priority_score: priorityScore,
              assigned_to: assigned_to || null,
            },
          },
        });

        return created;
      });

      return Response.json(
        {
          status: "CASE_CREATED",
          case_number: newCase.caseNumber,
          case_id: newCase.id,
          claim_id,
          case_status: newCase.status,
          priority,
          priority_score: priorityScore,
        },
        { status: 201 }
      );
    }

    return Response.json(
      {
        status: "CONFLICT",
        error: `Kasus untuk klaim '${claim_id}' sudah ada: ${claim.caseInvestigation.caseNumber}`,
        existing_case: claim.caseInvestigation.caseNumber,
      },
      { status: 409 }
    );
  } catch (dbErr: any) {
    return Response.json(
      {
        status: "DATABASE_ERROR",
        error: `Gagal membuat kasus: ${dbErr?.message || "Kesalahan database"}`,
      },
      { status: 500 }
    );
  }
}

// ============================================================
// Helper: get available actions based on current status and role
// ============================================================

function getAvailableActions(
  status: CaseStatus,
  role: string
): Array<{ action: string; to_status: string; description: string }> {
  const transitions = VALID_TRANSITIONS[status] || [];
  const result: Array<{ action: string; to_status: string; description: string }> = [];

  for (const t of transitions) {
    if (hasPermission(role as any, t.requiredPermission as any)) {
      for (const toStatus of t.to) {
        result.push({
          action: `TRANSITION_TO_${toStatus}`,
          to_status: toStatus,
          description: t.description,
        });
      }
    }
  }

  return result;
}
