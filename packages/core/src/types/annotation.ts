/** Annotation types: highlights, notes, bookmarks */

// Predefined highlight colors (matching readest)
export type HighlightColor = "red" | "yellow" | "green" | "blue" | "pink" | "purple" | "violet";

// Hex color values for each highlight color
export const HIGHLIGHT_COLOR_HEX: Record<HighlightColor, string> = {
  red: "#f87171", // red-400
  yellow: "#facc15", // yellow-400
  green: "#4ade80", // green-400
  blue: "#60a5fa", // blue-400
  pink: "#f472b6", // pink-400
  purple: "#c084fc", // purple-400
  violet: "#a78bfa", // violet-400
};

// All available highlight colors in display order
export const HIGHLIGHT_COLORS: HighlightColor[] = ["yellow", "green", "blue", "pink", "purple"];

/**
 * Anchor for an annotation.
 *
 * - `cfi`: EPUB CFI range — formats with a usable text-layer (EPUB, MOBI, FB2,
 *   text-layer PDFs). Re-anchors via foliate-js resolveCFI / overlayer.
 * - `page`: 1-based page number — formats without a stable text-layer (scanned
 *   PDFs, CBZ). No visual marker, just a "this page has a note" pointer; click
 *   goes to the page. The viewer emits a `page-annotation` event so the app
 *   layer can render any optional UI badge.
 */
export type HighlightAnchor = { kind: "cfi"; cfi: string } | { kind: "page"; page: number };

export interface Highlight {
  id: string;
  bookId: string;
  // Legacy field. Always populated for `kind: "cfi"`; undefined for
  // `kind: "page"` since there is no CFI. New code should prefer `anchor`.
  cfi?: string;
  /** Canonical anchor; supersedes the legacy `cfi` field. */
  anchor: HighlightAnchor;
  text: string;
  color: HighlightColor;
  note?: string;
  chapterTitle?: string;
  createdAt: number;
  updatedAt: number;
}

/** Build a CFI anchor (text-layer formats: EPUB/MOBI/FB2/text-PDF). */
export const cfiAnchor = (cfi: string): HighlightAnchor => ({ kind: "cfi", cfi });

/** Build a page anchor (no-text-layer formats: scanned PDF, CBZ, future). */
export const pageAnchor = (page: number): HighlightAnchor => ({ kind: "page", page });

/**
 * Back-compat: read `anchor` from a Highlight even when the legacy `cfi` field
 * is the only thing persisted — older records written before the anchor field
 * existed still resolve correctly.
 */
export const getHighlightAnchor = (h: Highlight): HighlightAnchor =>
  h.anchor ?? (h.cfi ? { kind: "cfi", cfi: h.cfi } : { kind: "page", page: 1 });

export interface Note {
  id: string;
  bookId: string;
  highlightId?: string; // optional link to highlight
  cfi?: string;
  title: string;
  content: string; // markdown
  chapterTitle?: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface Bookmark {
  id: string;
  bookId: string;
  cfi: string;
  label?: string;
  chapterTitle?: string;
  createdAt: number;
}

export type Annotation = Highlight | Note | Bookmark;
