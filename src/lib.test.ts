import { describe, it, expect } from "vitest";
import {
  scanPrivacy,
  extractContext,
  generateTitle,
  validateContribution,
  type ContributeInput,
} from "./lib.js";

// =====================================================================
// scanPrivacy
// =====================================================================

describe("scanPrivacy", () => {
  it("passes clean text through unchanged", () => {
    const result = scanPrivacy("This is a normal error message about TypeScript.");
    expect(result.flagged).toBe(false);
    expect(result.reasons).toHaveLength(0);
    expect(result.sanitized).toBe("This is a normal error message about TypeScript.");
  });

  it("redacts OpenAI API keys", () => {
    const result = scanPrivacy("My key is sk-abcdefghijklmnopqrstuvwxyz123456");
    expect(result.flagged).toBe(true);
    expect(result.reasons).toContain("OpenAI API key");
    expect(result.sanitized).toContain("[redacted:openai-key]");
    expect(result.sanitized).not.toContain("sk-abcdef");
  });

  it("redacts Anthropic API keys", () => {
    const result = scanPrivacy("Using sk-ant-api03-abcdefghijklmnopqrstuvwxyz");
    expect(result.flagged).toBe(true);
    expect(result.reasons).toContain("Anthropic API key");
  });

  it("redacts GitHub tokens", () => {
    const result = scanPrivacy("Token: ghp_1234567890abcdefghijklmnopqr");
    expect(result.flagged).toBe(true);
    expect(result.reasons).toContain("GitHub token");
  });

  it("redacts AWS access keys", () => {
    const result = scanPrivacy("AWS key: AKIAIOSFODNN7EXAMPLE");
    expect(result.flagged).toBe(true);
    expect(result.reasons).toContain("AWS access key");
  });

  it("redacts inErrata API keys", () => {
    const result = scanPrivacy("Key: err_a1b2c3_abcdef0123456789abcdef01");
    expect(result.flagged).toBe(true);
    expect(result.reasons).toContain("inErrata API key");
  });

  it("redacts private key blocks", () => {
    const result = scanPrivacy("-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----");
    expect(result.flagged).toBe(true);
    expect(result.reasons).toContain("Private key block");
  });

  it("redacts database connection strings", () => {
    const result = scanPrivacy("DSN: postgres://user:pass@host.com:5432/db");
    expect(result.flagged).toBe(true);
    expect(result.reasons).toContain("DB connection string");
  });

  it("redacts email addresses", () => {
    const result = scanPrivacy("Contact me at user@example.com for details");
    expect(result.flagged).toBe(true);
    expect(result.reasons).toContain("Email address");
    expect(result.sanitized).toContain("[redacted:email]");
    expect(result.sanitized).not.toContain("user@example.com");
  });

  it("redacts public IPv4 addresses", () => {
    const result = scanPrivacy("Server at 203.0.113.50 is down");
    expect(result.flagged).toBe(true);
    expect(result.reasons).toContain("Public IPv4");
  });

  it("does NOT redact private IPv4 addresses", () => {
    const result = scanPrivacy("Connect to 192.168.1.100 or 10.0.0.1 or 127.0.0.1");
    const ipRedacted = result.reasons.includes("Public IPv4");
    expect(ipRedacted).toBe(false);
  });

  it("redacts generic API key patterns", () => {
    const result = scanPrivacy('api_key = "abcdef1234567890abcdef"');
    expect(result.flagged).toBe(true);
    expect(result.reasons).toContain("Generic API key");
  });

  it("handles multiple PII types in one string", () => {
    const result = scanPrivacy("Key sk-abcdefghijklmnopqrstuvwxyz123456 from user@example.com at 203.0.113.50");
    expect(result.flagged).toBe(true);
    expect(result.reasons.length).toBeGreaterThanOrEqual(3);
    expect(result.sanitized).not.toContain("sk-abcdef");
    expect(result.sanitized).not.toContain("user@example.com");
    expect(result.sanitized).not.toContain("203.0.113.50");
  });

  it("handles empty string", () => {
    const result = scanPrivacy("");
    expect(result.flagged).toBe(false);
    expect(result.sanitized).toBe("");
  });

  it("handles unicode text without false positives", () => {
    const result = scanPrivacy("エラーが発生しました。接続に失敗しました。🦋");
    expect(result.flagged).toBe(false);
    expect(result.sanitized).toBe("エラーが発生しました。接続に失敗しました。🦋");
  });

  it("is idempotent — scanning twice gives same result", () => {
    const text = "Key sk-abcdefghijklmnopqrstuvwxyz123456 leaked";
    const first = scanPrivacy(text);
    const second = scanPrivacy(first.sanitized);
    expect(second.sanitized).toBe(first.sanitized);
  });
});

// =====================================================================
// extractContext
// =====================================================================

describe("extractContext", () => {
  it("extracts 'using Library' pattern", () => {
    expect(extractContext("I was using Drizzle ORM to query the database")).toBe("using Drizzle ORM");
  });

  it("extracts 'with Library version' pattern", () => {
    expect(extractContext("Running with React v19.0.1 in production")).toBe("with React v19.0.1");
  });

  it("extracts 'in Framework' pattern", () => {
    expect(extractContext("This happens in PostgreSQL when using joins")).toBe("in PostgreSQL");
  });

  it("extracts 'from Package' pattern", () => {
    expect(extractContext("Error from Express.js middleware")).toBe("from Express.js");
  });

  it("extracts 'via Tool' pattern", () => {
    expect(extractContext("Deployed via Cloudflare Workers")).toBe("via Cloudflare Workers");
  });

  it("returns null when no context found", () => {
    expect(extractContext("something broke and i don't know why")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractContext("")).toBeNull();
  });

  it("truncates very long context to 60 chars", () => {
    const result = extractContext("using SomeVeryLongLibraryNameThatGoesOnAndOnForever AndAnotherPartThatIsAlsoLong v99.99.99");
    expect(result).not.toBeNull();
    expect(result!.length).toBeLessThanOrEqual(60);
  });

  it("requires uppercase start for library name", () => {
    // lowercase library names should not match
    expect(extractContext("using lodash to sort arrays")).toBeNull();
  });
});

// =====================================================================
// generateTitle
// =====================================================================

describe("generateTitle", () => {
  it("uses error_message as title when provided", () => {
    const title = generateTitle(
      "I was trying to connect to the database and it failed",
      "TypeError: Cannot read property 'id' of undefined",
    );
    expect(title).toContain("TypeError: Cannot read property 'id' of undefined");
  });

  it("appends context from problem when error_message provided", () => {
    const title = generateTitle(
      "I was using Drizzle ORM to query the database and got this error when running a join operation",
      "TypeError: Cannot read property 'id' of undefined",
    );
    expect(title).toContain("TypeError:");
    expect(title).toContain("using Drizzle ORM");
  });

  it("truncates long error_message to 120 chars", () => {
    const longError = "E".repeat(200);
    const title = generateTitle("simple problem description here that is long enough", longError);
    expect(title.length).toBeLessThanOrEqual(200);
  });

  it("uses first sentence when no error_message", () => {
    const title = generateTitle(
      "Connection pooling fails silently when max connections exceeded. The pool just hangs forever.",
    );
    expect(title).toBe("Connection pooling fails silently when max connections exceeded.");
  });

  it("truncates problem to 200 chars when first sentence too short", () => {
    const title = generateTitle("Short sentence. " + "x".repeat(300));
    expect(title.length).toBe(200);
  });

  it("truncates problem to 200 chars when no sentence boundary", () => {
    const title = generateTitle("x".repeat(300));
    expect(title.length).toBe(200);
  });

  it("uses first sentence when it ends with question mark", () => {
    const title = generateTitle(
      "Why does pgvector return wrong results after vacuuming? I noticed the cosine similarity scores changed.");
    expect(title).toBe("Why does pgvector return wrong results after vacuuming?");
  });

  it("handles empty error_message by falling through", () => {
    // If error_message is provided but empty, generateTitle uses it (empty prefix)
    // This tests the actual behavior — the validation layer should catch empty strings
    const title = generateTitle(
      "The connection drops after exactly 30 seconds of idle time in the PostgreSQL connection pool",
      "",
    );
    // Empty errorMessage is falsy, falls through to first-sentence logic
    expect(title).toBe("The connection drops after exactly 30 seconds of idle time in the PostgreSQL connection pool");
  });

  it("handles problem with only newlines", () => {
    const title = generateTitle("\n\n\n");
    // No meaningful first sentence, truncates
    expect(title).toBeDefined();
  });
});

// =====================================================================
// validateContribution
// =====================================================================

describe("validateContribution", () => {
  const validInput: ContributeInput = {
    problem: "x".repeat(80),
    tags: ["typescript"],
  };

  it("passes valid input with no solution", () => {
    expect(validateContribution(validInput)).toHaveLength(0);
  });

  it("passes valid input with solution", () => {
    expect(validateContribution({ ...validInput, solution: "x".repeat(50) })).toHaveLength(0);
  });

  it("rejects problem under 80 chars", () => {
    const issues = validateContribution({ ...validInput, problem: "x".repeat(79) });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("Problem too brief");
    expect(issues[0]).toContain("79 chars");
  });

  it("accepts problem at exactly 80 chars", () => {
    expect(validateContribution({ ...validInput, problem: "x".repeat(80) })).toHaveLength(0);
  });

  it("rejects solution under 50 chars when non-empty", () => {
    const issues = validateContribution({ ...validInput, solution: "x".repeat(49) });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("Solution too brief");
    expect(issues[0]).toContain("49 chars");
  });

  it("accepts solution at exactly 50 chars", () => {
    expect(validateContribution({ ...validInput, solution: "x".repeat(50) })).toHaveLength(0);
  });

  it("accepts undefined solution (no solution branch)", () => {
    expect(validateContribution({ ...validInput, solution: undefined })).toHaveLength(0);
  });

  it("accepts empty string solution (treated as no solution)", () => {
    expect(validateContribution({ ...validInput, solution: "" })).toHaveLength(0);
  });

  it("rejects error_message under 10 chars when non-empty", () => {
    const issues = validateContribution({ ...validInput, error_message: "Error" });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("Error message too short");
  });

  it("accepts error_message at exactly 10 chars", () => {
    expect(validateContribution({ ...validInput, error_message: "x".repeat(10) })).toHaveLength(0);
  });

  it("accepts undefined error_message", () => {
    expect(validateContribution({ ...validInput, error_message: undefined })).toHaveLength(0);
  });

  it("accepts empty string error_message", () => {
    expect(validateContribution({ ...validInput, error_message: "" })).toHaveLength(0);
  });

  it("rejects more than 5 tags", () => {
    const issues = validateContribution({ ...validInput, tags: ["a", "b", "c", "d", "e", "f"] });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("Too many tags");
  });

  it("accepts exactly 5 tags", () => {
    expect(validateContribution({ ...validInput, tags: ["a", "b", "c", "d", "e"] })).toHaveLength(0);
  });

  it("accepts empty tags array", () => {
    expect(validateContribution({ ...validInput, tags: [] })).toHaveLength(0);
  });

  it("reports multiple issues at once", () => {
    const issues = validateContribution({
      problem: "short",
      solution: "tiny",
      error_message: "E",
      tags: ["a", "b", "c", "d", "e", "f"],
    });
    expect(issues.length).toBe(4);
  });
});
