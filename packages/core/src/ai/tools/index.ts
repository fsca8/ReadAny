/**
 * AI Tool registration — conditional tool registration based on book state
 * Full implementation with RAG search pipeline integration
 *
 * Tool Categories:
 * - RAG Tools: ragSearch, ragToc, ragContext
 * - Analysis Tools: summarize, extractEntities, analyzeArguments, findQuotes, compareSections
 * - Annotation Tools: getAnnotations, addCitation
 * - Library Tools: listBooks, searchAllHighlights, searchAllNotes, readingStats, classifyBooks,
 *   tagBooks, manageBookTags, updateBookMetadata, manageBookGroups
 * - Skill Tools: getSkills, skillToTool
 * - Mindmap Tools: mindmap
 * - Context Tools: getCurrentChapter, getSelection, getReadingProgress, getRecentHighlights, getSurroundingContext
 */
import type { Skill } from "../../types";
import { type ContextBook, dedupeContextBooks } from "../context-books";
import {
  createAnalyzeArgumentsTool,
  createCompareSectionsTool,
  createExtractEntitiesTool,
  createFindQuotesTool,
  createSummarizeTool,
} from "./analysis-tools";
import { createAddCitationTool, createGetAnnotationsTool } from "./annotation-tools";
import { type BookToolEntry, mergeBookScopedTools } from "./book-scope";
import { getContextTools } from "./context-tools";
import {
  createFallbackChapterContextTool,
  createFallbackResolveChapterReferenceTool,
  createFallbackSearchTool,
  createFallbackTocTool,
} from "./fallback-content-tools";
import {
  createClassifyBooksTool,
  createListBooksTool,
  createManageBookGroupsTool,
  createManageBookTagsTool,
  createReadingStatsTool,
  createSearchAllHighlightsTool,
  createSearchAllNotesTool,
  createTagBooksTool,
  createUpdateBookMetadataTool,
} from "./library-tools";
import { createMindmapTool } from "./mindmap-tools";
import {
  createRagContextTool,
  createRagSearchTool,
  createRagTocTool,
  createResolveChapterReferenceTool,
} from "./rag-tools";
import { createGetSkillsTool, skillToTool } from "./skill-tools";
import type { ToolDefinition } from "./tool-types";

// Re-export types and key functions for external consumers
export type { ToolDefinition, ToolParameter } from "./tool-types";
export { getContextTools } from "./context-tools";

/** Get general (non-book-specific) tools */
function getGeneralTools(): ToolDefinition[] {
  return [
    createListBooksTool(),
    createSearchAllHighlightsTool(),
    createSearchAllNotesTool(),
    createReadingStatsTool(),
    createGetSkillsTool(),
    createMindmapTool(),
    createClassifyBooksTool(),
    createTagBooksTool(),
    createManageBookTagsTool(),
    createUpdateBookMetadataTool(),
    createManageBookGroupsTool(),
  ];
}

/** Content tools for one book: retrieval + analysis (+ annotations). */
function getContentTools(bookId: string, isVectorized: boolean): ToolDefinition[] {
  if (isVectorized) {
    return [
      createResolveChapterReferenceTool(bookId),
      createRagSearchTool(bookId),
      createRagTocTool(bookId),
      createRagContextTool(bookId),
      // Content analysis tools (require chunks from vectorization)
      createSummarizeTool(bookId),
      createExtractEntitiesTool(bookId),
      createAnalyzeArgumentsTool(bookId),
      createFindQuotesTool(bookId),
      createCompareSectionsTool(bookId),
      // Citations are available for indexed chunks and for fallback sources that
      // can be validated against concrete reader segments.
      createGetAnnotationsTool(bookId),
      createAddCitationTool(bookId),
    ];
  }

  return [
    createFallbackResolveChapterReferenceTool(bookId),
    createFallbackTocTool(bookId),
    createFallbackSearchTool(bookId),
    createFallbackChapterContextTool(bookId),
    createGetAnnotationsTool(bookId),
    createAddCitationTool(bookId),
  ];
}

/** Get available tools based on current state */
export function getAvailableTools(options: {
  bookId?: string | null;
  /** Title of the current book, so the model can also address it by name. */
  bookTitle?: string | null;
  isVectorized: boolean;
  enabledSkills: Skill[];
  /**
   * Books the user pinned as conversation context. Their content tools are
   * registered alongside the current book's, and (when there is more than one
   * book) every such tool gains a `book` selector parameter.
   */
  contextBooks?: ContextBook[];
}): ToolDefinition[] {
  const tools: ToolDefinition[] = [];

  // General tools are always available (no bookId required)
  tools.push(...getGeneralTools());

  // Reading-position tools describe where the user is now → current book only.
  if (options.bookId) {
    tools.push(...getContextTools(options.bookId));
  }

  const entries: BookToolEntry[] = [];
  if (options.bookId) {
    entries.push({
      book: {
        id: options.bookId,
        title: options.bookTitle?.trim() || "current book",
        isVectorized: options.isVectorized,
      },
      tools: getContentTools(options.bookId, options.isVectorized),
    });
  }
  for (const book of dedupeContextBooks(options.contextBooks ?? [])) {
    if (book.id === options.bookId) continue;
    entries.push({ book, tools: getContentTools(book.id, book.isVectorized) });
  }
  tools.push(...mergeBookScopedTools(entries));

  // Add custom skills
  for (const skill of options.enabledSkills) {
    tools.push(skillToTool(skill));
  }

  return tools;
}
