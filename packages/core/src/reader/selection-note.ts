import type { Highlight, HighlightAnchor, HighlightColor } from "../types";
import { generateId } from "../utils/generate-id";

interface ExistingHighlightRef {
  id: string;
}

export interface SelectionNoteMutationInput {
  bookId: string;
  /** Legacy CFI; only meaningful when `anchor.kind === "cfi"`. */
  cfi?: string;
  /** Anchor for a NEW highlight. Required when creating; ignored when
   * `existingHighlight` is set (an update only touches note/updatedAt).
   * (EPUB/MOBI/text-PDF -> cfi; scanned PDF/CBZ -> page.) */
  anchor?: HighlightAnchor;
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

  // A create needs an anchor; fall back to a legacy CFI anchor when a caller
  // still passes only `cfi`, and to a page anchor when neither is present.
  const anchor: HighlightAnchor =
    input.anchor ?? (input.cfi ? { kind: "cfi", cfi: input.cfi } : { kind: "page", page: 1 });

  return {
    kind: "create",
    highlight: {
      id: generateId(),
      bookId: input.bookId,
      cfi: anchor.kind === "cfi" ? anchor.cfi : input.cfi,
      anchor,
      text: input.text,
      color: input.defaultColor ?? "yellow",
      note: normalizedNote,
      chapterTitle: input.chapterTitle,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  };
}
