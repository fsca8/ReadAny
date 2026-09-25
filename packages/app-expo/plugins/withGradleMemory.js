const { withDangerousMod, withGradleProperties } = require("@expo/config-plugins");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

/**
 * Build-resource tuning for local Android builds.
 *
 * Two independent problems are handled here, both of which made a 4-core /
 * 16GB machine unusable during a build:
 *
 *  1. Gradle's heap and worker count were hard-coded, and the value suited
 *     neither a small laptop (too big: the box swaps) nor a large CI runner
 *     (too small). Now derived from the machine.
 *
 *  2. All four Android ABIs were compiled. The whole native toolchain —
 *     CMake/ninja/clang, Hermes, every codegen target — runs once per ABI, so
 *     four ABIs is roughly 4x the work and 4x the peak memory of one. Physical
 *     devices are almost always arm64-v8a.
 *
 * Both live in app.config-plugins rather than only in android/gradle.properties,
 * because that directory is generated: a `prebuild --clean` would silently
 * undo them and the build cost would jump back up with no visible cause.
 *
 * EAS/release builds are unaffected — EAS prebuilds in the cloud from source,
 * and Play Store releases still need the 32-bit ABIs.
 *
 * `org.gradle.jvmargs` is plugin-owned: it is a machine-derived resource
 * setting, not a user preference. Any untagged value in the generated file
 * (the Expo template default, or a stale hand edit) is replaced by the
 * computed one. Worker count and daemon timeout are also managed, but a
 * hand-written value for those is respected.
 */

const MANAGED_TAG = "readany-gradle-memory";

/** Idle daemon is reclaimed after this timeout in ms (mirrors ~/.gradle/gradle.properties). */
const DAEMON_IDLE_TIMEOUT_MS = "180000";

/**
 * gradle.properties is parsed as a Java .properties file, where `#` only starts
 * a comment on a line of its own — an inline `value # tag` corrupts the *value*
 * (observed on Gradle 8.14: `org.gradle.workers.max=4 # readany-gradle-memory`
 * → "Value '4 # readany-gradle-memory' given for org.gradle.workers.max Gradle
 * property is invalid", which aborts the build before a single task runs).
 * The tag therefore lives on the line *above* the property it marks.
 */
const tagFor = (key) => `# ${MANAGED_TAG}: ${key}`;
const isTagLine = (line) => line.trim().startsWith("#") && line.includes(MANAGED_TAG);
const keyOf = (line) => line.split("=")[0]?.trim();
const isPropertyLine = (line) => {
  const trimmed = line.trim();
  return trimmed !== "" && !trimmed.startsWith("#") && trimmed.includes("=");
};

const heapMbFor = (totalBytes) => {
  // Explicit override wins — e.g. READANY_GRADLE_HEAP_MB=6144 for a heavy
  // release build on a box with plenty of spare RAM.
  const override = Number.parseInt(process.env.READANY_GRADLE_HEAP_MB ?? "", 10);
  if (Number.isFinite(override) && override > 0) return override;
  const totalMb = Math.floor(totalBytes / (1024 * 1024));
  const quarter = Math.floor(totalMb / 4);
  return Math.max(1024, Math.min(4096, Math.floor(quarter / 512) * 512));
};

const desiredMemory = () => {
  const total = typeof os.totalmem === "function" ? os.totalmem() : 4 * 1024 ** 3;
  const heap = heapMbFor(total);
  const metaspace = Math.max(256, Math.min(1024, Math.floor(heap / 4)));
  const workers = Math.max(1, Math.min(4, os.cpus()?.length ?? 2));
  return {
    // Bare values: the caller owns the `key=` prefix.
    jvmargs: `-Xmx${heap}m -XX:MaxMetaspaceSize=${metaspace}m`,
    workers: String(workers),
  };
};

/**
 * Drop every property line this plugin wrote (any version of it) and report
 * which managed keys a human set by hand — those are left untouched, so a local
 * override survives `prebuild --clean`.
 */
const stripManaged = (source, managedKeys) => {
  const lines = source.split(/\r?\n/);
  const kept = [];
  const humanKeys = new Set();
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (isTagLine(line)) {
      // Ours: the tag, plus the property line directly underneath it.
      if (index + 1 < lines.length && isPropertyLine(lines[index + 1])) index += 1;
      continue;
    }
    // Legacy format: the tag was appended inline, which is exactly what broke
    // Gradle. Recognise it so the broken value cannot survive a re-prebuild.
    if (line.includes(MANAGED_TAG)) continue;
    // `org.gradle.jvmargs` is machine-derived, never a user preference: this
    // plugin owns it unconditionally. Any untagged line (the Expo template
    // default, or a stale hand edit) is dropped and replaced by the computed
    // value below. Matching on the *value* instead was brittle — it silently
    // overwrote anyone who happened to pick the same number deliberately.
    if (isPropertyLine(line) && keyOf(line) === "org.gradle.jvmargs") {
      continue;
    }
    kept.push(line);
    // jvmargs is plugin-owned and already handled above, so a surviving line
    // here is only reportable for the keys we may skip below.
    if (
      isPropertyLine(line) &&
      managedKeys.has(keyOf(line)) &&
      keyOf(line) !== "org.gradle.jvmargs"
    ) {
      humanKeys.add(keyOf(line));
    }
  }
  return { lines: kept, humanKeys };
};

const withGradleMemory = (config) =>
  withDangerousMod(config, [
    "android",
    (cfg) => {
      const gradlePropertiesPath = path.join(
        cfg.modRequest.platformProjectRoot,
        "gradle.properties",
      );
      const source = fs.existsSync(gradlePropertiesPath)
        ? fs.readFileSync(gradlePropertiesPath, "utf8")
        : "";

      const managedKeys = new Set([
        "org.gradle.jvmargs",
        "org.gradle.workers.max",
        "org.gradle.daemon.idletimeout",
      ]);
      const { lines, humanKeys } = stripManaged(source, managedKeys);

      const { jvmargs, workers } = desiredMemory();
      for (const [key, value] of [
        ["org.gradle.jvmargs", jvmargs],
        ["org.gradle.workers.max", workers],
        ["org.gradle.daemon.idletimeout", DAEMON_IDLE_TIMEOUT_MS],
      ]) {
        if (humanKeys.has(key)) continue;
        lines.push(tagFor(key), `${key}=${value}`);
      }

      fs.writeFileSync(gradlePropertiesPath, lines.join("\n"));
      return cfg;
    },
  ]);

const ALL_ABIS = ["armeabi-v7a", "arm64-v8a", "x86", "x86_64"];

/**
 * Which ABIs to compile locally. Defaults to arm64-v8a only (any modern
 * physical device); set READANY_ANDROID_ABIS=all for the full set.
 */
const androidAbis = () => {
  const requested = process.env.READANY_ANDROID_ABIS?.trim();
  if (!requested || requested.toLowerCase() === "all") return ALL_ABIS.join(",");
  return requested;
};

const withAndroidAbis = (config) =>
  withGradleProperties(config, (cfg) => {
    // Expo hands us the parsed gradle.properties entries on cfg.modResults and
    // expects the same array (mutated) back. Removing any existing entry first
    // keeps this idempotent instead of appending a duplicate each prebuild.
    const existing = Array.isArray(cfg.modResults) ? cfg.modResults : [];
    const withoutAbis = existing.filter(
      (item) => !(item.type === "property" && item.key === "reactNativeArchitectures"),
    );
    withoutAbis.push({
      type: "property",
      key: "reactNativeArchitectures",
      value: androidAbis(),
    });
    cfg.modResults = withoutAbis;
    return cfg;
  });

module.exports = (config) => withAndroidAbis(withGradleMemory(config));
module.exports.heapMbFor = heapMbFor;
module.exports.androidAbis = androidAbis;
