/**
 * Book-scoped tools — let one tool serve several books.
 *
 * Per-book tool factories bind a bookId at creation time (ragSearch, ragToc,
 * addCitation …). When the user pins extra books as context, the same tool names
 * must be able to serve any of them. Rather than renaming tools per book (which
 * would break the router, the prompt rules and the model's habits), each tool
 * gains an optional `book` parameter and dispatches to the right per-book
 * instance. With a single book nothing changes: the tool is returned untouched.
 */
import { type ContextBook, resolveContextBook } from "../context-books";
import type { ToolDefinition } from "./tool-types";

export interface BookToolEntry {
  book: ContextBook;
  tools: ToolDefinition[];
}

function bookLabel(book: ContextBook): string {
  return book.author ? `《${book.title}》 (${book.author})` : `《${book.title}》`;
}

/**
 * Merge per-book tool sets into one tool list. Tools that exist for several books
 * get a `book` selector; tools that exist for a single book are passed through.
 */
export function mergeBookScopedTools(entries: BookToolEntry[]): ToolDefinition[] {
  const [primary, ...others] = entries;
  if (!primary) return [];
  if (others.length === 0) return primary.tools;

  const groups: Array<{ name: string; perBook: Map<string, ToolDefinition> }> = [];
  const groupIndex = new Map<string, number>();
  for (const entry of entries) {
    for (const tool of entry.tools) {
      const position = groupIndex.get(tool.name);
      if (position === undefined) {
        groupIndex.set(tool.name, groups.length);
        groups.push({ name: tool.name, perBook: new Map([[entry.book.id, tool]]) });
        continue;
      }
      const group = groups[position];
      if (group) group.perBook.set(entry.book.id, tool);
    }
  }

  return groups.map(({ name, perBook }) => {
    const primaryTool = perBook.get(primary.book.id) ?? perBook.values().next().value;
    if (!primaryTool) {
      // Unreachable: a group only exists because some book contributed a tool.
      throw new Error(`Tool group "${name}" has no implementation`);
    }
    const serving = entries.filter((entry) => perBook.has(entry.book.id));
    const bookList = serving
      .map(
        (entry) =>
          `${bookLabel(entry.book)}${entry.book.id === primary.book.id ? " — default" : ""}`,
      )
      .join("; ");

    return {
      ...primaryTool,
      description: `${primaryTool.description}\n\nApplicable books (pass "book" to pick one, default is the current book): ${bookList}.`,
      parameters: {
        ...primaryTool.parameters,
        book: {
          type: "string",
          description: `Which book to use: its title or id. One of: ${serving
            .map((entry) => entry.book.title)
            .join(", ")}. Omit for the current book.`,
        },
      },
      execute: async (args) => {
        const requested = typeof args.book === "string" ? args.book.trim() : "";
        const available = serving.map((entry) => entry.book);
        let target: ContextBook | null = primary.book;
        if (requested) {
          target = resolveContextBook(requested, available);
          if (!target) {
            return {
              error: `Unknown book "${requested}".`,
              availableBooks: available.map((book) => book.title),
              hint:
                serving.length > 1
                  ? `Pass one of the available titles (or its id) as "book".`
                  : undefined,
            };
          }
        } else if (!perBook.has(primary.book.id)) {
          // The default book has no index for this tool; fall back to the first
          // book that can actually serve it.
          target = available[0] ?? null;
        }

        const tool = target ? perBook.get(target.id) : undefined;
        if (!tool || !target) {
          return {
            error: `This tool is not available for 《${target?.title ?? primary.book.title}》.`,
            hint: "Pick another book, or use the tools registered for it.",
            availableBooks: available.map((book) => book.title),
          };
        }

        const { book: _selector, ...rest } = args;
        return tool.execute(rest);
      },
    };
  });
}
