import { CheckIcon, ChevronDownIcon, CopyIcon } from "@/components/ui/Icon";
import { fontSize as fs, radius, useColors, withOpacity } from "@/styles/theme";
import type { ThemeColors } from "@/styles/theme";
import type { CitationPart, MessageV2, QuotePart, TextPart } from "@readany/core/types/message";
import * as Clipboard from "expo-clipboard";
/**
 * MessageList — FlatList message renderer matching app-mobile MessageList.
 * Scroll-to-bottom button, streaming gap indicator.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FlatList,
  Keyboard,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { PartRenderer } from "./PartRenderer";
import { StreamingIndicator } from "./StreamingIndicator";

interface MessageListProps {
  messages: MessageV2[];
  isStreaming?: boolean;
  currentStep?: "thinking" | "tool_calling" | "responding" | "idle";
  onCitationClick?: (citation: CitationPart) => void;
}

const BOTTOM_THRESHOLD = 80;

function sortCitationsByIndex(citations: CitationPart[]): CitationPart[] {
  return citations
    .map((citation, order) => ({ citation, order }))
    .sort((a, b) => {
      const aIndex = a.citation.citationIndex;
      const bIndex = b.citation.citationIndex;
      if (typeof aIndex === "number" && typeof bIndex === "number") return aIndex - bIndex;
      if (typeof aIndex === "number") return -1;
      if (typeof bIndex === "number") return 1;
      return a.order - b.order;
    })
    .map(({ citation }) => citation);
}

export function MessageList({
  messages,
  isStreaming,
  currentStep,
  onCitationClick,
}: MessageListProps) {
  const { t } = useTranslation();
  const colors = useColors();
  const s = makeStyles(colors);
  const flatListRef = useRef<FlatList>(null);
  const isAtBottomRef = useRef(true);
  /**
   * Whether the list should keep following the newest message.
   *
   * A FlatList lays out incrementally (initialNumToRender + batched rendering) and
   * the tail cell of a tall last message is measured only once those batches
   * finish, so a single "scroll to bottom" at mount time lands mid-history —
   * measured on device: content 5000px → 7676px while the list sat at 6134 of
   * 6939, i.e. 805px short, with no further event to correct it. Keeping the
   * follow flag on lets the settle check keep pinning until the bottom holds.
   *
   * Cleared only by a real user drag (onScrollBeginDrag); position-based checks
   * flip mid-layout while the tail is still growing, which is exactly when we must
   * keep following. Resumed when the user returns to the bottom or taps 滚动到底部.
   */
  const autoFollowRef = useRef(true);
  const [showScrollDown, setShowScrollDown] = useState(false);

  /**
   * Latest scroll metrics reported by the list. Used to compute the exact bottom
   * offset ourselves (target = content − view) and to know how far we still are.
   */
  const metricsRef = useRef({ off: 0, content: 0, layout: 0 });

  // Settle-check bookkeeping (offset when the last pin was issued, and how many
  // consecutive pins changed nothing).
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const lastPinOffRef = useRef(0);
  const pinToBottomRef = useRef<(source: string) => void>(() => {});

  /**
   * A pin can land short: the content size we just saw may not have reached the
   * native scroll view yet, and the tail cell of a tall last message is measured
   * only once the render batches finish. Telemetry from the failing case: content
   * grew 5000 → 7676 while the list sat at 6134 of 6939 — 805px short, with no
   * further event to correct it. So re-check shortly after and pin again until the
   * bottom holds; stop when a pin changes nothing (a list that simply cannot go
   * further must not be hammered — the next content-size change restarts the check).
   */
  const scheduleSettleCheck = useCallback((source: string, delayMs: number) => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      if (!autoFollowRef.current) return;
      const m = metricsRef.current;
      const dist = m.content - m.off - m.layout;
      if (dist <= BOTTOM_THRESHOLD) return;
      if (Math.abs(m.off - lastPinOffRef.current) < 2) {
        retryCountRef.current += 1;
        if (retryCountRef.current >= 4) return;
      }
      pinToBottomRef.current(`retry:${source}`);
    }, delayMs);
  }, []);

  /**
   * Scroll the list to the newest message.
   *
   * The offset is computed from the content height the native list reported, NOT
   * from VirtualizedList's per-cell estimates (`scrollToEnd`): those estimates fall
   * short with a tall last message and park the list mid-history. A smooth follow
   * for short distances keeps streaming readable; long jumps (opening a history)
   * snap instantly instead of visibly scrolling through the whole conversation.
   */
  const pinToBottom = useCallback(
    (source: string) => {
      const list = flatListRef.current;
      if (!list) return;
      const m = metricsRef.current;
      const target = Math.max(0, m.content - m.layout);
      const dist = m.content - m.off - m.layout;
      if (dist <= 8) return; // already parked at the bottom — don't restart an animation
      lastPinOffRef.current = m.off;
      retryCountRef.current = 0;
      const animated = dist <= m.layout;
      list.scrollToOffset({ offset: target, animated });
      scheduleSettleCheck(source, animated ? 350 : 130);
    },
    [scheduleSettleCheck],
  );
  pinToBottomRef.current = pinToBottom;

  const lastMsg = messages[messages.length - 1];

  // Auto-scroll when new messages arrive or parts update
  useEffect(() => {
    if (isAtBottomRef.current && flatListRef.current && messages.length > 0) {
      setTimeout(() => {
        pinToBottom("effect:newMessages");
      }, 100);
    }
  }, [messages.length, pinToBottom]);

  // Periodic scroll during streaming
  useEffect(() => {
    if (!isStreaming) return;
    const interval = setInterval(() => {
      if (isAtBottomRef.current) {
        pinToBottom("effect:streamTick");
      }
    }, 300);
    return () => clearInterval(interval);
  }, [isStreaming, pinToBottom]);

  // Force scroll to bottom when streaming ends
  useEffect(() => {
    if (!isStreaming && flatListRef.current && messages.length > 0) {
      setTimeout(() => {
        isAtBottomRef.current = true;
        setShowScrollDown(false);
        pinToBottom("effect:streamEnd");
      }, 200);
    }
  }, [isStreaming, messages.length, pinToBottom]);

  // Listen for keyboard hide events to restore scroll position
  useEffect(() => {
    const keyboardDidHide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardDidHide" : "keyboardDidHide",
      () => {
        // When keyboard hides, ensure we scroll to bottom if we were at bottom
        if (isAtBottomRef.current && flatListRef.current && messages.length > 0) {
          setTimeout(() => {
            pinToBottom("effect:keyboardHide");
          }, 100);
        }
      },
    );

    return () => {
      keyboardDidHide.remove();
    };
  }, [messages.length, pinToBottom]);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const nearBottom =
      contentSize.height - contentOffset.y - layoutMeasurement.height < BOTTOM_THRESHOLD;
    metricsRef.current = {
      off: contentOffset.y,
      content: contentSize.height,
      layout: layoutMeasurement.height,
    };
    if (nearBottom) autoFollowRef.current = true;
    isAtBottomRef.current = nearBottom;
    setShowScrollDown(!nearBottom && !autoFollowRef.current);
  }, []);

  const handleScrollToBottom = useCallback(() => {
    isAtBottomRef.current = true;
    autoFollowRef.current = true;
    setShowScrollDown(false);
    pinToBottom("button");
  }, [pinToBottom]);

  /** Keep the metrics fresh when a gesture settles (drag or fling). */
  const trackMetrics = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    metricsRef.current = {
      off: contentOffset.y,
      content: contentSize.height,
      layout: layoutMeasurement.height,
    };
  }, []);

  const [selectModalText, setSelectModalText] = useState<string | null>(null);
  const handleBubbleLongPress = useCallback((text: string) => {
    setSelectModalText(text);
  }, []);

  const renderMessage = useCallback(
    ({ item, index }: { item: MessageV2; index: number }) => {
      const isLastMsg = index === messages.length - 1;
      const isLastMsgStreaming =
        isStreaming && isLastMsg && item.role === "assistant" && item.parts.length > 0;

      return (
        <MessageBubble
          message={item}
          colors={colors}
          isStreaming={isLastMsgStreaming}
          currentStep={currentStep}
          onCitationClick={onCitationClick}
          onLongPress={handleBubbleLongPress}
        />
      );
    },
    [colors, messages.length, isStreaming, currentStep, onCitationClick, handleBubbleLongPress],
  );

  // Show indicator when streaming but no assistant content yet
  const showStreamingIndicator =
    isStreaming &&
    currentStep &&
    currentStep !== "idle" &&
    (!lastMsg || lastMsg.role !== "assistant" || lastMsg.parts.length === 0);

  return (
    <View style={s.container} onTouchStart={Keyboard.dismiss}>
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={s.listContent}
        onScroll={handleScroll}
        onScrollBeginDrag={() => {
          // Real user drag = they took over the scroll position; stop following
          // until they come back to the bottom.
          autoFollowRef.current = false;
          Keyboard.dismiss();
        }}
        onScrollEndDrag={trackMetrics}
        onMomentumScrollEnd={trackMetrics}
        // Pin to the newest message on EVERY content-size change (each batched
        // render, and each streamed chunk), so a long history lands at the bottom
        // no matter how many render batches it takes.
        onContentSizeChange={(_w, h) => {
          metricsRef.current = { ...metricsRef.current, content: h };
          if (autoFollowRef.current) pinToBottom("contentSize");
        }}
        // The list's own height can change right after mount (input row / keyboard /
        // tab bar settling); re-pin when that happens, the old offset is then no
        // longer the bottom.
        onLayout={(e) => {
          metricsRef.current = { ...metricsRef.current, layout: e.nativeEvent.layout.height };
          if (autoFollowRef.current) pinToBottom("listLayout");
        }}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        removeClippedSubviews={false}
        initialNumToRender={20}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        bounces={true}
        bouncesZoom={false}
        ListFooterComponent={
          showStreamingIndicator && currentStep ? <StreamingIndicator step={currentStep} /> : null
        }
      />

      {/* Scroll to bottom button */}
      {showScrollDown && (
        <View style={s.scrollDownWrap}>
          <TouchableOpacity
            style={s.scrollDownBtn}
            onPress={handleScrollToBottom}
            activeOpacity={0.8}
          >
            <ChevronDownIcon size={14} color={colors.mutedForeground} />
            <Text style={s.scrollDownText}>{t("streaming.scrollToBottom", "滚动到底部")}</Text>
          </TouchableOpacity>
        </View>
      )}

      <SelectableTextModal
        text={selectModalText}
        colors={colors}
        onClose={() => setSelectModalText(null)}
      />
    </View>
  );
}

function UserQuoteBlock({ part, colors }: { part: QuotePart; colors: ThemeColors }) {
  return (
    <View style={quoteStyles(colors).quoteBlock}>
      <View style={{ flex: 1 }}>
        <Text style={quoteStyles(colors).quoteText} numberOfLines={4}>
          {part.text.length > 200 ? `${part.text.slice(0, 200)}...` : part.text}
        </Text>
        {part.source && <Text style={quoteStyles(colors).quoteSource}>— {part.source}</Text>}
      </View>
    </View>
  );
}

const quoteStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    quoteBlock: {
      flexDirection: "row",
      gap: 6,
      borderRadius: radius.md,
      backgroundColor: withOpacity(colors.primary, 0.05),
      borderWidth: 0.5,
      borderColor: withOpacity(colors.primary, 0.15),
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
    quoteText: {
      fontSize: fs.xs,
      lineHeight: 16,
      color: colors.foreground,
      opacity: 0.8,
    },
    quoteSource: {
      fontSize: fs.xs - 1,
      color: colors.mutedForeground,
      marginTop: 2,
    },
  });

interface MessageBubbleProps {
  message: MessageV2;
  colors: ThemeColors;
  isStreaming?: boolean;
  currentStep?: "thinking" | "tool_calling" | "responding" | "idle";
  onCitationClick?: (citation: CitationPart) => void;
  onLongPress?: (text: string) => void;
}

function extractPlainText(message: MessageV2): string {
  const parts: string[] = [];
  for (const p of message.parts) {
    if (p.type === "quote") {
      const q = p as QuotePart;
      if (q.text) parts.push(`> ${q.text}`);
    } else if (p.type === "text") {
      const t = p as TextPart;
      if (t.text.trim()) parts.push(t.text);
    } else if (p.type === "reasoning") {
      const r = p as { reasoning?: string };
      if (r.reasoning?.trim()) parts.push(r.reasoning);
    }
  }
  return parts.join("\n\n");
}

function MessageBubble({
  message,
  colors,
  isStreaming,
  currentStep,
  onCitationClick,
  onLongPress,
}: MessageBubbleProps) {
  const s = makeStyles(colors);

  // Extract citations from message parts
  const citations = useMemo(() => {
    return sortCitationsByIndex(
      message.parts.filter((p): p is CitationPart => p.type === "citation"),
    );
  }, [message.parts]);

  const triggerLongPress = useCallback(() => {
    if (!onLongPress) return;
    const text = extractPlainText(message);
    if (text) onLongPress(text);
  }, [message, onLongPress]);

  if (message.role === "user") {
    const quoteParts = message.parts.filter((p) => p.type === "quote") as QuotePart[];
    const textParts = message.parts.filter((p) => p.type === "text") as TextPart[];

    return (
      <View style={s.userRow}>
        <Pressable style={s.userBubble} onLongPress={triggerLongPress} delayLongPress={300}>
          {quoteParts.length > 0 && (
            <View style={{ gap: 4, marginBottom: textParts.length > 0 ? 6 : 0 }}>
              {quoteParts.map((q) => (
                <UserQuoteBlock key={q.id} part={q} colors={colors} />
              ))}
            </View>
          )}
          {textParts.map((part) => (
            <Text key={part.id} style={s.userText}>
              {part.text}
            </Text>
          ))}
        </Pressable>
      </View>
    );
  }

  // Assistant message
  const hasContent = message.parts.some(
    (p) => (p.type === "text" && (p as TextPart).text.trim()) || p.type !== "text",
  );
  if (!hasContent) return null;

  const copyText = () => {
    const text = message.parts
      .filter((p) => p.type === "text" && (p as TextPart).text.trim())
      .map((p) => (p as TextPart).text)
      .join("\n\n");
    if (text) Clipboard.setStringAsync(text);
  };

  // Show gap indicator between parts when streaming
  const lastPart = message.parts[message.parts.length - 1];
  const isLastPartRunningText = lastPart?.type === "text" && lastPart.status === "running";
  const isLastPartActiveToolCall =
    lastPart?.type === "tool_call" &&
    (lastPart.status === "pending" || lastPart.status === "running");
  const isLastPartRunningReasoning =
    lastPart?.type === "reasoning" && lastPart.status === "running";
  const showGapIndicator =
    isStreaming &&
    currentStep !== "idle" &&
    lastPart &&
    !isLastPartRunningText &&
    !isLastPartActiveToolCall &&
    !isLastPartRunningReasoning;

  return (
    <View style={s.assistantRow}>
      <Pressable onLongPress={triggerLongPress} delayLongPress={300}>
        {message.parts.map((part) => (
          <PartRenderer
            key={part.id}
            part={part}
            citations={citations}
            onCitationClick={onCitationClick}
          />
        ))}
      </Pressable>
      {showGapIndicator && <StreamingIndicator step="thinking" />}
      {!isStreaming && <CopyButton onPress={copyText} colors={colors} />}
    </View>
  );
}

function CopyButton({ onPress, colors }: { onPress: () => void; colors: ThemeColors }) {
  const [copied, setCopied] = useState(false);
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => {
        onPress();
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 6,
        backgroundColor: copied ? `${colors.primary}14` : "transparent",
      }}
    >
      {copied ? (
        <CheckIcon size={13} color={colors.primary} />
      ) : (
        <CopyIcon size={13} color={colors.mutedForeground} />
      )}
    </TouchableOpacity>
  );
}

function SelectableTextModal({
  text,
  colors,
  onClose,
}: {
  text: string | null;
  colors: ThemeColors;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const visible = text !== null;

  useEffect(() => {
    if (!visible) setCopied(false);
  }, [visible]);

  const handleCopyAll = useCallback(() => {
    if (!text) return;
    Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [text]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}
        onPress={onClose}
      >
        <Pressable
          style={{
            backgroundColor: colors.background,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 24,
            maxHeight: "75%",
          }}
          onPress={() => {}}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <Text style={{ color: colors.mutedForeground, fontSize: fs.xs }}>
              {t("chat.selectAndCopy", "长按选中文字复制")}
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                onPress={handleCopyAll}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 6,
                  backgroundColor: copied ? `${colors.primary}14` : colors.muted,
                }}
              >
                {copied ? (
                  <CheckIcon size={13} color={colors.primary} />
                ) : (
                  <CopyIcon size={13} color={colors.foreground} />
                )}
                <Text style={{ color: colors.foreground, fontSize: fs.xs }}>
                  {t("common.copyAll", "全部复制")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onClose}
                style={{ paddingHorizontal: 8, paddingVertical: 4 }}
              >
                <Text style={{ color: colors.mutedForeground, fontSize: fs.sm }}>
                  {t("common.close", "关闭")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          <TextInput
            value={text ?? ""}
            editable={false}
            multiline
            scrollEnabled
            textAlignVertical="top"
            selectionColor={colors.primary}
            style={{
              color: colors.foreground,
              fontSize: fs.sm,
              lineHeight: 22,
              padding: 12,
              backgroundColor: colors.muted,
              borderRadius: 8,
              minHeight: 200,
              maxHeight: 480,
            }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1 },
    listContent: { paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
    userRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      marginTop: 16,
    },
    userBubble: {
      maxWidth: "85%",
      backgroundColor: colors.muted,
      borderRadius: radius.xl + 4,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    userText: {
      fontSize: fs.sm,
      lineHeight: 20,
      color: colors.foreground,
    },
    assistantRow: {
      gap: 4,
    },
    scrollDownWrap: {
      position: "absolute",
      bottom: 8,
      left: 0,
      right: 0,
      alignItems: "center",
    },
    scrollDownBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 4,
    },
    scrollDownText: {
      fontSize: fs.xs,
      color: colors.mutedForeground,
    },
  });
