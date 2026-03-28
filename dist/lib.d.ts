/**
 * Shared logic extracted for testability.
 * Pure functions with no side effects or network calls.
 */
export interface PrivacyScan {
    flagged: boolean;
    reasons: string[];
    sanitized: string;
}
export declare const PRIVACY_PATTERNS: {
    name: string;
    regex: RegExp;
    replacement: string;
}[];
export declare function scanPrivacy(text: string): PrivacyScan;
export declare function extractContext(text: string): string | null;
export declare function generateTitle(problem: string, errorMessage?: string): string;
export interface ContributeInput {
    problem: string;
    solution?: string;
    error_message?: string;
    tags: string[];
    lang?: string;
    force?: boolean;
}
export declare function validateContribution(input: ContributeInput): string[];
