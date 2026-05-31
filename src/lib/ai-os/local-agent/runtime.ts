import "server-only";

// Mirrors src/lib/git/actions.ts#isLocalRuntime: deny hosted/serverless/edge.
export function isLocalRuntimeAllowed(): boolean {
  if (process.env.VERCEL) return false;
  if (process.env.VERCEL_ENV) return false;
  if (process.env.NEXT_RUNTIME === "edge") return false;
  if (process.env.ROZETTA_HOSTED) return false;
  return true;
}
