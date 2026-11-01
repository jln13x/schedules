import { SITE } from "@/lib/site";
export function GET() {
  return new Response(
    `# schedules.sh\n\nA directory of agent skills worth running on a schedule, with the cadence that suits each. Skills come from skills.sh; schedules.sh adds the judgement of which ones make good recurring tasks, for whom, and how often.\n\nInstall a skill: npx skills add <owner/repo> --skill <name>\nSchedule it: npx agent-schedules schedule <name> "<cron>"\nRegister with your agent: npx agent-schedules push <harness>\nHarnesses: t3, codex-desktop, claude-desktop, codex, claude-code, pi, opencode, cursor-agent. The command-line agents are scheduled with cron.\nSearch: ${SITE.origin}/api/search?q=<words>&fit=you|team\n\n- [Overview](${SITE.origin}/docs)\n- [CLI](${SITE.origin}/docs/cli)\n- [Format](${SITE.origin}/docs/format)\n- [Harnesses](${SITE.origin}/docs/harnesses)\n- [FAQ](${SITE.origin}/docs/faq)\n`,
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
}
