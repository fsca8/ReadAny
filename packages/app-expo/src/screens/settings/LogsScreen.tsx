/**
 * Logs screen (mobile, read-only).
 *
 * The app mirrors every console line into a daily log file under the app data dir
 * (see core/src/feedback/feedback-service.ts → installFeedbackLogCapture). On
 * Android that file lives inside the app sandbox, so the app is the only place it
 * can be read. This screen shows those files **verbatim** — every line, every
 * level, no keyword filtering, no truncation — and lets you pick any of the log
 * files still on disk.
 *
 * Side effects: reading flushes the in-memory log buffer to its file first (the
 * periodic 3s flush does that anyway) and the copy button writes to the clipboard.
 * It never touches the database or the sync engine.
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
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  type ThemeColors,
  fontSize,
  fontWeight,
  radius,
  spacing,
  useColors,
} from "../../styles/theme";
import { SettingsHeader } from "./SettingsHeader";

/** Above this size the raw text is still shown in full, but we warn first. */
const LARGE_FILE_BYTES = 5 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function LogsScreen() {
  const colors = useColors();
  const s = makeStyles(colors);
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
  const visibleLineCount = visibleLines.length;
  const byteSize = useMemo(() => new TextEncoder().encode(content).byteLength, [content]);

  const copy = useCallback(async () => {
    try {
      await getPlatformService().copyToClipboard(visibleText);
      Alert.alert(
        t("common.success", "成功"),
        t("settings.syncLogCopied", { defaultValue: "日志已复制，可直接粘贴分享" }),
      );
    } catch (err) {
      Alert.alert(t("common.error", "错误"), err instanceof Error ? err.message : String(err));
    }
  }, [visibleText, t]);

  const canCopy = !loading && visibleText.length > 0;

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]} edges={["top"]}>
      <SettingsHeader
        title={t("settings.logs", { defaultValue: "日志" })}
        subtitle={
          files.length > 0
            ? t("settings.logsFileCount", {
                defaultValue: "{{count}} 个日志文件",
                count: files.length,
              })
            : undefined
        }
      />
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.desc}>
          {t("settings.logsDesc", {
            defaultValue:
              "直接查看 App 日志文件原文：全部级别、全部行，不筛选也不截断。只读，不改动任何数据。",
          })}
        </Text>
        {logDir ? <Text style={s.dir}>{logDir}</Text> : null}

        <View style={s.btnRow}>
          <TouchableOpacity
            style={[s.primaryBtn, loading && s.btnDisabled]}
            onPress={() => void load(selected)}
            disabled={loading}
            activeOpacity={0.7}
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Text style={s.primaryBtnText}>
                {t("settings.syncLogRefresh", { defaultValue: "刷新" })}
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.secondaryBtn, !canCopy && s.btnDisabled]}
            onPress={() => void copy()}
            disabled={!canCopy}
            activeOpacity={0.7}
          >
            <Text style={s.secondaryBtnText}>
              {t("settings.syncLogCopy", { defaultValue: "复制全部" })}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.chip, newestFirst && s.chipActive]}
            onPress={() => setNewestFirst((prev) => !prev)}
            activeOpacity={0.7}
          >
            <Text style={[s.chipText, newestFirst && s.chipTextActive]}>
              {t("settings.logsNewestFirst", { defaultValue: "最新在上" })}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.chip, onlySync && s.chipActive]}
            onPress={() => setOnlySync((prev) => !prev)}
            activeOpacity={0.7}
          >
            <Text style={[s.chipText, onlySync && s.chipTextActive]}>
              {t("settings.logsOnlySync", { defaultValue: "只看同步相关" })}
            </Text>
          </TouchableOpacity>
        </View>

        {files.length > 0 ? (
          <View style={s.fileRow}>
            {files.map((file) => {
              const active = file.name === selected;
              return (
                <TouchableOpacity
                  key={file.name}
                  style={[s.fileChip, active && s.fileChipActive]}
                  onPress={() => void selectFile(file.name)}
                  activeOpacity={0.7}
                >
                  <Text style={[s.fileChipText, active && s.fileChipTextActive]}>
                    {file.name}
                    {file.isToday ? ` · ${t("settings.logsToday", { defaultValue: "今天" })}` : ""}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}

        <Text style={s.status}>
          {error
            ? t("settings.logsLoadFailed", { defaultValue: "读取日志失败：{{error}}", error })
            : selected === null
              ? t("settings.logsEmpty", { defaultValue: "日志目录里还没有日志文件" })
              : t("settings.logsCount", {
                  defaultValue: "{{name}} · 共 {{count}} 行 · {{size}}",
                  name: selected,
                  count: visibleLineCount,
                  size: formatBytes(byteSize),
                })}
        </Text>

        {byteSize > LARGE_FILE_BYTES ? (
          <Text style={s.warn}>
            {t("settings.logsLargeFile", {
              defaultValue: "文件较大（{{size}}），渲染可能变慢。",
              size: formatBytes(byteSize),
            })}
          </Text>
        ) : null}

        {visibleText.length > 0 ? <Text style={s.logText}>{visibleText}</Text> : null}

        {loadedAt !== null ? (
          <Text style={s.status}>
            {t("settings.syncLogLoadedAt", {
              defaultValue: "读取时间：{{time}}",
              time: new Date(loadedAt).toLocaleTimeString(),
            })}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1 },
    content: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xl * 2,
      gap: spacing.sm,
    },
    desc: {
      fontSize: fontSize.sm,
      color: colors.mutedForeground,
      lineHeight: 20,
    },
    dir: {
      fontSize: fontSize.xs,
      color: colors.mutedForeground,
      fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    },
    btnRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      flexWrap: "wrap",
      marginTop: spacing.xs,
    },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      minWidth: 72,
      alignItems: "center",
    },
    primaryBtnText: {
      color: colors.primaryForeground,
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
    },
    secondaryBtn: {
      backgroundColor: colors.muted,
      borderRadius: radius.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    secondaryBtnText: {
      color: colors.foreground,
      fontSize: fontSize.sm,
      fontWeight: fontWeight.medium,
    },
    btnDisabled: { opacity: 0.5 },
    chip: {
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    chipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    chipText: {
      fontSize: fontSize.xs,
      color: colors.mutedForeground,
    },
    chipTextActive: { color: colors.primaryForeground, fontWeight: fontWeight.medium },
    fileRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.xs,
    },
    fileChip: {
      backgroundColor: colors.muted,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
    },
    fileChipActive: {
      backgroundColor: colors.primary,
    },
    fileChipText: {
      fontSize: fontSize.xs,
      color: colors.mutedForeground,
      fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    },
    fileChipTextActive: { color: colors.primaryForeground },
    status: {
      fontSize: fontSize.xs,
      color: colors.mutedForeground,
      marginTop: spacing.xs,
    },
    warn: {
      fontSize: fontSize.xs,
      color: colors.amber,
    },
    logText: {
      marginTop: spacing.xs,
      padding: spacing.sm,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.card,
      color: colors.foreground,
      fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
      fontSize: 10,
      lineHeight: 14,
    },
  });
}
