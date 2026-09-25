/**
 * Message processing pipeline
 * - Citation reference injection
 * - 8-message sliding window
 * - Context assembly
 */
import type { Message, SemanticContext, Thread } from "../types";
import type { Book, Skill } from "../types";
import { buildReadingContextBlock, buildSystemPrompt } from "./system-prompt";

interface PipelineConfig {
  slidingWindowSize: number; // default 8
  /**
   * AIChatAsChatAI（会话代理）：把「当前阅读上下文」拼进最后一条 user 消息。
   * 服务端只把最后一条 user 发上游，靠 system 带上下文在第二轮之后就失效。
   */
  readingContextInUserMessage?: boolean;
}

interface PipelineContext {
  book: Book | null;
  bookId?: string | null;
  semanticContext: SemanticContext | null;
  enabledSkills: Skill[];
  isVectorized: boolean;
  userLanguage: string;
  memorySummary?: string;
}

export interface ProcessedMessage {
  role: "user" | "assistant";
  content: string;
  /** DeepSeek reasoning_content — needed for multi-turn tool-calling with reasoner models */
  reasoning?: string;
}

interface ProcessedMessages {
  systemPrompt: string;
  messages: ProcessedMessage[];
}

const DEFAULT_CONFIG: PipelineConfig = {
  slidingWindowSize: 8,
};

/** Process a thread into messages ready for AI API call */
export function processMessages(
  thread: Thread,
  context: PipelineContext,
  config: PipelineConfig = DEFAULT_CONFIG,
): ProcessedMessages {
  const systemPrompt = buildSystemPrompt(context);

  // Apply sliding window — keep last N messages
  const windowedMessages = applySlidingWindow(thread.messages, config.slidingWindowSize);

  // Process citations in messages, preserving reasoning for DeepSeek multi-turn
  const processed: ProcessedMessage[] = windowedMessages
    .filter((m) => m.role !== "system")
    .map((m) => {
      const msg: ProcessedMessage = {
        role: m.role as "user" | "assistant",
        content: injectCitations(m),
      };
      // Preserve reasoning content for assistant messages (needed by DeepSeek reasoner)
      if (m.role === "assistant" && m.reasoning && m.reasoning.length > 0) {
        msg.reasoning = m.reasoning.map((r) => r.content).join("\n");
      }
      return msg;
    });

  const messages = config.readingContextInUserMessage
    ? appendReadingContextToLastUser(processed, context.semanticContext)
    : processed;

  return { systemPrompt, messages };
}

/**
 * 把「当前阅读上下文」拼到最后一条 user 消息前面（AIChatAsChatAI 会话代理用）。
 * 上下文放前面、问题放最后，模型才会把上下文当成「已知材料」而不是待办事项。
 */
function appendReadingContextToLastUser(
  messages: ProcessedMessage[],
  semanticContext: SemanticContext | null,
): ProcessedMessage[] {
  const block = buildReadingContextBlock(semanticContext);
  if (!block) return messages;
  let lastUserIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      lastUserIndex = i;
      break;
    }
  }
  if (lastUserIndex < 0) return messages;
  return messages.map((message, index) =>
    index === lastUserIndex
      ? { ...message, content: `${block}\n\n---\n\n${message.content}` }
      : message,
  );
}

/** Apply sliding window, keeping system messages + last N user/assistant pairs */
function applySlidingWindow(messages: Message[], windowSize: number): Message[] {
  if (messages.length <= windowSize) return messages;
  return messages.slice(-windowSize);
}

/** Inject citation references into message content */
function injectCitations(message: Message): string {
  if (!message.citations || message.citations.length === 0) {
    return message.content;
  }

  let content = message.content;
  for (const citation of message.citations) {
    // Append citation references at the end
    content += `\n\n> [${citation.chapterTitle}]: "${citation.text}"`;
  }
  return content;
}
