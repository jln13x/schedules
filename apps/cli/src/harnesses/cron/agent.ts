/** How much a scheduled run may do. Nobody is there to approve tools, so it's fixed when pushing. */
export const ACCESS = ["read", "edit", "full"] as const;
export type Access = (typeof ACCESS)[number];

interface Invocation {
  readonly args: ReadonlyArray<string>;
  /** Sent on stdin, which is closed either way so nothing waits for input. */
  readonly stdin?: string;
  readonly env?: Readonly<Record<string, string>>;
}

/** An agent CLI that has no scheduler of its own, and how cron starts it for a run nobody watches. */
export interface Agent {
  readonly label: string;
  /** Names the CLI is installed under, the preferred one first. */
  readonly binaries: ReadonlyArray<string>;
  /** Where its own docs explain setting it up; this CLI never installs it. */
  readonly setup: string;
  /** Agents that fall back to an unexpected model without one. */
  readonly requiresModel: boolean;
  readonly invoke: (prompt: string, access: Access, model: string | undefined) => Invocation;
  /** What an access level leaves to the agent's own settings, shown when pushing. */
  readonly limits?: Partial<Record<Access, string>>;
  /** Some agents exit 0 after a failed run; this reads their output for the real result. */
  readonly failed?: (output: string) => boolean;
  /** Agents that can't run twice at once, such as ones that lock a local database. */
  readonly oneAtATime?: boolean;
  /** A failure worth retrying, judged from the run's output. */
  readonly retryable?: (output: string) => boolean;
}

export const withModel = (flag: string, model: string | undefined) => (model ? [flag, model] : []);
