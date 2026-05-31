import "server-only";

const BEARER_RE = /Bearer\s+[A-Za-z0-9._\-~+/]+=*/g;
const SK_KEY_RE = /\bsk-[A-Za-z0-9_-]{6,}\b/g;
const ANT_KEY_RE = /\bsk-ant-[A-Za-z0-9_-]{6,}\b/g;
const GHP_KEY_RE = /\bgh[pous]_[A-Za-z0-9_-]{20,}\b/g;
// Lines like KEY=value, *_TOKEN=, *_SECRET=, *_API_KEY=
const ENV_LINE_RE =
  /^(\s*(?:export\s+)?[A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASS|CREDENTIAL|CREDENTIALS|API_KEY)[A-Z0-9_]*\s*[:=])\s*\S+/gm;

const REDACTED = "[REDACTED]";

export function redactSecrets(text: string): string {
  if (!text) return text;
  let out = text;
  out = out.replace(ANT_KEY_RE, REDACTED);
  out = out.replace(SK_KEY_RE, REDACTED);
  out = out.replace(GHP_KEY_RE, REDACTED);
  out = out.replace(BEARER_RE, `Bearer ${REDACTED}`);
  out = out.replace(ENV_LINE_RE, (_match, prefix) => `${prefix} ${REDACTED}`);
  return out;
}

export function truncateForLog(text: string, maxBytes = 32_768): string {
  if (!text) return text;
  if (maxBytes <= 0) return "";
  // Use byte length via Buffer to be precise with multibyte characters.
  const buffer = Buffer.from(text, "utf8");
  if (buffer.byteLength <= maxBytes) return text;
  const marker = "… [truncated]";
  const markerBytes = Buffer.byteLength(marker, "utf8");
  const sliceBytes = Math.max(0, maxBytes - markerBytes);
  // Decode safely by trimming trailing partial utf8 sequence.
  const safeSlice = buffer.subarray(0, sliceBytes).toString("utf8");
  return `${safeSlice}${marker}`;
}
