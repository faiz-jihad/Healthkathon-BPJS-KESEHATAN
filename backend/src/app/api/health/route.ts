import { prisma } from "../../../lib/prisma";

export async function GET() {
  let postgresConnected = false;
  let postgresError: string | null = null;
  let aiServiceConnected = false;
  let aiServiceDetails: any = null;

  // 1. Check PostgreSQL via Prisma
  try {
    await prisma.$queryRaw`SELECT 1`;
    postgresConnected = true;
  } catch (err: any) {
    postgresConnected = false;
    postgresError = err?.message || "Koneksi database gagal";
  }

  // 2. Check Python R-GCN FastAPI Service (app.py)
  const aiUrl = process.env.AI_SERVICE_URL || "http://127.0.0.1:8000";
  try {
    const res = await fetch(`${aiUrl}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      aiServiceConnected = true;
      aiServiceDetails = await res.json();
    }
  } catch {
    aiServiceConnected = false;
  }

  const isFullyHealthy = postgresConnected && aiServiceConnected;

  return Response.json({
    status: isFullyHealthy ? "healthy" : "degraded",
    policy: "ZERO_MOCK_DATA",
    service: "AURA-JKN Next.js Backend API",
    database: {
      provider: "PostgreSQL (Prisma ORM)",
      connected: postgresConnected,
      mode: postgresConnected ? "postgresql_live" : "disconnected",
      error: postgresError,
    },
    ai_engine: {
      url: aiUrl,
      connected: aiServiceConnected,
      model_loaded: aiServiceDetails?.model_loaded ?? false,
      graph_loaded: aiServiceDetails?.graph_loaded ?? false,
      device: aiServiceDetails?.device ?? "unknown",
    },
    timestamp: new Date().toISOString(),
  });
}
