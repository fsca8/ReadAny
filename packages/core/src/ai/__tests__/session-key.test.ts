import { describe, expect, it } from "vitest";
import { buildChatSessionKey, buildSessionKey } from "../llm-provider";

/**
 * 会话标识的粒度：**按书**。
 * 语义来源：同一本书的提问相关性高，「今天问、明天问、换个窗口问」都应该接同一条上游会话；
 * 只有没有书（通用对话）时才退回按窗口。
 */
describe("buildChatSessionKey", () => {
  it("有 bookId 时按书（换窗口、隔天再问都命中同一条会话）", () => {
    expect(buildChatSessionKey("book-1", "thread-1")).toBe("readany:book:book-1");
    expect(buildChatSessionKey("book-1", "thread-2")).toBe("readany:book:book-1");
  });

  it("没有书时退回按窗口（通用对话）", () => {
    expect(buildChatSessionKey(null, "thread-1")).toBe("readany:thread:thread-1");
    expect(buildChatSessionKey(undefined, "thread-9")).toBe("readany:thread:thread-9");
    expect(buildChatSessionKey("", "thread-3")).toBe("readany:thread:thread-3");
  });

  it("记忆压缩与技能执行走独立会话，不占用书的会话", () => {
    expect(buildSessionKey("memory", "book-1")).toBe("readany:memory:book-1");
    expect(buildSessionKey("skill", "shared")).toBe("readany:skill:shared");
    expect(buildChatSessionKey("book-1", "thread-1")).not.toBe(buildSessionKey("memory", "book-1"));
  });
});
