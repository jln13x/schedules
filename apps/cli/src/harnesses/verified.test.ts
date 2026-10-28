import { expect, it } from "bun:test";
import { compareVersions, verifiedLine, versionNumber } from "./verified.ts";

it("reads the number out of each agent's version output", () => {
  expect(versionNumber("codex-cli 0.164.0")).toBe("0.164.0");
  expect(versionNumber("2.1.310 (Claude Code)")).toBe("2.1.310");
  expect(versionNumber("2026.09.02-c22c1a3")).toBe("2026.09.02");
  expect(versionNumber(undefined)).toBeUndefined();
});

it("compares versions by segment, not by string", () => {
  expect(compareVersions("0.164.0", "0.9.0")).toBeGreaterThan(0);
  expect(compareVersions("2.1.310", "2.1.311")).toBeLessThan(0);
  expect(compareVersions("1.0", "1.0.0")).toBe(0);
});

it("says whether the installed version is verified", () => {
  expect(verifiedLine("codex", "codex-cli 0.165.0")).toBe("verified: 0.165.0 (2026-10-28)");
  expect(verifiedLine("codex", "codex-cli 0.170.0")).toContain("0.170.0 is newer and unverified");
  expect(verifiedLine("codex", undefined)).toContain("installed version unknown");
  expect(verifiedLine("pi", "pi 1.0.0")).toContain("installed 1.0.0 is older");
});
