import { SITE } from "@/lib/site";
export function GET() {
  return new Response(
    `# schedules.sh\n\nSchedules are Markdown prompts with YAML frontmatter in .agents/schedules/<slug>.md. They define a name and a local-time cron schedule.\n\nInstall: npx agent-schedules add <owner/repo/name>\nRegister: npx agent-schedules push <harness>\nHarnesses: t3, codex-desktop, claude-desktop, codex, claude-code, pi, opencode, cursor-agent. The command-line agents are scheduled with systemd or cron on Linux and launchd on macOS.\nExport: npx agent-schedules pull <harness>\n\n- [Overview](${SITE.origin}/docs)\n- [CLI](${SITE.origin}/docs/cli)\n- [Format](${SITE.origin}/docs/format)\n- [Harnesses](${SITE.origin}/docs/harnesses)\n- [FAQ](${SITE.origin}/docs/faq)\n`,
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
}
