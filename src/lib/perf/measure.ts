import "server-only";

const ENABLED = process.env.ROZETTA_PERF_DEBUG === "1";

export async function measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
  if (!ENABLED) return fn();
  const startedAt = performance.now();
  try {
    return await fn();
  } finally {
    const ms = performance.now() - startedAt;
    console.log(`[rozetta-perf] ${name}: ${ms.toFixed(1)}ms`);
  }
}

export function isPerfDebugEnabled() {
  return ENABLED;
}
