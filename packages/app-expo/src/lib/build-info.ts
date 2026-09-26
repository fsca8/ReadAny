/**
 * Build identity of the running mobile app.
 *
 * `extra.commitHash` is written by app.config.js at bundle time — the same
 * `extra` block that already carries `appVariant`. Expo embeds the resolved
 * config in the app package (verified: `assets/app.config` inside the shipped
 * APK contains the `extra` object), so `Constants.expoConfig` is populated in
 * release builds and the hash travels with the binary.
 */
import { formatVersionLabel } from "@readany/core/services";
import Constants from "expo-constants";

/** Short commit hash of the running build ("dev" when the bundle carries none). */
export function readCommitHash(): string {
  const extra = Constants.expoConfig?.extra as { commitHash?: string } | undefined;
  return extra?.commitHash ?? "dev";
}

/** Version label with the commit hash, e.g. `1.4.1+991640b2`. */
export function currentVersionLabel(): string {
  return formatVersionLabel({
    version: Constants.expoConfig?.version ?? "1.0.0",
    commit: readCommitHash(),
  });
}
