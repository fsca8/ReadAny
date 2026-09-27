import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type IPlatformService, setPlatformService } from "../services/platform";
import {
  appendLog,
  appendStructuredLog,
  cleanOldLogs,
  clearLogs,
  collectLogs,
  listLogFiles,
  logFileDate,
  readLogFile,
} from "./feedback-service";

function createTestPlatform(): IPlatformService {
  const files = new Map<string, string>();

  return {
    platformType: "desktop",
    isMobile: false,
    isDesktop: true,
    readFile: async (path) => new TextEncoder().encode(files.get(path) ?? ""),
    writeFile: async (path, data) => {
      files.set(path, new TextDecoder().decode(data));
    },
    writeTextFile: async (path, content) => {
      files.set(path, content);
    },
    readTextFile: async (path) => files.get(path) ?? "",
    mkdir: async () => {},
    exists: async (path) => files.has(path),
    deleteFile: async (path) => {
      files.delete(path);
    },
    readDir: async (path) => {
      const prefix = path.endsWith("/") ? path : `${path}/`;
      return [...files.keys()]
        .filter((file) => file.startsWith(prefix))
        .map((file) => file.slice(prefix.length))
        .filter((name) => name.length > 0 && !name.includes("/"));
    },
    getAppDataDir: async () => "/tmp/readany-feedback-test",
    getDataDir: async () => "/tmp/readany-feedback-test",
    joinPath: async (...parts) => parts.join("/").replace(/\/+/g, "/"),
    convertFileSrc: (path) => path,
    pickFile: async () => null,
    loadDatabase: async () => {
      throw new Error("Database is not available in feedback log tests");
    },
    fetch: async (url, options) => fetch(url, options),
    createWebSocket: async () => {
      throw new Error("WebSocket is not available in feedback log tests");
    },
    getAppVersion: async () => "0.0.0-test",
    getBuildInfo: async () => ({ version: "0.0.0-test", commit: "" }),
    kvGetItem: async () => null,
    kvSetItem: async () => {},
    kvRemoveItem: async () => {},
    kvGetAllKeys: async () => [],
    copyToClipboard: async () => {},
    shareOrDownloadFile: async () => null,
  };
}

describe("feedback log buffer", () => {
  beforeEach(async () => {
    setPlatformService(createTestPlatform());
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T00:00:00.000Z"));
    await clearLogs();
  });

  afterEach(async () => {
    await clearLogs();
    vi.useRealTimers();
  });

  it("collects the last hour by default", async () => {
    appendLog("old log");

    vi.setSystemTime(new Date("2026-05-08T01:00:01.000Z"));
    appendLog("recent log");

    const logs = await collectLogs();

    expect(logs).toContain("recent log");
    expect(logs).not.toContain("old log");
  });

  it("filters logs by the requested time window", async () => {
    appendLog("expired log");

    vi.setSystemTime(new Date("2026-05-09T00:00:01.000Z"));
    appendLog("fresh log");

    const logs = await collectLogs({ sinceMs: 60 * 60 * 1000 });

    expect(logs).toContain("fresh log");
    expect(logs).not.toContain("expired log");
  });

  it("stores structured app events", async () => {
    appendStructuredLog("feedback.submit.start", { type: "bug" });

    const logs = await collectLogs();

    expect(logs).toContain("[event:feedback.submit.start]");
    expect(logs).toContain('"type":"bug"');
  });
});

describe("log cleanup", () => {
  const logDir = "/tmp/readany-feedback-test/logs";
  const listDir = async (platform: IPlatformService) => (await platform.readDir?.(logDir)) ?? [];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-27T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads the date out of plain, rotated and legacy log names", () => {
    expect(logFileDate("app-2026-09-05.log")).toBe("2026-09-05");
    expect(logFileDate("app-2026-09-05.1.log")).toBe("2026-09-05");
    expect(logFileDate("readany-2026-09-05.log")).toBe("2026-09-05");
    expect(logFileDate("notes.txt")).toBeNull();
    expect(logFileDate("app.log")).toBeNull();
  });

  it("deletes logs older than the retention window and keeps the rest", async () => {
    const platform = createTestPlatform();
    setPlatformService(platform);
    for (const name of [
      "app-2026-09-05.log", // 22 days old → delete
      "app-2026-09-19.log", // 8 days old → delete
      "app-2026-09-20.log", // 7 days old → keep
      "app-2026-09-27.log", // today → keep
      "notes.txt", // not a log → keep
    ]) {
      await platform.writeTextFile(`${logDir}/${name}`, "x");
    }

    await cleanOldLogs();

    expect((await listDir(platform)).sort()).toEqual([
      "app-2026-09-20.log",
      "app-2026-09-27.log",
      "notes.txt",
    ]);
  });

  it("falls back to date probing when the platform cannot list directories", async () => {
    const platform = createTestPlatform();
    // Simulate a platform that cannot enumerate directories.
    (platform as { readDir?: IPlatformService["readDir"] }).readDir = undefined;
    setPlatformService(platform);
    await platform.writeTextFile(`${logDir}/app-2026-09-19.log`, "x");

    await cleanOldLogs();

    expect(await platform.exists(`${logDir}/app-2026-09-19.log`)).toBe(false);
  });

  it("keeps going when a single file cannot be deleted", async () => {
    const platform = createTestPlatform();
    const originalDelete = platform.deleteFile.bind(platform);
    platform.deleteFile = async (path: string) => {
      if (path.endsWith("app-2026-09-05.log")) throw new Error("EPERM");
      await originalDelete(path);
    };
    setPlatformService(platform);
    await platform.writeTextFile(`${logDir}/app-2026-09-05.log`, "x");
    await platform.writeTextFile(`${logDir}/app-2026-09-19.log`, "x");

    await cleanOldLogs();

    // The undeletable file stays, the other one is still removed.
    expect(await listDir(platform)).toEqual(["app-2026-09-05.log"]);
  });
});

describe("log file listing and reading", () => {
  const logDir = "/tmp/readany-feedback-test/logs";

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-27T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lists every .log file newest first and hides nothing", async () => {
    const platform = createTestPlatform();
    setPlatformService(platform);
    for (const name of [
      "app-2026-09-05.log",
      "app-2026-09-20.1.log",
      "app-2026-09-27.log",
      "readany-2026-09-05.log",
      "notes.txt",
    ]) {
      await platform.writeTextFile(`${logDir}/${name}`, "x");
    }

    const files = await listLogFiles();

    expect(files.map((file) => file.name)).toEqual([
      "app-2026-09-27.log",
      "app-2026-09-20.1.log",
      "readany-2026-09-05.log",
      "app-2026-09-05.log",
    ]);
    expect(files[0]?.isToday).toBe(true);
    expect(files[1]?.date).toBe("2026-09-20");
    // A 22-day-old survivor is exactly what this page has to make visible.
    expect(files.some((file) => file.name === "app-2026-09-05.log")).toBe(true);
  });

  it("reads a log file verbatim", async () => {
    const platform = createTestPlatform();
    setPlatformService(platform);
    await platform.writeTextFile(`${logDir}/app-2026-09-26.log`, "[raw] untouched content\n");

    await expect(readLogFile("app-2026-09-26.log")).resolves.toBe("[raw] untouched content\n");
  });

  it("refuses a name that could escape the log directory", async () => {
    setPlatformService(createTestPlatform());

    await expect(readLogFile("../../etc/passwd")).rejects.toThrow("Invalid log file name");
    await expect(readLogFile("sub/app-2026-09-26.log")).rejects.toThrow("Invalid log file name");
  });

  it("falls back to probing when the platform cannot list directories", async () => {
    const platform = createTestPlatform();
    (platform as { readDir?: IPlatformService["readDir"] }).readDir = undefined;
    setPlatformService(platform);
    await platform.writeTextFile(`${logDir}/app-2026-09-26.log`, "x");

    const files = await listLogFiles();

    expect(files.map((file) => file.name)).toEqual(["app-2026-09-26.log"]);
  });
});
