import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  let postgresConnected = false;
  let aiServiceConnected = false;

  // 1. Check PostgreSQL via Prisma
  try {
    await prisma.$queryRaw`SELECT 1`;
    postgresConnected = true;
  } catch {
    postgresConnected = false;
  }

  // 2. Check Python R-GCN FastAPI Service (app.py)
  const aiUrl = process.env.AI_SERVICE_URL || "http://127.0.0.1:8000";
  try {
    const res = await fetch(`${aiUrl}/health`, {
      signal: AbortSignal.timeout(1500),
    });
    if (res.ok) {
      aiServiceConnected = true;
    }
  } catch {
    aiServiceConnected = false;
  }

  return NextResponse.json({
    status: "healthy",
    service: "AURA-JKN Next.js Backend API",
    database: {
      provider: "PostgreSQL (Prisma ORM)",
      connected: postgresConnected,
      mode: postgresConnected ? "postgresql_live" : "resilient_in_memory_fallback",
    },
    ai_engine: {
      url: aiUrl,
      connected: aiServiceConnected,
    },
    timestamp: new Date().toISOString(),
  });
}
