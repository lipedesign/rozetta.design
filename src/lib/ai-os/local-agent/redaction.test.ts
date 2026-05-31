import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { redactSecrets, truncateForLog } from "./redaction";

describe("redactSecrets", () => {
  it("strips bearer tokens", () => {
    const input = "Authorization: Bearer abc123def456";
    const out = redactSecrets(input);
    expect(out).not.toContain("abc123def456");
    expect(out).toContain("Bearer [REDACTED]");
  });

  it("strips sk-* style API keys", () => {
    const input = "key=sk-AbCd1234ZZZZ another line";
    const out = redactSecrets(input);
    expect(out).not.toContain("sk-AbCd1234ZZZZ");
    expect(out).toContain("[REDACTED]");
  });

  it("strips sk-ant-* anthropic-style keys", () => {
    const input = "x=sk-ant-api03-AbCdEfGhIj-12345";
    const out = redactSecrets(input);
    expect(out).not.toContain("sk-ant-api03-AbCdEfGhIj-12345");
  });

  it("strips env var lines like OPENAI_API_KEY=...", () => {
    const input = ["foo=bar", "OPENAI_API_KEY=secret-value-here", "tail"].join("\n");
    const out = redactSecrets(input);
    expect(out).not.toContain("secret-value-here");
    expect(out).toContain("[REDACTED]");
    expect(out).toContain("foo=bar");
  });

  it("strips *_TOKEN= and *_SECRET= patterns", () => {
    const input = ["GITHUB_TOKEN=ghp_abc", "MY_SECRET=hush"].join("\n");
    const out = redactSecrets(input);
    expect(out).not.toContain("hush");
    // ghp_ key form is also matched explicitly when long enough; the *_TOKEN line
    // pattern still redacts the value either way.
    expect(out).toContain("[REDACTED]");
  });

  it("returns empty input unchanged", () => {
    expect(redactSecrets("")).toBe("");
  });
});

describe("truncateForLog", () => {
  it("returns input unchanged when under limit", () => {
    expect(truncateForLog("short", 100)).toBe("short");
  });

  it("truncates from the end and appends marker", () => {
    const input = "a".repeat(100);
    const out = truncateForLog(input, 20);
    expect(out.endsWith("… [truncated]")).toBe(true);
    expect(Buffer.byteLength(out, "utf8")).toBeLessThanOrEqual(20);
    expect(out.startsWith("a")).toBe(true);
  });

  it("preserves the beginning of the input", () => {
    const head = "START_HERE";
    const input = head + "x".repeat(1000);
    const out = truncateForLog(input, 64);
    expect(out.startsWith(head)).toBe(true);
  });

  it("handles empty input", () => {
    expect(truncateForLog("", 1024)).toBe("");
  });
});
