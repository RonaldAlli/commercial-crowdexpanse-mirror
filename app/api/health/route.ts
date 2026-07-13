import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

// Unauthenticated liveness probe (excluded from auth in middleware). Returns only
// non-sensitive operational signals — no configuration, env, or secrets. The DB
// round-trip doubles as a live latency signal.
export const dynamic = "force-dynamic";

export async function GET() {
  let dbMs: number | null = null;
  let status = "ok";
  try {
    const start = performance.now();
    await prisma.$queryRaw`SELECT 1`;
    dbMs = Math.round((performance.now() - start) * 100) / 100;
  } catch {
    status = "degraded";
  }
  return NextResponse.json({
    status,
    dbMs,
    uptime: Math.round(process.uptime()),
    commit: process.env.GIT_COMMIT ?? process.env.SOURCE_COMMIT ?? null,
  });
}
