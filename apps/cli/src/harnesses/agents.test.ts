import { expect, test } from "bun:test";
import { AGENTS } from "./agents.ts";

test("agents get their access level and the prompt where they read it", () => {
  expect(AGENTS.codex.invoke("Hi", "edit", undefined)).toEqual({
    args: [
      "exec",
      "--skip-git-repo-check",
      "--sandbox",
      "workspace-write",
      "-c",
      'approval_policy="never"',
      "--ignore-rules",
      "--ignore-user-config",
    ],
    stdin: "Hi",
  });
  expect(AGENTS.codex.invoke("Hi", "full", undefined).args).not.toContain("--ignore-rules");
  expect(AGENTS["claude-code"].invoke("Hi", "read", "opus").args).toEqual([
    "-p",
    "--permission-mode",
    "dontAsk",
    "--setting-sources",
    "user",
    "--strict-mcp-config",
    "--model",
    "opus",
  ]);
  expect(AGENTS["claude-code"].invoke("Hi", "full", undefined).args).not.toContain(
    "--strict-mcp-config",
  );
  expect(AGENTS.pi.invoke("-x", "read", undefined)).toEqual({
    args: ["-p", "--tools", "read"],
    stdin: "-x",
  });
  const opencode = AGENTS.opencode.invoke("Hi", "read", "openai/gpt");
  expect(
    JSON.parse(opencode.env?.OPENCODE_CONFIG_CONTENT ?? "{}").agent.schedules.permission.bash,
  ).toBe("deny");
  expect(AGENTS.opencode.retryable?.("Error: database is locked")).toBe(true);
  expect(AGENTS.opencode.retryable?.("Error: model not found")).toBe(false);
  expect(AGENTS.opencode.failed?.('{"type":"text"}\n{"type":"error"}')).toBe(true);
  expect(AGENTS.opencode.failed?.('{"type":"text"}')).toBe(false);
  expect(AGENTS["cursor-agent"].invoke("-x", "edit", undefined)).toEqual({
    args: ["-p", "--trust", "--output-format", "text", "--force", "--sandbox", "enabled"],
    stdin: "-x",
  });
  expect(AGENTS.opencode.invoke("Hi", "read", "m/m").env?.OPENCODE_DISABLE_PROJECT_CONFIG).toBe(
    "1",
  );
  expect(
    AGENTS.opencode.invoke("Hi", "full", "m/m").env?.OPENCODE_DISABLE_PROJECT_CONFIG,
  ).toBeUndefined();
  expect(AGENTS["cursor-agent"].invoke("Hi", "read", "gpt-5").args).toContain("ask");
});

const permission = (access: "read" | "edit" | "full") =>
  JSON.parse(AGENTS.opencode.invoke("Hi", access, "m/m").env?.OPENCODE_CONFIG_CONTENT ?? "{}").agent
    .schedules.permission as Record<string, string>;

test("OpenCode read and edit deny anything not named, including subagents", () => {
  for (const access of ["read", "edit"] as const) {
    expect(permission(access)["*"]).toBe("deny");
    expect(permission(access).task).toBe("deny");
    expect(permission(access).bash).toBe("deny");
    expect(permission(access).read).toBe("allow");
  }

  expect(permission("read").edit).toBe("deny");
  expect(permission("edit").edit).toBe("allow");
  expect(permission("full")["*"]).toBe("allow");
});
