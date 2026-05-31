import { NextResponse } from "next/server";

import { getPendingFigmaWriteback } from "@/lib/figma-bridge/actions";
import { resolveFigmaBridgePairingCode } from "@/lib/figma-bridge/pairing";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Rozetta-Workspace-Code",
  "Access-Control-Allow-Private-Network": "true",
  "Access-Control-Max-Age": "600",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(request: Request) {
  try {
    const pairingCode = request.headers.get("x-rozetta-workspace-code")?.trim();
    if (!pairingCode) {
      return NextResponse.json(
        { ok: false, error: "Missing pairing code." },
        { status: 401, headers: corsHeaders }
      );
    }
    const context = resolveFigmaBridgePairingCode(pairingCode);
    const url = new URL(request.url);
    const ackSeq = Number.parseInt(url.searchParams.get("seq") ?? "0", 10);
    const safeAckSeq = Number.isFinite(ackSeq) && ackSeq >= 0 ? ackSeq : 0;
    const result = await getPendingFigmaWriteback(safeAckSeq, context);
    return NextResponse.json(
      { ok: true, ...result },
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid writeback poll request.";
    const isPairingError = message.toLowerCase().includes("figma bridge pairing code");
    if (!isPairingError) console.error("[figma-bridge] pending poll error:", err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: isPairingError ? 401 : 400, headers: corsHeaders }
    );
  }
}
