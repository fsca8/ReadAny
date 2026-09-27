import { describe, expect, it } from "vitest";
import { createSelectionNoteMutation, isPageLevelNote } from "./selection-note";

describe("createSelectionNoteMutation", () => {
  it("creates a new highlight mutation for a fresh note", () => {
    const mutation = createSelectionNoteMutation({
      bookId: "book-1",
      cfi: "epubcfi(/6/2[chapter]!/4/2/10)",
      text: "Selected text",
      note: "A new note",
      chapterTitle: "Chapter 1",
      defaultColor: "blue",
      now: 1_700_000_000_000,
    });

    expect(mutation.kind).toBe("create");
    if (mutation.kind !== "create") {
      throw new Error("Expected create mutation");
    }

    expect(mutation.highlight).toMatchObject({
      bookId: "book-1",
      cfi: "epubcfi(/6/2[chapter]!/4/2/10)",
      text: "Selected text",
      note: "A new note",
      chapterTitle: "Chapter 1",
      color: "blue",
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    });
    expect(mutation.highlight.id).toEqual(expect.any(String));
  });

  it("normalizes blank notes to undefined when creating", () => {
    const mutation = createSelectionNoteMutation({
      bookId: "book-1",
      cfi: "epubcfi(/6/2[chapter]!/4/2/10)",
      text: "Selected text",
      note: "   ",
      now: 42,
    });

    expect(mutation.kind).toBe("create");
    if (mutation.kind !== "create") {
      throw new Error("Expected create mutation");
    }

    expect(mutation.highlight.note).toBeUndefined();
    expect(mutation.highlight.color).toBe("yellow");
  });

  it("updates an existing highlight instead of creating a new one", () => {
    const mutation = createSelectionNoteMutation({
      bookId: "book-1",
      cfi: "epubcfi(/6/2[chapter]!/4/2/10)",
      text: "Selected text",
      note: "  Updated note  ",
      existingHighlight: { id: "hl-123" },
      now: 99,
    });

    expect(mutation).toEqual({
      kind: "update",
      id: "hl-123",
      updates: {
        note: "Updated note",
        updatedAt: 99,
      },
    });
  });

  it("clears the note text on update when content becomes blank", () => {
    const mutation = createSelectionNoteMutation({
      bookId: "book-1",
      cfi: "epubcfi(/6/2[chapter]!/4/2/10)",
      text: "Selected text",
      note: "   ",
      existingHighlight: { id: "hl-123" },
      now: 123,
    });

    expect(mutation).toEqual({
      kind: "update",
      id: "hl-123",
      updates: {
        note: undefined,
        updatedAt: 123,
      },
    });
  });
});

describe("isPageLevelNote", () => {
  it("is true for a note with no selected text", () => {
    expect(isPageLevelNote({ note: "页级笔记内容", text: "" })).toBe(true);
    expect(isPageLevelNote({ note: "note", text: null })).toBe(true);
    expect(isPageLevelNote({ note: "note", text: "   " })).toBe(true);
  });

  it("is false for a note attached to a real selection", () => {
    expect(isPageLevelNote({ note: "comment", text: "selected words" })).toBe(false);
  });

  it("is false for rows without a note", () => {
    expect(isPageLevelNote({ note: "", text: "selected words" })).toBe(false);
    expect(isPageLevelNote({ note: undefined, text: undefined })).toBe(false);
  });
});
