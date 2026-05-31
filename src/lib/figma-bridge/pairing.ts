import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { WorkspaceContext } from "@/lib/auth/types";

const PAIRING_VERSION = 1;
const DEFAULT_TTL_MS = 30 * 60 * 1000;

interface PairingPayload {
  version: number;
  userId: string;
  organizationId: string;
  workspaceId: string;
  role: WorkspaceContext["role"];
  source: WorkspaceContext["source"];
  nonce: string;
  expiresAt: string;
}

export interface FigmaBridgePairingCode {
  code: string;
  expiresAt: string;
}

export function createFigmaBridgePairingCode(
  context: WorkspaceContext,
  ttlMs = DEFAULT_TTL_MS
): FigmaBridgePairingCode {
  const payload: PairingPayload = {
    version: PAIRING_VERSION,
    userId: context.userId,
    organizationId: context.organizationId,
    workspaceId: context.workspaceId,
    role: context.role,
    source: context.source,
    nonce: randomBytes(12).toString("base64url"),
    expiresAt: new Date(Date.now() + ttlMs).toISOString(),
  };
  const encodedPayload = encode(JSON.stringify(payload));
  return {
    code: `${encodedPayload}.${sign(encodedPayload)}`,
    expiresAt: payload.expiresAt,
  };
}

export function resolveFigmaBridgePairingCode(code: string): WorkspaceContext {
  const parts = code.trim().split(".");
  if (parts.length !== 2) {
    throw new Error("Invalid Figma Bridge pairing code.");
  }
  const [encodedPayload, signature] = parts;
  if (!encodedPayload || !signature) throw new Error("Invalid Figma Bridge pairing code.");
  const expected = sign(encodedPayload);
  if (!safeEqual(signature, expected)) {
    throw new Error("Invalid Figma Bridge pairing code.");
  }

  let payload: PairingPayload;
  try {
    payload = JSON.parse(decode(encodedPayload)) as PairingPayload;
  } catch {
    throw new Error("Invalid Figma Bridge pairing code.");
  }

  if (payload.version !== PAIRING_VERSION) {
    throw new Error("Unsupported Figma Bridge pairing code.");
  }
  if (Date.parse(payload.expiresAt) <= Date.now()) {
    throw new Error("Expired Figma Bridge pairing code.");
  }
  if (!isWorkspaceRole(payload.role) || !isAuthSource(payload.source)) {
    throw new Error("Invalid Figma Bridge pairing code.");
  }
  return {
    userId: payload.userId,
    organizationId: payload.organizationId,
    workspaceId: payload.workspaceId,
    role: payload.role,
    source: payload.source,
  };
}

function sign(payload: string) {
  return createHmac("sha256", getPairingSecret()).update(payload).digest("base64url");
}

function getPairingSecret() {
  const secret =
    process.env.FIGMA_BRIDGE_PAIRING_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.SUPABASE_JWT_SECRET ||
    process.env.DATABASE_URL;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("FIGMA_BRIDGE_PAIRING_SECRET is required in production.");
  }
  return "rozetta-dev-figma-bridge-secret";
}

function encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function isWorkspaceRole(value: unknown): value is WorkspaceContext["role"] {
  return value === "owner" || value === "admin" || value === "editor" || value === "viewer";
}

function isAuthSource(value: unknown): value is WorkspaceContext["source"] {
  return value === "supabase" || value === "dev" || value === "test";
}
