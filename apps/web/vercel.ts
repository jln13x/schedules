import type { VercelConfig } from "@vercel/config/v1";
import ROOT_PACKAGE from "../../package.json" with { type: "json" };

// Vercel's image ships its own Bun; this is how it documents using a pinned one.
const BUN = `bunx ${ROOT_PACKAGE.packageManager}`;

export const config: VercelConfig = {
  installCommand: `${BUN} install --frozen-lockfile`,
  buildCommand: `${BUN} run build`,
  git: { deploymentEnabled: false },
  crons: [{ path: "/api/sync", schedule: "0 5 * * *" }],
  // Umami on our own origin, so blockers that match its host still count visits.
  rewrites: [{ source: "/u/:path*", destination: "https://umami.jlnlabs.com/:path*" }],
};
