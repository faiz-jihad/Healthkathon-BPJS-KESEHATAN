import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getInMemoryClaimsStore } from "@/lib/mock-store";

export async function POST(
  request: NextRequest,
  { params }: { params: { claimId: string } }
) {
  try {
    const { claimId } = params;
    const body = await request.json();
    const {
      reviewer_name = "Verifikator Anti-Fraud BPJS",
      reviewer_role = "VERIFIKATOR_BPJS",
      decision, // RELEASE | CLARIFY | ESCALATE_AUDIT
      notes = "",
    } = body;

    if (!["RELEASE", "CLARIFY", "ESCALATE_AUDIT"].includes(decision)) {
      return NextResponse.json(
        { error: "Decision harus salah satu dari RELEASE, CLARIFY, atau ESCALATE_AUDIT" },
        { status: 400 }
      );
    }

    const feedbackLabel =
      decision === "ESCALATE_AUDIT" ? 1 : decision === "RELEASE" ? 0 : null;

    // 1. Update in PostgreSQL if connected
    let savedToPostgres = false;
    try {
      await prisma.humanReview.create({
        data: {
          claimId,
          reviewerName: reviewer_name,
          reviewerRole: reviewer_role,
          decision,
          notes,
          feedbackLabel,
        },
      });
      await prisma.auditLog.create({
        data: {
          actorName: reviewer_name,
          actorRole: reviewer_role,
          action: `HUMAN_REVIEW_${decision}`,
          targetId: claimId,
          metadata: { decision, notes, feedbackLabel },
        },
      });
      savedToPostgres = true;
    } catch {
      savedToPostgres = false;
    }

    // 2. Also update in-memory store for instant UI sync
    const store = getInMemoryClaimsStore();
    const target = store.find((c) => c.claim_id === claimId);
    const reviewEntry = {
      id: `rev_${Date.now()}`,
      reviewer_name,
      reviewer_role,
      decision,
      notes,
      reviewed_at: new Date().toISOString(),
    };

    if (target) {
      if (decision === "RELEASE") target.review_status = "RELEASED";
      else if (decision === "CLARIFY") target.review_status = "CLARIFICATION_REQUESTED";
      else if (decision === "ESCALATE_AUDIT") target.review_status = "ESCALATED_AUDIT";
      target.human_reviews.unshift(reviewEntry);
    }

    return NextResponse.json({
      status: "ok",
      claim_id: claimId,
      saved_to_postgres: savedToPostgres,
      review_status: target?.review_status ?? decision,
      review: reviewEntry,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Gagal menyimpan keputusan review." },
      { status: 500 }
    );
  }
}
