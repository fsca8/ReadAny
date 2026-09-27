/**
 * Sync diagnostics log panel (mobile, read-only).
 *
 * The app already mirrors every console line into a daily log file under the app
 * data dir (see core/src/feedback/feedback-service.ts → installFeedbackLogCapture).
 * On Android that file lives inside the app sandbox, so the app itself is the only
 * place it can be read — this panel surfaces the sync-related tail and copies the
 * whole filtered text to the clipboard so it can be shared.
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
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { spacing, useColors } from "../../../styles/theme";
import { makeStyles } from "./sync-styles";

/** How far back in the log files to look. */
const LOOKBACK_MS = 24 * 60 * 60 * 1000;
/** Log lines shown before the user expands the preview. */
const COLLAPSED_LINES = 12;

export function SyncDiagnosticsLog() {
  const colors = useColors();
  const s = makeStyles(colors);
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
      Alert.alert(
        t("common.success", "成功"),
        t("settings.syncLogCopied", { defaultValue: "同步日志已复制，可直接粘贴分享" }),
      );
    } catch (err) {
      Alert.alert(t("common.error", "错误"), err instanceof Error ? err.message : String(err));
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
    <View style={[s.section, { marginTop: spacing.lg }]}>
      <Text style={s.sectionTitle}>
        {t("settings.syncDiagnostics", { defaultValue: "同步诊断日志（只读）" })}
      </Text>
      <View style={s.card}>
        <Text style={s.resetDesc}>
          {t("settings.syncDiagnosticsDesc", {
            defaultValue:
              "读取 App 自身的日志文件（最近 24 小时），只挑同步相关行；仅显示和复制，不改动任何数据。",
          })}
        </Text>

        <View style={s.btnRow}>
          <TouchableOpacity
            style={[s.uploadBtn, loading && s.btnDisabled]}
            onPress={() => void load()}
            disabled={loading}
            activeOpacity={0.7}
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Text style={s.uploadBtnText}>
                {t("settings.syncLogRefresh", { defaultValue: "刷新" })}
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.downloadBtn, !canCopy && s.btnDisabled]}
            onPress={() => void copy()}
            disabled={!canCopy}
            activeOpacity={0.7}
          >
            <Text style={s.downloadBtnText}>
              {t("settings.syncLogCopy", { defaultValue: "复制全部" })}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={s.resultText}>
          {lines.length === 0
            ? emptyHint
            : t("settings.syncLogCount", {
                defaultValue: "共 {{count}} 行，当前显示最后 {{shown}} 行",
                count: lines.length,
                shown: visibleLines.length,
              })}
        </Text>

        {visibleLines.length > 0 && (
          <>
            <View style={local.box}>
              <Text style={local.logText} selectable>
                {visibleLines.join("\n")}
              </Text>
            </View>
            {lines.length > COLLAPSED_LINES && (
              <TouchableOpacity onPress={() => setExpanded((prev) => !prev)} activeOpacity={0.7}>
                <Text style={local.link}>
                  {expanded
                    ? t("settings.syncLogCollapse", { defaultValue: "收起" })
                    : t("settings.syncLogExpandAll", {
                        defaultValue: "展开全部 {{count}} 行",
                        count: lines.length,
                      })}
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {loadedAt !== null && (
          <Text style={s.resetDesc}>
            {t("settings.syncLogLoadedAt", {
              defaultValue: "读取时间：{{time}}",
              time: new Date(loadedAt).toLocaleTimeString(),
            })}
          </Text>
        )}
      </View>
    </View>
  );
}

const local = StyleSheet.create({
  box: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(127,127,127,0.35)",
    backgroundColor: "rgba(127,127,127,0.08)",
  },
  logText: {
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 10,
    lineHeight: 14,
  },
  link: {
    marginTop: spacing.sm,
    fontSize: 12,
    fontWeight: "600",
    color: "#3b82f6",
  },
});
