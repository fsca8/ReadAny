import { describe, expect, it } from "vitest";
import { type ContextBook, dedupeContextBooks, resolveContextBook } from "../context-books";
import { type BookToolEntry, mergeBookScopedTools } from "../tools/book-scope";
import type { ToolDefinition } from "../tools/tool-types";

function makeBook(overrides: Partial<ContextBook> = {}): ContextBook {
  return {
    id: "book-1",
    title: "Clean Code",
    author: "Robert C. Martin",
    isVectorized: true,
    ...overrides,
  };
}

function makeTool(name: string, tag: string): ToolDefinition {
  return {
    name,
    description: `${name} for ${tag}`,
    parameters: { query: { type: "string", description: "query" } },
    execute: async (args) => ({ tag, args }),
  };
}

function findTool(tools: ToolDefinition[], name: string): ToolDefinition {
  const tool = tools.find((item) => item.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

describe("resolveContextBook", () => {
  const books = [
    makeBook(),
    makeBook({ id: "book-2", title: "Refactoring: Improving the Design", isVectorized: false }),
  ];

  it("resolves by exact id", () => {
    expect(resolveContextBook("book-2", books)?.id).toBe("book-2");
  });

  it("resolves by exact title regardless of case and punctuation", () => {
    expect(resolveContextBook("clean code", books)?.id).toBe("book-1");
    expect(resolveContextBook("《Clean Code》", books)?.id).toBe("book-1");
  });

  it("resolves a partial or decorated title to the closest book", () => {
    expect(resolveContextBook("Refactoring", books)?.id).toBe("book-2");
    expect(resolveContextBook("refactoring: improving", books)?.id).toBe("book-2");
  });

  it("returns null for empty or unknown references", () => {
    expect(resolveContextBook("", books)).toBeNull();
    expect(resolveContextBook(null, books)).toBeNull();
    expect(resolveContextBook("Some Other Book", books)).toBeNull();
  });
});

describe("dedupeContextBooks", () => {
  it("keeps the first occurrence of each book, preserving order", () => {
    const deduped = dedupeContextBooks([
      makeBook(),
      makeBook({ id: "book-2", title: "Refactoring" }),
      makeBook({ title: "Clean Code" }),
    ]);
    expect(deduped.map((book) => book.id)).toEqual(["book-1", "book-2"]);
  });
});

describe("mergeBookScopedTools", () => {
  const currentBook = makeBook({ id: "current", title: "Current Book" });
  const pinnedBook = makeBook({ id: "pinned", title: "Pinned Book" });

  it("returns the single book's tools untouched", () => {
    const tools = [makeTool("ragSearch", "current")];
    const merged = mergeBookScopedTools([{ book: currentBook, tools }]);
    expect(merged).toBe(tools);
    expect(merged[0].parameters).not.toHaveProperty("book");
  });

  it("adds a book selector and documents the applicable books", () => {
    const merged = mergeBookScopedTools([
      { book: currentBook, tools: [makeTool("ragSearch", "current")] },
      { book: pinnedBook, tools: [makeTool("ragSearch", "pinned")] },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].parameters.book).toBeDefined();
    expect(merged[0].parameters.query).toBeDefined();
    expect(merged[0].description).toContain("Current Book");
    expect(merged[0].description).toContain("Pinned Book");
    expect(merged[0].description).toContain("default");
  });

  it("defaults to the current book and dispatches by title or id", async () => {
    const merged = mergeBookScopedTools([
      { book: currentBook, tools: [makeTool("ragSearch", "current")] },
      { book: pinnedBook, tools: [makeTool("ragSearch", "pinned")] },
    ]);
    const tool = merged[0];

    expect(await tool.execute({ query: "a" })).toEqual({
      tag: "current",
      args: { query: "a" },
    });
    expect(await tool.execute({ query: "a", book: "Pinned Book" })).toEqual({
      tag: "pinned",
      args: { query: "a" },
    });
    expect(await tool.execute({ query: "a", book: "pinned" })).toEqual({
      tag: "pinned",
      args: { query: "a" },
    });
  });

  it("reports an unknown book instead of silently using the default", async () => {
    const merged = mergeBookScopedTools([
      { book: currentBook, tools: [makeTool("ragSearch", "current")] },
      { book: pinnedBook, tools: [makeTool("ragSearch", "pinned")] },
    ]);

    const result = (await merged[0].execute({ query: "a", book: "Nonexistent" })) as {
      error: string;
      availableBooks: string[];
    };
    expect(result.error).toContain("Nonexistent");
    expect(result.availableBooks).toEqual(["Current Book", "Pinned Book"]);
  });

  it("only offers the books that actually have the tool", async () => {
    const entries: BookToolEntry[] = [
      { book: currentBook, tools: [makeTool("ragSearch", "current")] },
      { book: pinnedBook, tools: [makeTool("fallbackSearch", "pinned")] },
    ];
    const merged = mergeBookScopedTools(entries);
    const ragSearch = findTool(merged, "ragSearch");
    const fallbackSearch = findTool(merged, "fallbackSearch");

    // Indexed-only tool: the non-indexed pinned book is not a target.
    expect(ragSearch.description).toContain("Current Book");
    const rejected = (await ragSearch.execute({ query: "a", book: "Pinned Book" })) as {
      availableBooks: string[];
    };
    expect(rejected.availableBooks).toEqual(["Current Book"]);

    // The non-indexed book's own tool is reachable through the selector.
    expect(await fallbackSearch.execute({ query: "a", book: "Pinned Book" })).toEqual({
      tag: "pinned",
      args: { query: "a" },
    });
  });
});
