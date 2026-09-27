/**
 * Logs page (desktop, read-only).
 *
 * The app mirrors every console line into a daily log file under the app data dir
 * (see core/src/feedback/feedback-service.ts → installFeedbackLogCapture). This
 * page shows those files **verbatim** — every line, every level, no keyword
 * filtering and no truncation — because the previous sync-only panel hid anything
 * that was not about sync.
 *
 * Side effects: reading flushes the in-memory log buffer to its file first (the
 * periodic 3s flush does that anyway) and the copy button writes to the
 * clipboard. It never touches the database or the sync engine.
 */
import {
  type LogFileEntry,
  getLogDirectoryPath,
  listLogFiles,
  logDisplayLines,
  readLogFile,
} from "@readany/core/feedback";
import { getPlatformService } from "@readany/core/services";
import { filterSyncLines } from "@readany/core/sync";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

/** Above this size the raw text is still shown in full, but we warn first. */
const LARGE_FILE_BYTES = 5 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function LogsSettings() {
  const { t } = useTranslation();
  const [files, setFiles] = useState<LogFileEntry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [logDir, setLogDir] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onlySync, setOnlySync] = useState(false);
  // Newest line on top by default: the tail of a growing log is what you look at,
  // and the file can be thousands of lines long.
  const [newestFirst, setNewestFirst] = useState(true);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);

  const load = useCallback(async (preferredName?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const list = await listLogFiles();
      setFiles(list);
      setLogDir(await getLogDirectoryPath());
      const target =
        (preferredName && list.some((file) => file.name === preferredName)
          ? preferredName
          : list[0]?.name) ?? null;
      setSelected(target);
      setContent(target ? await readLogFile(target) : "");
      setLoadedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setFiles([]);
      setContent("");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectFile = useCallback(async (name: string) => {
    setLoading(true);
    setError(null);
    try {
      setSelected(name);
      setContent(await readLogFile(name));
      setLoadedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setContent("");
    } finally {
      setLoading(false);
    }
  }, []);

  const lines = useMemo(() => logDisplayLines(content, { newestFirst }), [content, newestFirst]);
  const visibleLines = useMemo(
    () => (onlySync ? filterSyncLines(lines.join("\n")) : lines),
    [lines, onlySync],
  );
  const visibleText = useMemo(() => visibleLines.join("\n"), [visibleLines]);
  const byteSize = useMemo(() => new TextEncoder().encode(content).byteLength, [content]);

  const copy = useCallback(async () => {
    try {
      await getPlatformService().copyToClipboard(visibleText);
      toast.success(t("settings.syncLogCopied", { defaultValue: "日志已复制，可直接粘贴分享" }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }, [visibleText, t]);

  const canCopy = !loading && visibleText.length > 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-medium text-foreground">
          {t("settings.logs", { defaultValue: "日志" })}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("settings.logsDesc", {
            defaultValue:
              "直接查看 App 日志文件原文：全部级别、全部行，不筛选也不截断。只读，不改动任何数据。",
          })}
        </p>
        {logDir && (
          <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">{logDir}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void load(selected)}
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
        <label className="ml-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={newestFirst}
            onChange={(event) => setNewestFirst(event.target.checked)}
            className="h-3.5 w-3.5"
          />
          {t("settings.logsNewestFirst", { defaultValue: "最新在上" })}
        </label>
        <label className="ml-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={onlySync}
            onChange={(event) => setOnlySync(event.target.checked)}
            className="h-3.5 w-3.5"
          />
          {t("settings.logsOnlySync", { defaultValue: "只看同步相关" })}
        </label>
      </div>

      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {files.map((file) => (
            <button
              key={file.name}
              type="button"
              onClick={() => void selectFile(file.name)}
              className={
                file.name === selected
                  ? "rounded-md bg-primary/15 px-2 py-1 font-mono text-[11px] text-foreground ring-1 ring-primary/40"
                  : "rounded-md bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-muted/70"
              }
              title={file.date ?? file.name}
            >
              {file.name}
              {file.isToday ? ` · ${t("settings.logsToday", { defaultValue: "今天" })}` : ""}
            </button>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {error
          ? t("settings.logsLoadFailed", {
              defaultValue: "读取日志失败：{{error}}",
              error,
            })
          : selected === null
            ? t("settings.logsEmpty", { defaultValue: "日志目录里还没有日志文件" })
            : t("settings.logsCount", {
                defaultValue: "{{name}} · 共 {{count}} 行 · {{size}}",
                name: selected,
                count: visibleLines.length,
                size: formatBytes(byteSize),
              })}
      </p>

      {byteSize > LARGE_FILE_BYTES && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {t("settings.logsLargeFile", {
            defaultValue: "文件较大（{{size}}），渲染可能变慢。",
            size: formatBytes(byteSize),
          })}
        </p>
      )}

      {visibleText.length > 0 && (
        <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-background p-3 font-mono text-[10px] leading-4 text-foreground">
          {visibleText}
        </pre>
      )}

      {loadedAt !== null && (
        <p className="text-xs text-muted-foreground">
          {t("settings.syncLogLoadedAt", {
            defaultValue: "读取时间：{{time}}",
            time: new Date(loadedAt).toLocaleTimeString(),
          })}
        </p>
      )}
    </div>
  );
}
