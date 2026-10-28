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
        <H2>Install a schedule</H2>
        <pre>
          <code>{`npx agent-schedules add <owner/repo/name>
npx agent-schedules push <harness>`}</code>
        </pre>
        <p>
          <code>add</code> copies the file into your repository. Read the prompt, then{" "}
          <code>push</code> registers it with one of the <a href="/docs/harnesses">harnesses</a>.
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
          Use the <code>search</code> command to find schedules listed on schedules.sh. Results are
          sorted by installs and show the <code>owner/repo/name</code> to pass to <code>add</code>.
        </p>
        <pre>
          <code>{`npx agent-schedules search review`}</code>
        </pre>
        <p>
          <strong>Options</strong>
        </p>
        <pre>
          <code>{`Usage: agent-schedules search [options] [query...]

find schedules on schedules.sh, most installed first

Arguments:
  query       words to match against names and prompts

Options:
  -h, --help  display help for command`}</code>
        </pre>
        <hr />
        <H2>add</H2>
        <p>
          Use the <code>add</code> command to copy schedules from a public GitHub repository into
          <code> .agents/schedules/</code>. Pass <code>owner/repo</code> for all of its schedules or
          <code> owner/repo/name</code> for one. Review the prompt before pushing.
        </p>
        <pre>
          <code>{`npx agent-schedules add <owner/repo/name>`}</code>
        </pre>
        <p>
          <strong>Options</strong>
        </p>
        <pre>
          <code>{`Usage: agent-schedules add [options] <source>

copy schedules from a public GitHub repository into .agents/schedules

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
        <pre>
          <code>{`npx agent-schedules pull t3`}</code>
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
  -g, --global  use ~/.agents/schedules even inside a repository
  --dry-run     preview changes without writing anything
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
  -g, --global         use ~/.agents/schedules even inside a repository
  --dry-run            preview changes without writing anything
  -h, --help           display help for command`}</code>
        </pre>
        <hr />
        <H2>list</H2>
        <p>
          Use the <code>list</code> command to see what is scheduled for this repository, whether
          each task is active, paused, or missing from its scheduler, and its last run where the
          harness records one. Without a harness, the ones that aren&apos;t set up are skipped and
          named.
        </p>
        <pre>
          <code>{`npx agent-schedules list`}</code>
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
  -a, --all     every repository on this machine, for the harnesses this CLI
                schedules
  -g, --global  use ~/.agents/schedules even inside a repository
  -h, --help    display help for command`}</code>
        </pre>
        <hr />
        <H2>remove</H2>
        <p>
          Use the <code>remove</code> command to unregister a command-line agent&apos;s scheduled
          runs and delete their saved prompt and logs. A run already going finishes. Tasks in an app
          are removed in the app.
        </p>
        <pre>
          <code>{`npx agent-schedules remove codex "Morning brief"`}</code>
        </pre>
        <p>
          <strong>Options</strong>
        </p>
        <pre>
          <code>{`Usage: agent-schedules remove [options] <harness> <names...>

stop and delete scheduled runs (codex, claude-code, pi, opencode, cursor-agent)

Arguments:
  harness       the harness that runs them (choices: "t3", "codex-desktop",
                "claude-desktop", "codex", "claude-code", "pi", "opencode",
                "cursor-agent")
  names         the schedules to remove

Options:
  -g, --global  use ~/.agents/schedules even inside a repository
  -h, --help    display help for command`}</code>
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
          <code>push</code>, <code>pull</code>, <code>add</code> and <code>doctor</code> read every
          file in the folder first, so one that doesn&apos;t parse, or two with the same name, stops
          them until fixed. A name can be given in its filename form, <code>morning-brief</code> for{" "}
          <code>Morning brief</code>, as long as only one task matches. Renaming a schedule leaves
          the old task in place until you remove it.
        </p>
        <H2>Environment</H2>
        <ul>
          <li>
            <code>GITHUB_TOKEN</code> or <code>GH_TOKEN</code>: used by <code>add</code> for GitHub
            API lookups, which raises its rate limit.
          </li>
          <li>
            <code>AGENT_SCHEDULES_HOME</code>: where the command-line agents&apos; tasks, prompts
            and logs are kept.
          </li>
          <li>
            <code>DO_NOT_TRACK=1</code>: see below.
          </li>
        </ul>
        <H2>Telemetry</H2>
        <p>
          When <code>add</code> writes a schedule from a public repository, it sends that
          schedule&apos;s <code>owner/repo/name</code> to schedules.sh, which records the install
          and its time, nothing about you. Unchanged files and <code>--dry-run</code> send nothing.
          Set <code>DO_NOT_TRACK=1</code> to opt out.
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
        <ul>
          <li>
            <code>name</code>: one line, unique within the folder, with at least one letter or
            digit. It names the file too.
          </li>
          <li>
            <code>schedule</code>: <code>minute hour * * weekdays</code> in the harness&apos;s local
            time. One minute (0 to 59) and one hour (0 to 23); day of month and month stay{" "}
            <code>*</code>.
          </li>
          <li>
            The prompt is everything after the closing <code>---</code>, trimmed. It can&apos;t be
            empty.
          </li>
        </ul>
        <p>
          Weekdays use cron numbers, <code>0</code> for Sunday to <code>6</code> for Saturday (
          <code>7</code> is Sunday too), as a list (<code>1,3,5</code>), a range (<code>1-5</code>)
          or <code>*</code>. Steps and day names aren&apos;t supported. These two fields are the
          whole frontmatter; anything else is an error. <code>pull</code> and <code>add</code> write
          files in exactly this form, so keep your formatter away from{" "}
          <code>.agents/schedules/</code> and they will read as unchanged.
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
            <code>push</code> creates and updates tasks but never deletes them.
          </li>
          <li>
            <code>pull</code> skips tasks that aren&apos;t a time of day on chosen weekdays.
          </li>
          <li>Pushing a schedule to two harnesses runs it twice.</li>
        </ul>
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
                and MCP servers aren&apos;t loaded.
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
          <li>Quit the app before pushing, or it overwrites the change.</li>
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
        <H2>Are GitHub installs anonymous?</H2>
        <p>
          Yes. An install records which schedule was added and when, nothing about you. Set{" "}
          <code>DO_NOT_TRACK=1</code> to opt out.
        </p>
        <H2>How do schedules get listed and ranked?</H2>
        <p>
          Put files under <code>.agents/schedules/</code> in a public GitHub repository and{" "}
          <a href="/submit">submit it</a>. Each file is named after its schedule, so{" "}
          <code>Daily review</code> lives in <code>daily-review.md</code>; a file named otherwise is
          skipped. Listed repositories are re-read from GitHub daily; a renamed repository moves to
          its new name with its installs, and its old links keep working. All time ranks by total
          installs, Trending by installs in the last seven days.
        </p>
        <H2>Will pushing to two harnesses run a task twice?</H2>
        <p>Yes. Each harness you push to runs its own copy, so push to one.</p>
      </>
    ),
  },
};
