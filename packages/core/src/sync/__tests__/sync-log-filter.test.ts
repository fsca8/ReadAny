import { describe, expect, it } from "vitest";
import { filterSyncLines } from "../sync-log-filter";

describe("filterSyncLines", () => {
  it("keeps per-book engine decisions and phase markers", () => {
    const dump = [
      "[2026-09-27 11:20:00.000] [log] [PBT] phase3 books-pull start",
      "[2026-09-27 11:20:00.100] [log] [PerBookSync] book book-1 pull (book 0/0, annotations 1758900000000/0, localRow=false)",
      "[2026-09-27 11:20:00.200] [log] [PerBookSync] book book-2 in sync (book remote=1 local=1, annotations remote=2 local=2)",
    ].join("\n");

    expect(filterSyncLines(dump)).toHaveLength(3);
  });

  it("keeps the DB-layer debug lines of the apply path", () => {
    const dump = [
      "[2026-09-27 11:20:00.000] [log] [SyncDbg] columns(books) = 30 [id,file_path,title]",
      "[2026-09-27 11:20:00.100] [warn] [SyncDbg] upsert highlights skipped: columns=[] pk=id",
    ].join("\n");

    expect(filterSyncLines(dump)).toHaveLength(2);
  });

  it("keeps failures and drops unrelated app logs", () => {
    const dump = [
      "[2026-09-27 11:21:00.000] [error] [PerBookSync] Failed to pull book book-1 (will retry next sync): WebDAV GET failed",
      "[2026-09-27 11:22:00.000] [log] [ReaderScreen] opened book book-1",
      "",
    ].join("\n");

    const lines = filterSyncLines(dump);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("Failed to pull book");
  });

  it("returns nothing when the log has no sync activity", () => {
    expect(filterSyncLines("[2026-09-27 11:23:00.000] [log] [Reader] turned page")).toEqual([]);
  });
});
