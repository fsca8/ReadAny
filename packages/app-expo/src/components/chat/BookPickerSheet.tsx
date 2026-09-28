import { BookOpenIcon, SearchIcon } from "@/components/ui/Icon";
import { type ThemeColors, fontSize, fontWeight, radius, spacing, useColors } from "@/styles/theme";
import type { Book } from "@readany/core/types";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * BookPickerSheet — pick a book to open its AI conversation.
 * Same shape as the other picker sheets (GroupPickerSheet) so the app stays consistent.
 */
interface BookPickerSheetProps {
  visible: boolean;
  books: Book[];
  /** Highlighted row — the book whose conversation is currently open. */
  currentBookId?: string | null;
  onSelect: (bookId: string) => void;
  onClose: () => void;
}

export function BookPickerSheet({
  visible,
  books,
  currentBookId,
  onSelect,
  onClose,
}: BookPickerSheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors, insets.bottom), [colors, insets.bottom]);
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const filteredBooks = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return books;
    return books.filter((book) =>
      `${book.meta.title} ${book.meta.author ?? ""}`.toLowerCase().includes(keyword),
    );
  }, [books, query]);

  const handleSelect = (bookId: string) => {
    onSelect(bookId);
    setQuery("");
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.keyboardRoot} behavior="height">
        <Pressable style={styles.overlay} onPress={onClose}>
          <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
            <View style={styles.handle} />
            <Text style={styles.title}>{t("chat.selectBook", "选择书籍")}</Text>

            <View style={styles.searchRow}>
              <SearchIcon size={16} color={colors.mutedForeground} />
              <TextInput
                style={styles.searchInput}
                placeholder={t("library.searchPlaceholder", "搜索书籍...")}
                placeholderTextColor={colors.mutedForeground}
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
                returnKeyType="search"
              />
            </View>

            {filteredBooks.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>{t("chat.noBooksInLibrary", "书库中没有书籍")}</Text>
              </View>
            ) : (
              <ScrollView
                style={styles.bookList}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
              >
                {filteredBooks.map((book) => {
                  const isCurrent = book.id === currentBookId;
                  return (
                    <TouchableOpacity
                      key={book.id}
                      style={styles.bookItem}
                      activeOpacity={0.7}
                      onPress={() => handleSelect(book.id)}
                    >
                      <BookOpenIcon
                        size={18}
                        color={isCurrent ? colors.primary : colors.mutedForeground}
                      />
                      <View style={styles.bookText}>
                        <Text
                          style={[styles.bookTitle, isCurrent && styles.bookTitleCurrent]}
                          numberOfLines={1}
                        >
                          {book.meta.title}
                        </Text>
                        {book.meta.author ? (
                          <Text style={styles.bookAuthor} numberOfLines={1}>
                            {book.meta.author}
                          </Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (colors: ThemeColors, bottomInset: number) =>
  StyleSheet.create({
    keyboardRoot: { flex: 1 },
    overlay: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: "rgba(0,0,0,0.3)",
    },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: radius.xxl,
      borderTopRightRadius: radius.xxl,
      paddingTop: 10,
      paddingBottom: Math.max(34, bottomInset + 18),
      paddingHorizontal: spacing.lg,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: `${colors.mutedForeground}40`,
      alignSelf: "center",
      marginBottom: spacing.md,
    },
    title: {
      fontSize: fontSize.lg,
      fontWeight: fontWeight.semibold,
      color: colors.foreground,
      marginBottom: spacing.md,
      paddingHorizontal: 4,
    },
    searchRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginBottom: spacing.sm,
    },
    searchInput: {
      flex: 1,
      fontSize: fontSize.base,
      color: colors.foreground,
      paddingVertical: 4,
    },
    bookList: {
      maxHeight: 320,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    bookItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    bookText: { flex: 1, minWidth: 0 },
    bookTitle: {
      fontSize: fontSize.base,
      color: colors.foreground,
    },
    bookTitleCurrent: {
      color: colors.primary,
      fontWeight: fontWeight.medium,
    },
    bookAuthor: {
      marginTop: 2,
      fontSize: fontSize.xs,
      color: colors.mutedForeground,
    },
    empty: { paddingVertical: 28, alignItems: "center" },
    emptyText: { fontSize: fontSize.sm, color: colors.mutedForeground },
  });
