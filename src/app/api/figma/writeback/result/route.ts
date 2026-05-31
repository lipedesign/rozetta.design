import { NextResponse } from "next/server";

import { applyFigmaWritebackResult } from "@/lib/figma-bridge/actions";
import { resolveFigmaBridgePairingCode } from "@/lib/figma-bridge/pairing";
import type { SyncOperation } from "@/lib/workspace/types";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Rozetta-Workspace-Code",
  "Access-Control-Allow-Private-Network": "true",
  "Access-Control-Max-Age": "600",
};

interface PluginResultPayload {
  syncRunId: string;
  ackSeq: number;
  status: "applied" | "failed";
  summary?: string;
  operations: Array<{
    id: string;
    kind: SyncOperation["kind"];
    status: SyncOperation["status"];
    targetKind: SyncOperation["targetKind"];
    targetId: string;
    summary: string;
    payload?: Record<string, unknown>;
  }>;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    const pairingCode = request.headers.get("x-rozetta-workspace-code")?.trim();
    if (!pairingCode) {
      return NextResponse.json(
        { ok: false, error: "Missing pairing code." },
        { status: 401, headers: corsHeaders }
      );
    }
    const context = resolveFigmaBridgePairingCode(pairingCode);
    const body = (await request.json()) as PluginResultPayload;
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "Invalid result payload." },
        { status: 400, headers: corsHeaders }
      );
    }
    const now = new Date().toISOString();
    const operations: SyncOperation[] = (body.operations ?? []).map((operation) => ({
      id: operation.id,
      runId: body.syncRunId,
      kind: operation.kind,
      status: operation.status,
      targetKind: operation.targetKind,
      targetId: operation.targetId,
      summary: operation.summary,
      payload: operation.payload ?? {},
      createdAt: now,
    }));
    const result = await applyFigmaWritebackResult(
      {
        syncRunId: body.syncRunId,
        ackSeq: body.ackSeq,
        status: body.status,
        summary: body.summary,
        operations,
      },
      context
    );
    if (!result.ok) {
      return NextResponse.json(result, { status: 409, headers: corsHeaders });
    }
    return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid writeback result.";
    const isPairingError = message.toLowerCase().includes("figma bridge pairing code");
    return NextResponse.json(
      { ok: false, error: message },
      { status: isPairingError ? 401 : 400, headers: corsHeaders }
    );
  }
}
