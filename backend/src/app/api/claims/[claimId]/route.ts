import { NextRequest, NextResponse } from "next/server";
import { getInMemoryClaimsStore } from "@/lib/mock-store";

export async function GET(
  _request: NextRequest,
  { params }: { params: { claimId: string } }
) {
  const { claimId } = params;
  const store = getInMemoryClaimsStore();
  const found = store.find((c) => c.claim_id === claimId);

  if (found) {
    return NextResponse.json(found);
  }

  // Try querying Python FastAPI service (app.py GET /api/v1/claims/{claim_id}) if not in local store
  const aiUrl = process.env.AI_SERVICE_URL || "http://127.0.0.1:8000";
  try {
    const res = await fetch(`${aiUrl}/api/v1/claims/${encodeURIComponent(claimId)}`, {
      signal: AbortSignal.timeout(2500),
    });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json({
        ...data,
        fraud_risk_index: Math.round((data.fraud_probability || 0) * 100),
        review_status:
          data.pre_payment_gate === "AUTO_APPROVE" ? "RELEASED" : "PENDING_REVIEW",
        human_reviews: [],
      });
    }
  } catch {
    // Ignore error and return 404
  }

  return NextResponse.json(
    { error: `Klaim '${claimId}' tidak ditemukan.` },
    { status: 404 }
  );
}
