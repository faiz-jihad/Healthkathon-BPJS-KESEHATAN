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
// GET /api/cases/[caseId] — Case Detail with Evidence Center
// ============================================================

export async function GET(
  request: Request,
  { params }: { params: { caseId: string } }
) {
  const user = getAuthenticatedUser(request);
  const authError = requirePermission(user, PERMISSIONS.VIEW_CASE_QUEUE);
  if (authError) return authError;

  const { caseId } = params;

  try {
    const caseData = await db.caseInvestigation.findFirst({
      where: {
        OR: [{ id: caseId }, { caseNumber: caseId }, { claimId: caseId }],
      },
      include: {
        claim: {
          include: {
            patient: true,
            doctor: true,
            facility: true,
            riskAssessment: true,
            humanReviews: { orderBy: { reviewedAt: "desc" } },
          },
        },
        transitions: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!caseData) {
      return Response.json(
        { status: "NOT_FOUND", error: `Kasus '${caseId}' tidak ditemukan.` },
        { status: 404 }
      );
    }

    const claim: any = caseData.claim;
    const ra: any = claim?.riskAssessment;

    // Build structured Evidence Center response (Phase 4)
    const evidenceCenter = {
      case_summary: {
        case_number: caseData.caseNumber,
        claim_id: caseData.claimId,
        status: caseData.status,
        priority: caseData.priority,
        priority_score: caseData.priorityScore,
        assigned_to: caseData.assignedTo,
        assigned_role: caseData.assignedRole || null,
        assigned_at: caseData.assignedAt,
        sla_deadline: caseData.slaDeadline,
        sla_breached: caseData.slaDeadline
          ? new Date() > new Date(caseData.slaDeadline)
          : null,
        created_at: caseData.createdAt,
        review_started_at: caseData.reviewStartedAt,
        resolved_at: caseData.resolvedAt,
        outcome: caseData.outcome,
        outcome_notes: caseData.outcomeNotes,
      },

      // OBSERVED FACTS: Data yang benar-benar tercatat dalam database
      observed_facts: claim
        ? {
            _label: "Fakta Tercatat",
            _description:
              "Informasi yang benar-benar tersimpan dalam database klaim",
            claim_id: claim.claimId,
            patient_id: claim.patientId,
            home_region: claim.patient?.homeRegion || null,
            doctor_id: claim.doctorId,
            sip_number: claim.doctor?.sipNumber || null,
            specialty: claim.doctor?.specialty || null,
            facility_id: claim.facilityId,
            facility_class: claim.facility?.facilityClass || null,
            icd10_code: claim.icd10Code,
            icd9_code: claim.icd9Code || null,
            service_date: claim.serviceDate,
            service_time: claim.serviceTime,
            ina_cbgs_tariff: claim.inaCbgsTariff,
            length_of_stay: claim.lengthOfStay,
            is_synthetic: claim.isSynthetic,
            created_at: claim.createdAt,
          }
        : null,

      // DETECTED PATTERNS: Pola yang teridentifikasi dari aturan dan metrik
      detected_patterns: ra
        ? {
            _label: "Pola Terdeteksi",
            _description:
              "Pola yang diidentifikasi oleh aturan berbasis data aktual",
            spatial_conflict_detected: ra.spatialConflictDetected,
            doctor_daily_volume: ra.doctorDailyVolume,
            spatiotemporal_risk_score: ra.spatiotemporalRiskScore,
            primary_trigger: ra.primaryFraudTrigger,
            evidence_reasons: ra.evidenceReasons,
            subgraph_evidence: ra.subgraphEvidence,
          }
        : {
            _label: "Pola Terdeteksi",
            _description: "Tidak ada asesmen risiko tersedia",
            spatial_conflict_detected: null,
            doctor_daily_volume: null,
            spatiotemporal_risk_score: null,
            primary_trigger: null,
            evidence_reasons: [],
            subgraph_evidence: { nodes: [], edges: [] },
          },

      // AI OUTPUT: Hasil model dengan label jelas
      ai_output: ra
        ? {
            _label: "Output Model AI",
            _description:
              "Hasil inferensi model R-GCN. Skor ini bukan pembuktian fraud — ini adalah alat bantu analitis.",
            _legal_disclaimer:
              "Anomaly score bukan probabilitas fraud dalam arti hukum kecuali telah divalidasi secara independen.",
            assessment_status: ra.assessmentStatus,
            fraud_probability: ra.fraudProbability,
            fraud_risk_index: ra.fraudRiskIndex,
            risk_level: ra.riskLevel,
            pre_payment_gate: ra.prePaymentGate,
            model_version: ra.modelVersion,
            evaluated_at: ra.evaluatedAt,
            model_name: "PyTorch Geometric Hetero R-GCN",
          }
        : {
            _label: "Output Model AI",
            _description: "Inferensi AI tidak tersedia untuk klaim ini",
            assessment_status: "NOT_ASSESSED",
            fraud_probability: null,
            fraud_risk_index: null,
            risk_level: "UNASSESSED",
            pre_payment_gate: "PENDING_ASSESSMENT",
            model_version: null,
            evaluated_at: null,
          },

      // INVESTIGATOR FINDINGS: Hasil pemeriksaan manusia
      investigator_findings: {
        _label: "Temuan Petugas",
        _description:
          "Catatan dan keputusan yang dicatat oleh petugas berwenang",
        reviews: claim?.humanReviews.map((r: any) => ({
          id: r.id,
          reviewer_name: r.reviewerName,
          reviewer_role: r.reviewerRole,
          decision: r.decision,
          notes: r.notes,
          feedback_label: r.feedbackLabel,
          reviewed_at: r.reviewedAt,
        })) || [],
        total_reviews: claim?.humanReviews.length || 0,
      },

      // CASE TRANSITIONS: History perubahan status
      case_history: {
        _label: "Riwayat Kasus",
        transitions: caseData.transitions.map((t: any) => ({
          from_status: t.fromStatus,
          to_status: t.toStatus,
          actor_name: t.actorName,
          actor_role: t.actorRole,
          notes: t.notes,
          at: t.createdAt,
        })),
      },

      // FINAL OUTCOME: Status akhir berdasarkan prosedur
      final_outcome: {
        _label: "Hasil Akhir",
        _description:
          "Status akhir kasus berdasarkan hasil pemeriksaan petugas yang berwenang",
        status: caseData.status,
        outcome: caseData.outcome,
        outcome_notes: caseData.outcomeNotes,
        resolved_at: caseData.resolvedAt,
        closed_at: caseData.closedAt,
        _disclaimer:
          "Hasil investigasi ini merupakan catatan analitis pra-pembayaran, bukan keputusan administratif pembayaran klaim atau pembuktian hukum.",
      },

      // Available actions for current user role
      available_actions: getAvailableTransitions(
        caseData.status as any,
        user!.role
      ),
    };

    return Response.json({
      status: "SUCCESS",
      case_id: caseData.id,
      evidence_center: evidenceCenter,
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
// PATCH /api/cases/[caseId] — Transition case state or Assign Case
// ============================================================

export async function PATCH(
  request: Request,
  { params }: { params: { caseId: string } }
) {
  const user = getAuthenticatedUser(request);
  if (!user) {
    return Response.json(
      { status: "UNAUTHENTICATED", error: "Token otorisasi diperlukan." },
      { status: 401 }
    );
  }

  const { caseId } = params;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { status: "VALIDATION_ERROR", error: "Body harus JSON valid." },
      { status: 400 }
    );
  }

  const { action, notes, assigned_to, assigned_role, outcome } = body;

  if (!action) {
    return Response.json(
      { status: "VALIDATION_ERROR", error: "Field 'action' wajib diisi." },
      { status: 400 }
    );
  }

  // Handle ASSIGN_CASE action for SUPERVISOR / ADMINISTRATOR
  if (action === "ASSIGN_CASE") {
    if (!hasPermission(user.role, PERMISSIONS.ASSIGN_CASE)) {
      return Response.json(
        {
          status: "FORBIDDEN",
          error: `Role '${user.role}' tidak memiliki izin 'ASSIGN_CASE'.`,
        },
        { status: 403 }
      );
    }

    if (!assigned_to || !String(assigned_to).trim()) {
      return Response.json(
        {
          status: "VALIDATION_ERROR",
          error: "Field 'assigned_to' wajib diisi untuk penugasan kasus.",
        },
        { status: 400 }
      );
    }

    try {
      const caseData = await db.caseInvestigation.findFirst({
        where: { OR: [{ id: caseId }, { caseNumber: caseId }] },
      });

      if (!caseData) {
        return Response.json(
          { status: "NOT_FOUND", error: `Kasus '${caseId}' tidak ditemukan.` },
          { status: 404 }
        );
      }

      const now = new Date();
      const targetAssignee = String(assigned_to).trim();

      const updated = await prisma.$transaction(async (tx: any) => {
        const updatedCase = await tx.caseInvestigation.update({
          where: { id: caseData.id },
          data: {
            assignedTo: targetAssignee,
            assignedRole: assigned_role || "INVESTIGATOR",
            assignedAt: now,
            updatedAt: now,
          },
        });

        await tx.caseTransition.create({
          data: {
            caseId: caseData.id,
            fromStatus: caseData.status,
            toStatus: caseData.status,
            actorName: user.fullName,
            actorRole: user.role,
            notes: notes
              ? `Penugasan ke ${targetAssignee}: ${notes}`
              : `Kasus ditugaskan kepada ${targetAssignee}`,
          },
        });

        await tx.auditLog.create({
          data: {
            actorName: user.fullName,
            actorRole: user.role,
            action: "CASE_ASSIGNED",
            targetId: caseData.caseNumber,
            metadata: {
              case_id: caseData.id,
              claim_id: caseData.claimId,
              assigned_to: targetAssignee,
              assigned_role: assigned_role || "INVESTIGATOR",
              notes: notes || null,
            },
          },
        });

        return updatedCase;
      });

      return Response.json({
        status: "ASSIGNMENT_COMPLETED",
        case_number: caseData.caseNumber,
        assigned_to: updated.assignedTo,
        assigned_role: updated.assignedRole,
        updated_at: updated.updatedAt,
        actor: user.fullName,
      });
    } catch (dbErr: any) {
      return Response.json(
        {
          status: "DATABASE_ERROR",
          error: `Gagal menugaskan kasus: ${dbErr?.message || "Kesalahan database"}`,
        },
        { status: 500 }
      );
    }
  }

  // Parse target status from action string TRANSITION_TO_XXX
  const toStatusMatch = action.match(/^TRANSITION_TO_(.+)$/);
  const toStatus = toStatusMatch ? toStatusMatch[1] : null;

  if (!toStatus) {
    return Response.json(
      {
        status: "VALIDATION_ERROR",
        error: `Action '${action}' tidak dikenali. Format: TRANSITION_TO_<STATUS> atau ASSIGN_CASE`,
      },
      { status: 400 }
    );
  }

  try {
    const caseData = await db.caseInvestigation.findFirst({
      where: { OR: [{ id: caseId }, { caseNumber: caseId }] },
    });

    if (!caseData) {
      return Response.json(
        { status: "NOT_FOUND", error: `Kasus '${caseId}' tidak ditemukan.` },
        { status: 404 }
      );
    }

    // Validate transition
    const validTransitions = getAvailableTransitions(
      caseData.status as any,
      user.role
    );
    const isValid = validTransitions.some((t) => t.to_status === toStatus);

    if (!isValid) {
      return Response.json(
        {
          status: "INVALID_TRANSITION",
          error: `Transisi dari '${caseData.status}' ke '${toStatus}' tidak diizinkan untuk role '${user.role}'.`,
          current_status: caseData.status,
          your_role: user.role,
          available_transitions: validTransitions,
        },
        { status: 422 }
      );
    }

    // Require notes for important transitions
    const requiresNotes = [
      "ESCALATED",
      "RESOLVED",
      "CLOSED",
      "AWAITING_EVIDENCE",
    ].includes(toStatus);
    if (requiresNotes && !notes?.trim()) {
      return Response.json(
        {
          status: "VALIDATION_ERROR",
          error: `Transisi ke status '${toStatus}' memerlukan catatan (notes).`,
        },
        { status: 400 }
      );
    }

    // Execute transition
    const now = new Date();
    const updateData: any = {
      status: toStatus,
      updatedAt: now,
    };

    if (toStatus === "UNDER_REVIEW" && !caseData.reviewStartedAt) {
      updateData.reviewStartedAt = now;
    }
    if (toStatus === "RESOLVED") {
      updateData.resolvedAt = now;
      updateData.outcome =
        outcome || "INSUFFICIENT_EVIDENCE";
      updateData.outcomeNotes = notes || null;
    }
    if (toStatus === "CLOSED") {
      updateData.closedAt = now;
    }
    if (toStatus === "ESCALATED") {
      updateData.escalatedAt = now;
      updateData.escalationReason = notes || null;
      if (assigned_to) {
        updateData.escalatedTo = assigned_to;
      }
    }
    if (assigned_to && toStatus !== "ESCALATED") {
      updateData.assignedTo = assigned_to;
      updateData.assignedAt = now;
    }

    const updated = await prisma.$transaction(async (tx: any) => {
      const updatedCase = await tx.caseInvestigation.update({
        where: { id: caseData.id },
        data: updateData,
      });

      await tx.caseTransition.create({
        data: {
          caseId: caseData.id,
          fromStatus: caseData.status,
          toStatus,
          actorName: user.fullName,
          actorRole: user.role,
          notes: notes || null,
        },
      });

      await tx.auditLog.create({
        data: {
          actorName: user.fullName,
          actorRole: user.role,
          action: "CASE_TRANSITIONED",
          targetId: caseData.caseNumber,
          metadata: {
            from_status: caseData.status,
            to_status: toStatus,
            case_id: caseData.id,
            claim_id: caseData.claimId,
            notes: notes || null,
            outcome: outcome || null,
          },
        },
      });

      return updatedCase;
    });

    return Response.json({
      status: "TRANSITION_COMPLETED",
      case_number: caseData.caseNumber,
      from_status: caseData.status,
      to_status: toStatus,
      updated_at: updated.updatedAt,
      actor: user.fullName,
      actor_role: user.role,
    });
  } catch (dbErr: any) {
    return Response.json(
      {
        status: "DATABASE_ERROR",
        error: `Gagal memperbarui kasus: ${dbErr?.message || "Kesalahan database"}`,
      },
      { status: 500 }
    );
  }
}

// Helper (duplicated from cases/route.ts for independence)
function getAvailableTransitions(
  status: string,
  role: string
): Array<{ action: string; to_status: string; description: string }> {
  const map: Record<string, Array<{ to: string[]; perm: string; desc: string }>> = {
    NEW: [{ to: ["FLAGGED_FOR_REVIEW"], perm: PERMISSIONS.START_REVIEW, desc: "Tandai untuk ditinjau" }],
    FLAGGED_FOR_REVIEW: [
      { to: ["UNDER_REVIEW"], perm: PERMISSIONS.START_REVIEW, desc: "Mulai review" },
      { to: ["CLOSED"], perm: PERMISSIONS.CLOSE_CASE, desc: "Tutup kasus" },
    ],
    UNDER_REVIEW: [
      { to: ["AWAITING_EVIDENCE"], perm: PERMISSIONS.REQUEST_EVIDENCE, desc: "Minta bukti tambahan" },
      { to: ["ESCALATED"], perm: PERMISSIONS.ESCALATE_CASE, desc: "Eskalasi ke supervisor" },
      { to: ["RESOLVED"], perm: PERMISSIONS.RESOLVE_CASE, desc: "Selesaikan kasus" },
    ],
    AWAITING_EVIDENCE: [
      { to: ["UNDER_REVIEW"], perm: PERMISSIONS.START_REVIEW, desc: "Lanjutkan review" },
      { to: ["ESCALATED"], perm: PERMISSIONS.ESCALATE_CASE, desc: "Eskalasi" },
      { to: ["RESOLVED"], perm: PERMISSIONS.RESOLVE_CASE, desc: "Selesaikan kasus" },
    ],
    ESCALATED: [
      { to: ["UNDER_REVIEW"], perm: PERMISSIONS.APPROVE_ESCALATION, desc: "Kembalikan untuk review" },
      { to: ["RESOLVED"], perm: PERMISSIONS.APPROVE_ESCALATION, desc: "Selesaikan kasus" },
      { to: ["CLOSED"], perm: PERMISSIONS.CLOSE_CASE, desc: "Tutup kasus" },
    ],
    RESOLVED: [
      { to: ["CLOSED"], perm: PERMISSIONS.CLOSE_CASE, desc: "Tutup kasus selesai" },
    ],
    CLOSED: [],
  };

  const transitions = map[status] || [];
  const result: Array<{ action: string; to_status: string; description: string }> = [];
  for (const t of transitions) {
    if (hasPermission(role as any, t.perm as any)) {
      for (const s of t.to) {
        result.push({ action: `TRANSITION_TO_${s}`, to_status: s, description: t.desc });
      }
    }
  }
  return result;
}
