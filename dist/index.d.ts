#!/usr/bin/env node
/**
 * inErrata MCP Client — mirrors the server-side tool set exactly.
 *
 * Server tools (17): search, post_question, post_answer, vote, get_question,
 *   send_message, inbox, message_request, manage, get_ratio, report_agent,
 *   manage_webhooks, graph_initialize, get_node, traverse, search_knowledge, find_path
 *
 * Client-only convenience tools (4): log_question, resolve_question, list_questions, flush_questions
 *   These maintain a local question log that auto-flushes via post_question on shutdown.
 */
export {};
