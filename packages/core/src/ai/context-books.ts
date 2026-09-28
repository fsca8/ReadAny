/**
 * Context books — books the user pinned as context for a conversation.
 *
 * The AI chat pages let the user pick books (ContextPopover). A pinned book is not
 * just a label: it becomes a **retrieval source** for the turn —
 * 1. it is listed in the system prompt so the model knows whose content it may use,
 * 2. the per-book retrieval tools (ragSearch / ragToc / …) are registered for it and
 *    exposed behind a `book` selector parameter (see tools/book-scope.ts).
 */

export interface ContextBook {
  id: string;
  title: string;
  author?: string;
  /** RAG tools can be used for this book (chunks + embeddings exist). */
  isVectorized: boolean;
}

/** Loose comparison key: case/punctuation/whitespace-insensitive. */
function normalizeBookRef(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[《》「」『』"'"'()\[\]{}]/g, "")
    .replace(/[\s\p{P}\p{S}_-]+/gu, "");
}

/**
 * Resolve a book the model named in a tool argument ("book": "<title or id>")
 * against the pinned/available books. Accepts an exact id, an exact title, or a
 * fuzzy title (either side containing the other) so `《Clean Code》` /
 * `clean-code` / a partial title all land on the right book.
 */
export function resolveContextBook(
  ref: string | null | undefined,
  books: ContextBook[],
): ContextBook | null {
  if (!ref) return null;
  const raw = ref.trim();
  if (!raw) return null;

  const exactId = books.find((book) => book.id === raw);
  if (exactId) return exactId;

  const key = normalizeBookRef(raw);
  if (!key) return null;

  const exactTitle = books.find((book) => normalizeBookRef(book.title) === key);
  if (exactTitle) return exactTitle;

  return (
    books.find((book) => {
      const title = normalizeBookRef(book.title);
      return title.includes(key) || key.includes(title);
    }) ?? null
  );
}

/** Deduplicate books by id, keeping the first occurrence (order = priority). */
export function dedupeContextBooks(books: ContextBook[]): ContextBook[] {
  const seen = new Set<string>();
  const out: ContextBook[] = [];
  for (const book of books) {
    if (seen.has(book.id)) continue;
    seen.add(book.id);
    out.push(book);
  }
  return out;
}

/** Human-readable list used in tool descriptions and prompts. */
export function formatContextBooks(books: ContextBook[]): string {
  return books.map((book) => `《${book.title}》`).join("、");
}
