import type { Highlight, HighlightColor } from "../types";
import { generateId } from "../utils/generate-id";

interface ExistingHighlightRef {
  id: string;
}

export interface SelectionNoteMutationInput {
  bookId: string;
  cfi: string;
  text: string;
  note: string;
  chapterTitle?: string;
  existingHighlight?: ExistingHighlightRef | null;
  defaultColor?: HighlightColor;
  now?: number;
}

export type SelectionNoteMutation =
  | {
      kind: "create";
      highlight: Highlight;
    }
  | {
      kind: "update";
      id: string;
      updates: Pick<Highlight, "note" | "updatedAt">;
    };

/**
 * A page-level note: the row carries note text but no selected text (it was
 * created from the reader's current position, see `createSelectionNoteMutation`
 * with `text: ""`). Such a row has no highlight aspect at all, so deleting its
 * note must delete the row. Clearing only the note text would leave an empty
 * highlight behind, which then shows up under 高亮 in the notes UI.
 *
 * Rows that DO have selected text keep their highlight when their note is
 * removed — the annotation is still meaningful without a comment.
 */
export function isPageLevelNote(highlight: {
  note?: string | null;
  text?: string | null;
}): boolean {
  return Boolean((highlight.note ?? "").trim()) && !(highlight.text ?? "").trim();
}

export function createSelectionNoteMutation(
  input: SelectionNoteMutationInput,
): SelectionNoteMutation {
  const timestamp = input.now ?? Date.now();
  const normalizedNote = input.note.trim() || undefined;

  if (input.existingHighlight) {
    return {
      kind: "update",
      id: input.existingHighlight.id,
      updates: {
        note: normalizedNote,
        updatedAt: timestamp,
      },
    };
  }

  return {
    kind: "create",
    highlight: {
      id: generateId(),
      bookId: input.bookId,
      cfi: input.cfi,
      text: input.text,
      color: input.defaultColor ?? "yellow",
      note: normalizedNote,
      chapterTitle: input.chapterTitle,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  };
}
