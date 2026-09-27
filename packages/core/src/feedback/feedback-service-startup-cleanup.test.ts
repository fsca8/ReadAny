/**
 * Regression test for the startup-cleanup ordering bug.
 *
 * Both apps call `installFeedbackLogCapture()` at module scope and register the
 * platform service later (desktop: main.tsx:32 vs main.tsx:41; mobile: App.tsx:64
 * vs App.tsx:97). The cleanup that fires at install time therefore ran before any
 * platform service existed and threw "PlatformService not initialized" — caught and
 * reduced to a `[Logs] cleanup failed` warning, which made it a silent no-op on
 * every cold start (that is how `app-2026-09-05.log` outlived a 7-day retention).
 *
 * This file needs a module registry with no platform service registered yet, which
 * is why it lives in its own file (vitest isolates modules per file) — the platform
 * is deliberately set *after* the cleanup call, mirroring the app's real order.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IPlatformService } from "../services/platform";
import { setPlatformService } from "../services/platform";
import { cleanOldLogs } from "./feedback-service";

const LOG_DIR = "/tmp/readany-feedback-startup-test/logs";

/** Only the members the cleanup path touches. */
function createPlatform() {
  const files = new Set<string>();
  const platform = {
    getAppDataDir: async () => "/tmp/readany-feedback-startup-test",
    joinPath: async (...parts: string[]) => parts.join("/").replace(/\/+/g, "/"),
    mkdir: async () => {},
    exists: async (path: string) => files.has(path),
    deleteFile: async (path: string) => {
      files.delete(path);
    },
    readDir: async (path: string) => {
      const prefix = path.endsWith("/") ? path : `${path}/`;
      return [...files]
        .filter((file) => file.startsWith(prefix))
        .map((file) => file.slice(prefix.length))
        .filter((name) => name.length > 0 && !name.includes("/"));
    },
    writeTextFile: async (path: string, content: string) => {
      files.add(path);
      void content;
    },
  };
  return platform as unknown as IPlatformService & {
    writeTextFile: (path: string, content: string) => Promise<void>;
  };
}

describe("startup cleanup before the platform service exists", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-27T12:00:00.000Z"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("waits for the platform service instead of failing, then enforces retention", async () => {
    const platform = createPlatform();
    await platform.writeTextFile(`${LOG_DIR}/app-2026-09-05.log`, "x"); // 22 days old → delete
    await platform.writeTextFile(`${LOG_DIR}/app-2026-09-27.log`, "x"); // today → keep

    // The app's real order: cleanup runs at module init, the platform is registered
    // a moment later.
    const pending = cleanOldLogs();
    setPlatformService(platform);
    await pending;

    expect(await platform.exists(`${LOG_DIR}/app-2026-09-05.log`)).toBe(false);
    expect(await platform.exists(`${LOG_DIR}/app-2026-09-27.log`)).toBe(true);
  });
});
