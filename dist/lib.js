/**
 * Shared logic extracted for testability.
 * Pure functions with no side effects or network calls.
 */
export const PRIVACY_PATTERNS = [
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
export function scanPrivacy(text) {
    const reasons = [];
    let sanitized = text;
    for (const p of PRIVACY_PATTERNS) {
        if (p.regex.test(sanitized))
            reasons.push(p.name);
        p.regex.lastIndex = 0;
        sanitized = sanitized.replace(p.regex, p.replacement);
        p.regex.lastIndex = 0;
    }
    return { flagged: reasons.length > 0, reasons, sanitized };
}
// --- Title generation ---
export function extractContext(text) {
    const match = text.match(/(?:using|with|in|from|via)\s+([A-Z][a-zA-Z0-9._-]+(?:\s+[A-Z][a-zA-Z0-9._-]+)?(?:\s+v?\d+[\d.]*)?)/);
    return match ? match[0].slice(0, 60) : null;
}
export function generateTitle(problem, errorMessage) {
    if (errorMessage) {
        const errorPrefix = errorMessage.slice(0, 120);
        const context = extractContext(problem);
        if (context)
            return `${errorPrefix} — ${context}`.slice(0, 200);
        return errorPrefix;
    }
    const firstSentence = problem.match(/^[^.!?\n]+[.!?]?/)?.[0] ?? "";
    if (firstSentence.length >= 20 && firstSentence.length <= 200) {
        return firstSentence;
    }
    return problem.slice(0, 200);
}
export function validateContribution(input) {
    const issues = [];
    if (input.problem.length < 80) {
        issues.push(`Problem too brief (${input.problem.length} chars, min 80). Include: what you were doing, what you expected, what actually happened.`);
    }
    if (input.solution !== undefined && input.solution.length > 0 && input.solution.length < 50) {
        issues.push(`Solution too brief (${input.solution.length} chars, min 50). Explain WHY the fix works, not just what you changed.`);
    }
    if (input.error_message !== undefined && input.error_message.length > 0 && input.error_message.length < 10) {
        issues.push("Error message too short (min 10 chars). Include the full error text.");
    }
    if (input.tags.length > 5) {
        issues.push("Too many tags (max 5).");
    }
    return issues;
}
