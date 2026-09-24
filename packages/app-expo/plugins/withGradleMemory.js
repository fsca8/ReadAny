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
 */

const MANAGED_TAG = "readany-gradle-memory";

const heapMbFor = (totalBytes) => {
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
    jvmargs: `org.gradle.jvmargs=-Xmx${heap}m -XX:MaxMetaspaceSize=${metaspace}m`,
    workers: `org.gradle.workers.max=${workers}`,
  };
};

const isManaged = (line) => line.includes(MANAGED_TAG);
const keyOf = (line) => line.split("=")[0]?.trim();

/**
 * Set `key` to `value`, unless an unmanaged line already sets it.
 * Lines this plugin wrote previously are tagged with MANAGED_TAG and may be
 * updated; anything else was set deliberately by a human and is left alone, so
 * a local override survives `prebuild --clean`.
 */
const applyKey = (lines, key, value) => {
  const pattern = new RegExp(`^\\s*${key.replace(/\./g, "\\.")}\\s*=`);
  const index = lines.findIndex((line) => pattern.test(line));
  if (index === -1) {
    lines.push(`${value} # ${MANAGED_TAG}`);
    return lines;
  }
  if (isManaged(lines[index])) {
    lines[index] = `${value} # ${MANAGED_TAG}`;
  }
  return lines;
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

      const managedKeys = new Set(["org.gradle.jvmargs", "org.gradle.workers.max"]);
      let lines = source
        .split(/\r?\n/)
        // Drop managed lines for keys we no longer manage, so a renamed key
        // cannot leave a stale duplicate behind.
        .filter((line) => !(isManaged(line) && !managedKeys.has(keyOf(line))));

      const { jvmargs, workers } = desiredMemory();
      lines = applyKey(lines, "org.gradle.jvmargs", jvmargs);
      lines = applyKey(lines, "org.gradle.workers.max", workers);

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
