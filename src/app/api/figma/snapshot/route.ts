import { NextResponse } from "next/server";

import { receiveFigmaSnapshot } from "@/lib/figma-bridge/actions";
import { resolveFigmaBridgePairingCode } from "@/lib/figma-bridge/pairing";
import type { FigmaFileSnapshot } from "@/lib/workspace/types";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Rozetta-Workspace-Code",
  "Access-Control-Allow-Private-Network": "true",
  "Access-Control-Max-Age": "600",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function POST(request: Request) {
  try {
    const snapshot = (await request.json()) as FigmaFileSnapshot;
    const pairingCode = request.headers.get("x-rozetta-workspace-code")?.trim();
    const context = pairingCode ? resolveFigmaBridgePairingCode(pairingCode) : undefined;
    const result = await receiveFigmaSnapshot(snapshot, context);
    return NextResponse.json(toPluginSnapshotResponse(result), {
      status: result.ok ? 200 : 400,
      headers: corsHeaders,
    });
  } catch (err) {
    const isPairingError =
      err instanceof Error && err.message.toLowerCase().includes("figma bridge pairing code");
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Invalid Figma snapshot request.",
      },
      {
        status: isPairingError ? 401 : 400,
        headers: corsHeaders,
      }
    );
  }
}

type SnapshotRouteResult = Awaited<ReturnType<typeof receiveFigmaSnapshot>>;

function toPluginSnapshotResponse(result: SnapshotRouteResult) {
  if (!result.ok) return result;
  return {
    ok: true,
    syncRunId: result.syncRun.id,
    summary: result.syncRun.summary,
    operations: result.syncRun.operations.length,
    latestSnapshot: result.state.latestSnapshot
      ? {
          name: result.state.latestSnapshot.name,
          collections: result.state.latestSnapshot.collections.length,
          variables: result.state.latestSnapshot.variables.length,
          createdAt: result.state.latestSnapshot.createdAt,
        }
      : undefined,
    tokenChanges: result.tokenDiff.changes.length,
  };
}
