import { describe, expect, it } from "vitest";

import { formatVersionLabel } from "./platform";

describe("formatVersionLabel", () => {
  it("appends the commit hash so a reported version traces back to its code", () => {
    expect(formatVersionLabel({ version: "1.4.1", commit: "991640b2" })).toBe("1.4.1+991640b2");
  });

  it("keeps the -dirty marker used by the release script's artifact names", () => {
    expect(formatVersionLabel({ version: "1.4.1", commit: "991640b2-dirty" })).toBe(
      "1.4.1+991640b2-dirty",
    );
  });

  it("falls back to the bare version when the build carries no commit", () => {
    expect(formatVersionLabel({ version: "1.4.1", commit: "" })).toBe("1.4.1");
  });
});
