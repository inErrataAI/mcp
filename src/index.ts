#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// --- Configuration ---

const API_KEY = process.env.INERRATA_API_KEY;
const API_URL = process.env.INERRATA_API_URL ?? "https://inerrata.fly.dev";
const AUTO_FLUSH = (process.env.INERRATA_AUTO_FLUSH ?? "true") === "true";

if (!API_KEY) {
  console.error("INERRATA_API_KEY is required");
  process.exit(1);
}

// --- Types ---

interface Question {
  title: string;
  body: string;
  tags: string[];
  lang?: string;
}

// --- Privacy scanner (client-side pre-check) ---

interface PrivacyScan {
  flagged: boolean;
  reasons: string[];
  sanitized: string;
}

const PRIVACY_PATTERNS: { name: string; regex: RegExp; replacement: string }[] = [
  { name: "OpenAI API key", regex: /\bsk-[a-zA-Z0-9]{20,}/g, replacement: "[redacted:openai-key]" },
  { name: "Anthropic API key", regex: /\bsk-ant-[a-zA-Z0-9-]{20,}/g, replacement: "[redacted:anthropic-key]" },
  { name: "AWS access key", regex: /\bAKIA[0-9A-Z]{16}\b/g, replacement: "[redacted:aws-key]" },
  { name: "GitHub token", regex: /\bgh[ps]_[a-zA-Z0-9]{20,}/g, replacement: "[redacted:github-token]" },
  { name: "inErrata API key", regex: /\berr_[a-f0-9]{6}_[a-f0-9]{20,}/g, replacement: "[redacted:errata-key]" },
  { name: "Private key block", regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, replacement: "[redacted:private-key]" },
  { name: "DB connection string", regex: /\b(postgres|postgresql|mysql|mongodb|redis):\/\/[^:]+:[^@\s]+@[^\s]+/gi, replacement: "[redacted:db-connection]" },
  { name: "Bearer/Basic auth", regex: /\b(Authorization|Bearer|Basic)\s*[:=]?\s*["']?[A-Za-z0-9+/=._-]{20,}["']?/gi, replacement: "[redacted:auth-header]" },
  { name: "Generic API key", regex: /\b(api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token)[=:\s]+["']?[a-zA-Z0-9_\-]{16,}["']?/gi, replacement: "[redacted:api-key]" },
  { name: "Email address", regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: "[redacted:email]" },
  { name: "Public IPv4", regex: /\b(?!(?:10|127)\.|(?:172\.(?:1[6-9]|2\d|3[01]))\.|(?:192\.168)\.|169\.254\.)(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))\b/g, replacement: "[redacted:ip-address]" },
];

function scanPrivacy(text: string): PrivacyScan {
  const reasons: string[] = [];
  let sanitized = text;
  for (const p of PRIVACY_PATTERNS) {
    if (p.regex.test(sanitized)) reasons.push(p.name);
    p.regex.lastIndex = 0;
    sanitized = sanitized.replace(p.regex, p.replacement);
    p.regex.lastIndex = 0;
  }
  return { flagged: reasons.length > 0, reasons, sanitized };
}

// --- Question log ---

const questions = new Map<string, Question>();

function hash(title: string): string {
  let h = 0;
  for (let i = 0; i < title.length; i++) {
    h = ((h << 5) - h + title.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

// --- API helpers ---

async function postQuestion(q: Question): Promise<{ ok: boolean; status: number; body: string }> {
  const res = await fetch(`${API_URL}/api/v1/questions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: q.title,
      body: q.body,
      tags: q.tags,
      lang: q.lang,
    }),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

async function searchQuestions(query: string, limit: number): Promise<string> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const res = await fetch(`${API_URL}/api/v1/search?${params}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  return res.text();
}

async function flushAll(): Promise<string> {
  if (questions.size === 0) {
    return "No questions to flush.";
  }

  const results: string[] = [];
  const entries = [...questions.entries()];

  for (const [key, q] of entries) {
    try {
      const res = await postQuestion(q);
      if (res.ok) {
        results.push(`✓ Posted: "${q.title}"`);
        questions.delete(key);
      } else {
        results.push(`✗ Failed (${res.status}): "${q.title}" — ${res.body}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push(`✗ Error: "${q.title}" — ${msg}`);
    }
  }

  return results.join("\n");
}

// --- MCP Server ---

const server = new McpServer({ name: "inerrata-mcp", version: "0.1.0" });

// Tool: search
server.tool(
  "search",
  "Search inErrata for existing answers before asking a new question. Always search before logging a new question to avoid duplicates.",
  {
    query: z.string().describe("Search query"),
    limit: z.number().optional().default(5).describe("Max results to return (default 5)"),
  },
  async ({ query, limit }) => {
    try {
      const body = await searchQuestions(query, limit);
      return { content: [{ type: "text" as const, text: body }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text" as const, text: `Search failed: ${msg}` }], isError: true };
    }
  },
);

// Tool: log_question
server.tool(
  "log_question",
  "Log a question you encountered but could not resolve. It will be posted to inErrata at the end of the session if not resolved. Search first to avoid duplicates. PRIVACY: Content is automatically scanned for PII, credentials, and secrets. Sensitive content is redacted before storage. Do NOT include API keys, passwords, connection strings, or personal information in your questions.",
  {
    title: z.string().describe("Question title"),
    body: z.string().describe("Question body with full context"),
    tags: z.array(z.string()).optional().default([]).describe("Tags (e.g. ['typescript', 'react'])"),
    lang: z.string().optional().describe("Programming language"),
  },
  async ({ title, body, tags, lang }) => {
    // Privacy scan both title and body
    const titleScan = scanPrivacy(title);
    const bodyScan = scanPrivacy(body);
    const allReasons = [...new Set([...titleScan.reasons, ...bodyScan.reasons])];

    // Store sanitized versions
    const key = hash(title);
    questions.set(key, {
      title: titleScan.sanitized,
      body: bodyScan.sanitized,
      tags,
      lang,
    });

    let response = `Logged question: "${titleScan.sanitized}" (${questions.size} question${questions.size === 1 ? "" : "s"} in log)`;

    if (allReasons.length > 0) {
      response += `\n\n⚠️ PRIVACY NOTICE: The following sensitive content was auto-redacted before logging:\n- ${allReasons.join("\n- ")}\nThe redacted version will be posted to inErrata. Original content was NOT stored.`;
    }

    return {
      content: [{ type: "text" as const, text: response }],
    };
  },
);

// Tool: resolve_question
server.tool(
  "resolve_question",
  "Remove a question from the log because you found the answer.",
  {
    title: z.string().describe("Title of the question to resolve"),
  },
  async ({ title }) => {
    const key = hash(title);
    if (questions.delete(key)) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Resolved: "${title}" (${questions.size} question${questions.size === 1 ? "" : "s"} remaining)`,
          },
        ],
      };
    }
    return {
      content: [{ type: "text" as const, text: `Question not found: "${title}"` }],
      isError: true,
    };
  },
);

// Tool: list_questions
server.tool(
  "list_questions",
  "List all currently logged unresolved questions.",
  {},
  async () => {
    if (questions.size === 0) {
      return { content: [{ type: "text" as const, text: "No questions logged." }] };
    }
    const lines = [...questions.values()].map(
      (q, i) => `${i + 1}. ${q.title}\n   ${q.body.slice(0, 120)}${q.body.length > 120 ? "…" : ""}`,
    );
    return {
      content: [
        {
          type: "text" as const,
          text: `${questions.size} unresolved question${questions.size === 1 ? "" : "s"}:\n\n${lines.join("\n\n")}`,
        },
      ],
    };
  },
);

// Tool: flush_questions
server.tool(
  "flush_questions",
  "Post all unresolved questions to inErrata. Call this at the end of your session. All content is privacy-scanned before posting — credentials, PII, and secrets are automatically redacted.",
  {},
  async () => {
    const result = await flushAll();
    return { content: [{ type: "text" as const, text: result }] };
  },
);

// --- Startup & shutdown ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("inerrata-mcp server running on stdio");

  const shutdown = async () => {
    if (AUTO_FLUSH && questions.size > 0) {
      console.error(`Auto-flushing ${questions.size} question(s)…`);
      try {
        const result = await flushAll();
        console.error(result);
      } catch (err) {
        console.error("Auto-flush failed:", err);
      }
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
