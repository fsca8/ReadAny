/**
 * Sync diagnostics log panel (desktop, read-only).
 *
 * The app mirrors every console line into a daily log file under the app data dir
 * (see core/src/feedback/feedback-service.ts → installFeedbackLogCapture). This
 * panel surfaces the sync-related tail and copies the whole filtered text to the
 * clipboard so it can be shared without hunting for the file.
 *
 * Side effects: it reads the log file (collectLogs() flushes the pending buffer to
 * that same file first, which the periodic 3s flush does anyway) and writes to the
 * clipboard on demand. It never touches the database or the sync engine.
 */
import { collectLogs } from "@readany/core/feedback";
import { getPlatformService } from "@readany/core/services";
import { filterSyncLines } from "@readany/core/sync";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

/** How far back in the log files to look. */
const LOOKBACK_MS = 24 * 60 * 60 * 1000;
/** Log lines shown before the user expands the preview. */
const COLLAPSED_LINES = 12;

export function SyncDiagnosticsLog() {
  const { t } = useTranslation();
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const raw = await collectLogs({ sinceMs: LOOKBACK_MS });
      setLines(filterSyncLines(raw));
      setLoadedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLines([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleLines = useMemo(
    () => (expanded ? lines : lines.slice(-COLLAPSED_LINES)),
    [expanded, lines],
  );

  const copy = useCallback(async () => {
    try {
      await getPlatformService().copyToClipboard(lines.join("\n"));
      toast.success(
        t("settings.syncLogCopied", { defaultValue: "同步日志已复制，可直接粘贴分享" }),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }, [lines, t]);

  const canCopy = !loading && lines.length > 0;
  const emptyHint = error
    ? t("settings.syncLogReadFailed", {
        defaultValue: "读取日志失败：{{error}}",
        error,
      })
    : t("settings.syncLogEmpty", {
        defaultValue: "最近 24 小时没有同步相关日志（先同步一次再刷新）",
      });

  return (
    <section className="rounded-lg bg-muted/60 p-4">
      <h3 className="mb-2 text-sm font-medium text-foreground">
        {t("settings.syncDiagnostics", { defaultValue: "同步诊断日志（只读）" })}
      </h3>
      <p className="mb-3 text-xs text-muted-foreground">
        {t("settings.syncDiagnosticsDesc", {
          defaultValue:
            "读取 App 自身的日志文件（最近 24 小时），只挑同步相关行；仅显示和复制，不改动任何数据。",
        })}
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {t("settings.syncLogRefresh", { defaultValue: "刷新" })}
        </button>
        <button
          type="button"
          onClick={() => void copy()}
          disabled={!canCopy}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          {t("settings.syncLogCopy", { defaultValue: "复制全部" })}
        </button>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {lines.length === 0
          ? emptyHint
          : t("settings.syncLogCount", {
              defaultValue: "共 {{count}} 行，当前显示最后 {{shown}} 行",
              count: lines.length,
              shown: visibleLines.length,
            })}
      </p>

      {visibleLines.length > 0 && (
        <>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-background p-2 font-mono text-[10px] leading-4 text-foreground">
            {visibleLines.join("\n")}
          </pre>
          {lines.length > COLLAPSED_LINES && (
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="mt-2 text-xs font-medium text-primary hover:underline"
            >
              {expanded
                ? t("settings.syncLogCollapse", { defaultValue: "收起" })
                : t("settings.syncLogExpandAll", {
                    defaultValue: "展开全部 {{count}} 行",
                    count: lines.length,
                  })}
            </button>
          )}
        </>
      )}

      {loadedAt !== null && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t("settings.syncLogLoadedAt", {
            defaultValue: "读取时间：{{time}}",
            time: new Date(loadedAt).toLocaleTimeString(),
          })}
        </p>
      )}
    </section>
  );
}
