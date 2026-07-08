import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    ok: true,
    app: "commercial-crowdexpanse",
    scope: "commercial-acquisitions-mvp",
  });
}
