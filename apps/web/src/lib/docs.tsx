import type { ReactNode } from "react";

const anchor = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** A section heading with a "#" link to itself; shown on hover, always on touch screens. */
function H2({ children }: { children: string }) {
  const id = anchor(children);
  return (
    <h2 id={id} className="group scroll-mt-6">
      {children}
      <a
        href={`#${id}`}
        aria-label={`Link to ${children}`}
        className="text-muted-foreground! hover:text-foreground! ml-2 font-normal no-underline! opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
      >
        #
      </a>
    </h2>
  );
}

/** Lets a wide table scroll on its own instead of squeezing its columns. */
const Table = ({ children }: { children: ReactNode }) => (
  <div className="overflow-x-auto">
    <table className="min-w-xl">{children}</table>
  </div>
);

export const DOC_PAGES: Record<
  "overview" | "cli" | "format" | "harnesses" | "faq",
  { title: string; description: string; content: ReactNode }
> = {
  overview: {
    title: "Scheduled tasks",
    description: "Keep scheduled agent tasks in Git and sync them with your coding agent.",
    content: (
      <>
        <p>
          A schedule is a Markdown file in <code>.agents/schedules/</code>: a name, a cron time, and
          a prompt. It lives in Git next to your code.
        </p>
        <H2>Schedule a skill</H2>
        <pre>
          <code>{`npx skills add <owner/repo> --skill <skill>
npx agent-schedules schedule <skill> "0 7 * * 1"
npx agent-schedules push <harness>`}</code>
        </pre>
        <p>
          <code>npx skills add</code> installs the skill from{" "}
          <a href="https://skills.sh">skills.sh</a>. <code>schedule</code> writes a schedule that
          runs it, and <code>push</code> registers that with one of the{" "}
          <a href="/docs/harnesses">harnesses</a>. Read the skill before you schedule it: runs
          happen with nobody watching.
        </p>
        <H2>Write your own</H2>
        <p>
          Any prompt can run on a schedule. Write the file yourself in the{" "}
          <a href="/docs/format">file format</a>, then push it.
        </p>
        <H2>Keep files and apps in sync</H2>
        <p>
          <code>push</code> creates or updates a harness&apos;s tasks from your files.{" "}
          <code>pull</code> writes its tasks back to files. Neither deletes anything.{" "}
          <code>list</code> shows what is scheduled.
        </p>
      </>
    ),
  },
  cli: {
    title: "CLI",
    description: "Use the agent-schedules CLI to find, add, and sync schedules.",
    content: (
      <>
        <H2>search</H2>
        <p>
          Use the <code>search</code> command to find skills listed on schedules.sh, best first,
          with their install counts from skills.sh and the schedule suggested for each.
        </p>
        <pre>
          <code>{`npx agent-schedules search review`}</code>
        </pre>
        <p>
          <strong>Options</strong>
        </p>
        <pre>
          <code>{`Usage: agent-schedules search [options] [query...]

find skills worth scheduling on schedules.sh, best first

Arguments:
  query       words to match against names and descriptions

Options:
  -h, --help  display help for command`}</code>
        </pre>
        <hr />
        <H2>schedule</H2>
        <p>
          Use the <code>schedule</code> command to run an installed skill on a schedule. It finds
          the skill where <code>npx skills add</code> put it, in the repository or in your home
          folder, and writes a schedule whose prompt tells the agent to read the skill&apos;s{" "}
          <code>SKILL.md</code> and the files beside it. A name installed more than once, or not at
          all, is refused; pass the skill&apos;s folder to pick one.
        </p>
        <p>
          Run it again with another cron to change the time; a prompt you edited is kept. A skill
          that isn&apos;t committed is flagged, since tasks that run in a worktree or another clone
          won&apos;t find it. Then <code>push</code> the schedule.
        </p>
        <p>
          Install skills into the repository rather than with <code>-g</code> where you can. Claude
          Code and OpenCode can&apos;t read files outside the repository below{" "}
          <code>--access full</code>, so a push of a global skill to them is refused.
        </p>
        <pre>
          <code>{`npx agent-schedules schedule triage "0 8 * * 1-5"`}</code>
        </pre>
        <p>
          <strong>Options</strong>
        </p>
        <pre>
          <code>{`Usage: agent-schedules schedule [options] <skill> <cron>

run an installed skill on a schedule: writes its file in .agents/schedules

Arguments:
  skill              the skill's name, owner/repo/skill, or the path to its
                     folder
  cron               when it runs, such as '0 8 * * 1-5' or '0 8 1 * *'

Options:
  -n, --name <name>  name the schedule, to run one skill at several times
  -g, --global       use ~/.agents/schedules even inside a repository
  --dry-run          preview changes without writing anything
  -h, --help         display help for command`}</code>
        </pre>
        <hr />
        <H2>add (deprecated)</H2>
        <p>
          <code>add</code> copies schedules from a public GitHub repository into
          <code> .agents/schedules/</code>. schedules.sh lists skills now, so use{" "}
          <code>schedule</code> instead; <code>add</code> keeps working for repositories that still
          publish schedule files. Pass <code>owner/repo</code> for all of its schedules or
          <code> owner/repo/name</code> for one, and review the prompt before pushing.
        </p>
        <pre>
          <code>{`npx agent-schedules add <owner/repo/name>`}</code>
        </pre>
        <p>
          <strong>Options</strong>
        </p>
        <pre>
          <code>{`Usage: agent-schedules add [options] <source>

(deprecated) copy schedules from a public GitHub repository into
.agents/schedules

Arguments:
  source        owner/repo for all of its schedules, or owner/repo/name for one

Options:
  -g, --global  use ~/.agents/schedules even inside a repository
  --dry-run     preview changes without writing anything
  -h, --help    display help for command`}</code>
        </pre>
        <hr />
        <H2>pull</H2>
        <p>
          Use the <code>pull</code> command to write a harness&apos;s scheduled tasks to files. It
          asks which ones; pass names or <code>--all</code> to skip the question. Tasks whose timing
          the <a href="/docs/format">file format</a> can&apos;t express are skipped. A file with the
          same name is replaced; use <code>--dry-run</code> to see what would change.
        </p>
        <p>
          <code>--adopt</code> also binds each file to its task, the way a push does, so tasks you
          made in the app are managed from files from then on. A task bound to a file is written
          back to that file even after it is renamed in the app.
        </p>
        <pre>
          <code>{`npx agent-schedules pull t3 --adopt`}</code>
        </pre>
        <p>
          <strong>Options</strong>
        </p>
        <pre>
          <code>{`Usage: agent-schedules pull [options] <harness> [names...]

write the harness's scheduled tasks to .agents/schedules

Arguments:
  harness       the harness to sync with (choices: "t3", "codex-desktop",
                "claude-desktop", "codex", "claude-code", "pi", "opencode",
                "cursor-agent")
  names         schedules to sync, by name; omit to choose from a list

Options:
  -a, --all     sync every schedule without asking
  --adopt       bind the files to their tasks, so later pushes update those
                tasks
  -g, --global  use ~/.agents/schedules even inside a repository
  --dry-run     preview changes without writing anything
  --ssh <host>  run on this ssh host, which is remembered for list --all
  --cwd <dir>   run as if started in this folder
  -h, --help    display help for command`}</code>
        </pre>
        <hr />
        <H2>push</H2>
        <p>
          Use the <code>push</code> command to create or update a harness&apos;s tasks from your
          files. It asks which ones; pass names or <code>--all</code> to skip the question. It never
          deletes tasks, and a task that fails doesn&apos;t undo the others: the exit code is 1 when
          any did. See <a href="/docs/harnesses">harnesses</a> for what each one needs before a
          push.
        </p>
        <p>
          A push remembers which task each file went to, so the next push updates that task, even
          after the schedule is renamed. It keeps what the app owns: whether the task is paused, its
          model, its thread, and its worktree. A task deleted in the app is created again and the
          push says so. A task changed in the app since the last push is left alone and reported;
          pull it to keep the change, or pass <code>--force</code> to replace it.
        </p>
        <p>
          <a href="/docs/faq#why-do-we-need-to-push">Why do we need to push?</a>
        </p>
        <pre>
          <code>{`npx agent-schedules push t3`}</code>
        </pre>
        <p>
          <strong>Options</strong>
        </p>
        <pre>
          <code>{`Usage: agent-schedules push [options] <harness> [names...]

create or update the harness's scheduled tasks from .agents/schedules

Arguments:
  harness              the harness to sync with (choices: "t3", "codex-desktop",
                       "claude-desktop", "codex", "claude-code", "pi",
                       "opencode", "cursor-agent")
  names                schedules to sync, by name; omit to choose from a list

Options:
  -a, --all            sync every schedule without asking
  -m, --model <model>  model for the tasks this push creates or updates, such as
                       codex/gpt-6-astra for t3
  --access <level>     what scheduled runs may do (codex, claude-code, pi,
                       opencode, cursor-agent) (choices: "read", "edit", "full")
  --force              replace tasks that were changed in the harness since the
                       last push
  -g, --global         use ~/.agents/schedules even inside a repository
  --dry-run            preview changes without writing anything
  --ssh <host>         run on this ssh host, which is remembered for list --all
  --cwd <dir>          run as if started in this folder
  -h, --help           display help for command`}</code>
        </pre>
        <hr />
        <H2>list</H2>
        <p>
          Use the <code>list</code> command to see what is scheduled for this repository, whether
          each task is active, paused, missing from its scheduler, or gone since it was pushed, and
          its last run where the harness records one. Without a harness, the ones that aren&apos;t
          set up are skipped and named.
        </p>
        <p>
          <code>--all</code> lists every task each harness has, in every workspace, including ones
          made in the apps and triggers a file can&apos;t hold, such as T3 webhooks. It also asks
          each host <code>--ssh</code> has been used with, one connection per host. Listing never
          starts a run.
        </p>
        <pre>
          <code>{`npx agent-schedules list --all`}</code>
        </pre>
        <p>
          <strong>Options</strong>
        </p>
        <pre>
          <code>{`Usage: agent-schedules list [options] [harness]

show what is scheduled, whether it is active, and its last run

Arguments:
  harness       only this harness (choices: "t3", "codex-desktop",
                "claude-desktop", "codex", "claude-code", "pi", "opencode",
                "cursor-agent")

Options:
  -a, --all     every task in every workspace, here and on the hosts --ssh has
                used, including ones made in the apps
  --json        print the result as JSON, for other tools
  -g, --global  use ~/.agents/schedules even inside a repository
  --ssh <host>  run on this ssh host, which is remembered for list --all
  --cwd <dir>   run as if started in this folder
  -h, --help    display help for command`}</code>
        </pre>
        <p>
          <strong>JSON</strong>
        </p>
        <p>
          <code>--json</code> prints <code>version</code>, <code>tasks</code> and{" "}
          <code>warnings</code>. A harness or host that can&apos;t be read adds a warning, and the
          rest still list. Fields are only ever added within a version, and unknown values are{" "}
          <code>null</code>.
        </p>
        <pre>
          <code>{`{
  "version": 1,
  "tasks": [
    {
      "id": "codex-triage-3f2a9c1d7e4b",
      "harness": "codex",
      "host": null,
      "workspace": "/Users/me/code/app",
      "name": "triage",
      "prompt": "Use the triage skill: ...",
      "timing": { "cron": "0 8 * * 1-5", "description": "Weekdays 08:00" },
      "unsupported": null,
      "status": "active",
      "lastRun": { "at": "2026-11-02T08:00:41.000Z", "outcome": "ok" },
      "model": null,
      "access": "read",
      "options": { "model": true, "access": ["read", "edit", "full"] },
      "settings": {},
      "source": { "path": "/Users/me/code/app/.agents/schedules/triage.md", "exists": true },
      "actions": ["disable", "run-now", "remove", "push", "pull"]
    }
  ],
  "warnings": [{ "harness": "t3", "host": null, "message": "No T3 server has run ..." }]
}`}</code>
        </pre>
        <ul>
          <li>
            <code>id</code>: the scheduler&apos;s own id, which <code>--id</code> takes, together
            with <code>harness</code> and, for another machine, <code>--ssh</code> with its{" "}
            <code>host</code>.
          </li>
          <li>
            <code>status</code>: <code>active</code>, <code>paused</code>,{" "}
            <code>not scheduled</code> when cron lost the entry, or <code>missing</code> when the
            scheduler no longer has a task that was pushed.
          </li>
          <li>
            <code>unsupported</code>: why <code>timing</code> is null, such as an interval or a
            webhook trigger.
          </li>
          <li>
            <code>options</code>: whether a push takes <code>--model</code> and which{" "}
            <code>--access</code> levels; <code>settings</code>: what else the scheduler keeps, such
            as a thread or worktree.
          </li>
          <li>
            <code>source</code>: the file the task was pushed from or adopted into.
          </li>
          <li>
            <code>actions</code>: what can be done to it now, by command name.
          </li>
        </ul>
        <hr />
        <H2>enable, disable, run-now, remove</H2>
        <p>
          Use these commands to resume, pause, run once, or delete tasks. Name tasks in this
          repository, or pass <code>--id</code> for any task <code>list --all</code> shows. A push
          or a one-off run leaves a paused task paused. <code>remove</code>, also called{" "}
          <code>delete</code>, deletes the task from the harness and forgets which file it came
          from; the file stays unless you pass <code>--delete-source</code>, which is refused while
          another task is pushed from the same file. Each harness supports what its scheduler
          allows; see <a href="/docs/harnesses">harnesses</a>. <code>--json</code> prints one result
          per task.
        </p>
        <pre>
          <code>{`npx agent-schedules disable t3 "Morning brief"
npx agent-schedules run-now codex --id codex-triage-3f2a9c1d7e4b
npx agent-schedules remove claude-code triage --delete-source`}</code>
        </pre>
        <p>
          <strong>Options</strong>
        </p>
        <pre>
          <code>{`Usage: agent-schedules remove|delete [options] <harness> [names...]

delete tasks from the harness and forget them; schedule files stay

Arguments:
  harness          the harness that has the tasks (choices: "t3",
                   "codex-desktop", "claude-desktop", "codex", "claude-code",
                   "pi", "opencode", "cursor-agent")
  names            the tasks, by name, in this repository

Options:
  --id <id>        pick one task by the id list --all shows, in any workspace
  --json           print the result as JSON, for other tools
  -g, --global     use ~/.agents/schedules even inside a repository
  --dry-run        preview changes without writing anything
  --delete-source  delete the schedule file too, unless another task is pushed
                   from it
  --ssh <host>     run on this ssh host, which is remembered for list --all
  --cwd <dir>      run as if started in this folder
  -h, --help       display help for command`}</code>
        </pre>
        <p>
          <code>enable</code>, <code>disable</code> and <code>run-now</code> take the same options
          without <code>--delete-source</code>.
        </p>
        <hr />
        <H2>Remote machines</H2>
        <p>
          <code>--ssh &lt;host&gt;</code> runs any command on another machine, with{" "}
          <code>--cwd</code> for the repository there. The host needs Node.js; the CLI runs there as
          the same version, from a global install, the copy its cron jobs use, or npx. ssh never
          asks for a password, so use a key or an agent. Once a command succeeds there, the host is
          remembered, and <code>list --all</code> asks it too, even after its last task is removed.{" "}
          <code>agent-schedules hosts</code> shows them, and{" "}
          <code>agent-schedules hosts forget &lt;host&gt;</code> drops one.
        </p>
        <pre>
          <code>{`npx agent-schedules push codex --ssh devbox --cwd ~/code/app`}</code>
        </pre>
        <hr />
        <H2>doctor</H2>
        <p>
          Use the <code>doctor</code> command to check a harness&apos;s setup without changing any
          task. Each problem says how to fix it.
        </p>
        <pre>
          <code>{`npx agent-schedules doctor t3`}</code>
        </pre>
        <p>
          <strong>Options</strong>
        </p>
        <pre>
          <code>{`Usage: agent-schedules doctor [options] <harness>

check a harness's setup, without changing anything

Arguments:
  harness       the harness to check (choices: "t3", "codex-desktop",
                "claude-desktop", "codex", "claude-code", "pi", "opencode",
                "cursor-agent")

Options:
  -g, --global  use ~/.agents/schedules even inside a repository
  --ssh <host>  run on this ssh host, which is remembered for list --all
  --cwd <dir>   run as if started in this folder
  -h, --help    display help for command`}</code>
        </pre>
        <hr />
        <H2>Repository and home folder</H2>
        <p>
          Inside a repository, schedules live in its <code>.agents/schedules/</code> directory and
          tasks run in the repository. Outside one, or with <code>--global</code>, they live in{" "}
          <code>~/.agents/schedules/</code> and run in your home folder. In a Git worktree, the
          files come from that worktree and the tasks run in the main checkout.
        </p>
        <p>
          <code>push</code>, <code>pull</code>, <code>schedule</code>, <code>add</code> and{" "}
          <code>doctor</code> read every file in the folder first, so one that doesn&apos;t parse,
          or two with the same name, stops them until fixed. A name can be given in its filename
          form, <code>morning-brief</code> for <code>Morning brief</code>, as long as only one task
          matches. A pushed schedule keeps its task when renamed, since pushes remember which task
          each file went to.
        </p>
        <H2>Environment</H2>
        <ul>
          <li>
            <code>GITHUB_TOKEN</code> or <code>GH_TOKEN</code>: used by <code>add</code> for GitHub
            API lookups, which raises its rate limit.
          </li>
          <li>
            <code>AGENT_SCHEDULES_HOME</code>: where this CLI keeps its state on each machine: which
            task each file was pushed to, the hosts <code>--ssh</code> has used, and the
            command-line agents&apos; tasks, prompts and logs.
          </li>
          <li>
            <code>DO_NOT_TRACK=1</code>: see Telemetry below.
          </li>
        </ul>
        <H2>Telemetry</H2>
        <p>
          The CLI sends nothing about you. Versions before 0.3 reported each <code>add</code> from a
          public repository to schedules.sh; that endpoint is gone, and <code>DO_NOT_TRACK=1</code>{" "}
          still turns the report off in those versions.
        </p>
      </>
    ),
  },
  format: {
    title: "File format",
    description: "A schedule is a Markdown prompt with a small YAML frontmatter header.",
    content: (
      <>
        <pre>
          <code>{`---
name: Weekly dependency review
schedule: 0 7 * * 1
---

Review the repository for dependency updates.`}</code>
        </pre>
        <p>
          A schedule written by <code>schedule</code> also names the skill it runs:
        </p>
        <pre>
          <code>{`---
name: triage
schedule: 0 8 * * 1-5
skill: triage
---

Use the triage skill: read .agents/skills/triage/SKILL.md and follow it. ...`}</code>
        </pre>
        <ul>
          <li>
            <code>name</code>: one line, unique within the folder, with at least one letter or
            digit. It names the file too.
          </li>
          <li>
            <code>schedule</code>: <code>minute hour * * weekdays</code> in the harness&apos;s local
            time, or <code>minute hour day * *</code> for once a month. One minute (0 to 59) and one
            hour (0 to 23); the month stays <code>*</code>.
          </li>
          <li>
            <code>skill</code>, optional: the installed skill the prompt runs. Harnesses don&apos;t
            keep it; it tells <code>schedule</code> which file to update, and <code>pull</code>{" "}
            leaves it in place.
          </li>
          <li>
            The prompt is everything after the closing <code>---</code>, trimmed. It can&apos;t be
            empty.
          </li>
        </ul>
        <p>
          Weekdays use cron numbers, <code>0</code> for Sunday to <code>6</code> for Saturday (
          <code>7</code> is Sunday too), as a list (<code>1,3,5</code>), a range (<code>1-5</code>)
          or <code>*</code>. Steps and day names aren&apos;t supported. A monthly schedule names one
          day from <code>1</code> to <code>28</code>, so it comes every month, and keeps{" "}
          <code>*</code> for weekdays: <code>0 8 1 * *</code> runs at 08:00 on the 1st. T3 Code
          can&apos;t run monthly schedules; the other harnesses can. These three fields are the
          whole frontmatter; anything else is an error, and versions before 0.3 reject{" "}
          <code>skill</code>. <code>pull</code> and <code>add</code> write files in exactly this
          form, so keep your formatter away from <code>.agents/schedules/</code> and they will read
          as unchanged.
        </p>
      </>
    ),
  },
  harnesses: {
    title: "Harnesses",
    description:
      "The apps and command-line agents that run schedules, and what to know about each.",
    content: (
      <>
        <p>
          A harness is the app or command-line agent that runs your schedules. Pass its name to{" "}
          <code>push</code>, <code>pull</code>, <code>list</code> and <code>doctor</code>, for
          example <code>npx agent-schedules push codex</code>.
        </p>
        <H2>Every harness</H2>
        <ul>
          <li>
            A push copies the prompt into the harness. Editing the file changes nothing until you
            push again.
          </li>
          <li>
            <code>push</code> creates and updates tasks but never deletes them. It updates the task
            it pushed before and keeps whether that task is paused, its model, thread and worktree.
          </li>
          <li>
            <code>pull</code> skips tasks that aren&apos;t a time of day on chosen weekdays or one
            day a month.
          </li>
          <li>Pushing a schedule to two harnesses runs it twice.</li>
        </ul>
        <p>What each harness lets the CLI do to a task:</p>
        <Table>
          <thead>
            <tr>
              <th>Harness</th>
              <th>enable, disable</th>
              <th>run-now</th>
              <th>remove</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="whitespace-nowrap">
                <code>t3</code>
              </td>
              <td>Yes</td>
              <td>Yes</td>
              <td>Yes</td>
            </tr>
            <tr>
              <td className="whitespace-nowrap">
                <code>codex-desktop</code>
              </td>
              <td>Yes</td>
              <td>In the app</td>
              <td>Yes; automations shared by several workspaces in the app</td>
            </tr>
            <tr>
              <td className="whitespace-nowrap">
                <code>claude-desktop</code>
              </td>
              <td>With the app closed</td>
              <td>In the app</td>
              <td>With the app closed</td>
            </tr>
            <tr>
              <td className="whitespace-nowrap">Command-line agents</td>
              <td>Yes; a paused task leaves the crontab</td>
              <td>Yes, in the background</td>
              <td>Yes, with its prompt and logs</td>
            </tr>
          </tbody>
        </Table>
        <H2>Command-line agents</H2>
        <p>
          <code>codex</code>, <code>claude-code</code>, <code>pi</code>, <code>opencode</code> and{" "}
          <code>cursor-agent</code> have no scheduler of their own, so <code>push</code> adds each
          task to your crontab, and cron starts the agent in the repository with the saved prompt.
          They need macOS or Linux with cron; macOS has it, and on Linux install a cron daemon such
          as cronie if yours has none.
        </p>
        <ul>
          <li>
            <code>--access</code> sets what a run may do: <code>read</code>, <code>edit</code>{" "}
            files, or <code>full</code>. New tasks get <code>read</code>, and later pushes keep the
            level unless you pass another. Nobody is there to approve anything beyond it; the table
            below says what each level means for each agent.
          </li>
          <li>
            <code>--model</code> picks the model and is remembered for later pushes. Only{" "}
            <code>opencode</code> requires it.
          </li>
          <li>
            Runs can&apos;t see API keys that only your shell profile sets. Log in with the agent
            itself. <code>doctor</code> says whether the agent is installed and a version these
            integrations were verified with, then runs it once with a one-line prompt the way a
            scheduled run starts it, which uses a little of your quota.
          </li>
          <li>
            A run is stopped after an hour. A time that comes while the task&apos;s previous run is
            still going is skipped, and so is one that passes while your computer is asleep or off.
          </li>
          <li>If you reinstall or move the agent, remove the task and push it again.</li>
          <li>
            <code>list</code> shows whether each task is scheduled and how its last run went.{" "}
            <code>remove</code> unregisters a task. <code>doctor</code> prints the state folder;
            each task&apos;s prompt and logs are under <code>jobs/</code> in it.
          </li>
        </ul>
        <Table>
          <thead>
            <tr>
              <th>Harness</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="whitespace-nowrap">
                <code>codex</code>
              </td>
              <td>
                At <code>read</code> and <code>edit</code>, runs stay inside Codex&apos;s sandbox:
                no approvals, and neither your Codex config nor the repository&apos;s applies, so
                pass <code>--model</code> if you need a particular one.
              </td>
            </tr>
            <tr>
              <td className="whitespace-nowrap">
                <code>claude-code</code>
              </td>
              <td>
                At <code>read</code> and <code>edit</code>, commands are denied unless your
                user-level Claude Code settings allow them; the repository&apos;s settings, hooks
                and MCP servers aren&apos;t loaded. Files outside the repository, such as global
                skills, can&apos;t be read.
              </td>
            </tr>
            <tr>
              <td className="whitespace-nowrap">
                <code>pi</code>
              </td>
              <td>
                <code>read</code> allows only reading files. <code>edit</code> adds editing and
                writing anywhere on disk, without a shell.
              </td>
            </tr>
            <tr>
              <td className="whitespace-nowrap">
                <code>opencode</code>
              </td>
              <td>
                Needs <code>--model</code> on the first push. At <code>read</code> and{" "}
                <code>edit</code>, the shell, subagents and folders outside the repository are off,
                and the repository&apos;s <code>.opencode</code> folder isn&apos;t loaded. Runs go
                one at a time.
              </td>
            </tr>
            <tr>
              <td className="whitespace-nowrap">
                <code>cursor-agent</code>
              </td>
              <td>
                Trusts the repository so nothing waits on a prompt. <code>edit</code> runs in
                Cursor&apos;s sandbox, which keeps changes inside the repository and has no network.
              </td>
            </tr>
          </tbody>
        </Table>
        <H2>T3 Code</H2>
        <p>
          <code>t3</code>. Adds tasks to T3&apos;s own scheduler through the running T3 server.
        </p>
        <ul>
          <li>The first push adds the repository as a T3 project if it isn&apos;t one yet.</li>
          <li>
            New tasks need a model: the project&apos;s default, or <code>--model</code> with an id
            exactly as <code>doctor t3</code> lists it, such as <code>codex/gpt-6-astra</code>.
          </li>
          <li>New tasks run with full access, since nobody is there to approve tools.</li>
          <li>
            T3 runs tasks at a time on chosen weekdays, so a monthly schedule is refused rather than
            moved to another day; give it a weekly time for T3.
          </li>
          <li>Interval tasks have no fixed time; give them one in T3 to pull them.</li>
        </ul>
        <H2>Codex desktop (experimental)</H2>
        <p>
          <code>codex-desktop</code>. Adds tasks to the app&apos;s Scheduled page. An app update may
          need a newer agent-schedules.
        </p>
        <ul>
          <li>
            Verified on macOS only; see <a href="#linux">Linux</a>.
          </li>
          <li>
            The app picks the model and access itself; <code>--model</code> and{" "}
            <code>--access</code> are rejected. Open the app once before the first push.
          </li>
          <li>The app has to be open and your computer awake for tasks to run.</li>
          <li>
            Push reports whether the app loaded each task, which needs <code>sqlite3</code>. Run{" "}
            <code>doctor codex-desktop</code> to check again later.
          </li>
          <li>
            Automations shared by several workspaces aren&apos;t changed; edit those in Codex.
          </li>
          <li>Tasks attached to a thread can&apos;t be pulled.</li>
        </ul>
        <H2>Claude Desktop (experimental)</H2>
        <p>
          <code>claude-desktop</code>. Adds tasks to the app&apos;s scheduled tasks. An app update
          may need a newer agent-schedules.
        </p>
        <ul>
          <li>
            Verified on macOS only; see <a href="#linux">Linux</a>.
          </li>
          <li>
            The app picks the model itself; <code>--model</code> and <code>--access</code> are
            rejected.
          </li>
          <li>The app has to be open and your computer awake for tasks to run.</li>
          <li>Quit the app before pushing, pausing or removing, or it overwrites the change.</li>
          <li>
            New tasks use your Claude Code permission mode. In Manual, a run waits for each tool you
            haven&apos;t allowed: click <strong>Run now</strong> and choose{" "}
            <strong>Always allow</strong>, or change the task&apos;s mode in the app. Push and{" "}
            <code>doctor claude-desktop</code> say which mode applies.
          </li>
          <li>One-time and manual tasks can&apos;t be pulled.</li>
        </ul>
        <H2>Linux</H2>
        <p>
          <code>codex-desktop</code> and <code>claude-desktop</code> are verified on macOS only.
          With a Linux build of either app they are untested: <code>codex-desktop</code> needs{" "}
          <code>sqlite3</code> to confirm each task, and <code>doctor claude-desktop</code> reads{" "}
          <code>CLAUDE_USER_DATA_DIR</code> when the app keeps its data elsewhere.
        </p>
      </>
    ),
  },
  faq: {
    title: "FAQ",
    description: "Answers about adding, ranking, and synchronizing schedules.",
    content: (
      <>
        <H2>Why do we need to push?</H2>
        <p>
          Harnesses don&apos;t read <code>.agents/schedules/</code> yet. Run{" "}
          <code>npx agent-schedules push &lt;harness&gt;</code> to register your schedules with your
          harness. Run it again after editing a schedule to update the registered task.
        </p>
        <H2>Where do the listed skills come from?</H2>
        <p>
          From <a href="https://skills.sh">skills.sh</a>, the directory of agent skills. Every hour
          schedules.sh reads the most installed skills there and asks a decision model which of them
          do useful work on a timer, who should run them, and how often. Tools you point at
          something, guides an agent follows while working, and one-time setup steps are left out.
          Skills that pass are listed with their install counts from skills.sh; forks and skills
          that failed a security audit there are left out. To get a skill listed, publish it as a
          skill on GitHub and let it be installed through skills.sh. Nothing is submitted here.
        </p>
        <H2>How are skills ranked?</H2>
        <p>
          By how much is gained from scheduling them, weighted by how many people installed them.
          &quot;For you&quot; shows skills each person runs for their own work; &quot;For your
          team&quot; shows skills one run serves everyone with. A skill that works both ways is in
          both.
        </p>
        <H2>Does schedules.sh record installs?</H2>
        <p>
          No. Install counts come from skills.sh. Nothing on this site records what you add or run.
        </p>
        <H2>Will pushing to two harnesses run a task twice?</H2>
        <p>Yes. Each harness you push to runs its own copy, so push to one.</p>
      </>
    ),
  },
};
