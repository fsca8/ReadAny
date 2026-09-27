/**
 * Filtering for the sync diagnostics log panels (desktop + mobile). Pure, no
 * platform imports, so it stays unit-testable.
 *
 * Both apps mirror every console line into a daily log file (see
 * core/src/feedback/feedback-service.ts → installFeedbackLogCapture); the panels
 * read that file back and show only the lines that matter for sync work.
 */

/**
 * A log line belongs to the panel when it looks like sync work: the per-book
 * engine ([PerBookSync], [PBT] phase markers), the legacy/LAN engine, auto-sync,
 * the DB debug lines the apply path emits ([SyncDbg]), or a failure. Everything
 * else (reader, AI, UI) is filtered out.
 */
export const SYNC_LOG_KEYWORDS = [
  "[PerBookSync]",
  "[PBT]",
  "[SyncDbg]",
  "[AutoSync]",
  "[SimpleSync]",
  "[SyncStore]",
  "Failed to",
  "WebDAV",
  "index.json",
  "同步",
  "拉取",
  "上传",
];

/** Keep only the sync-related, non-empty lines of a log dump. */
export function filterSyncLines(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trimEnd();
    if (!trimmed) continue;
    if (SYNC_LOG_KEYWORDS.some((keyword) => trimmed.includes(keyword))) out.push(trimmed);
  }
  return out;
}
