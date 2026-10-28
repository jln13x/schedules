import Link from "next/link";
import { pageMetadata } from "@/lib/site";
import { LegalPage } from "@/components/legal-page";

export const metadata = {
  ...pageMetadata({
    title: "Terms",
    path: "/terms",
    description: "Terms of use for schedules.sh.",
  }),
  robots: { index: false },
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms" updated="October 27, 2026">
      <p>
        JLN LABS LTD operates schedules.sh, including its website, API, and the{" "}
        <code>agent-schedules</code> command-line tool. By using any of them you agree to these
        terms. Sponsorships are covered by the <Link href="/sponsor/terms">sponsorship terms</Link>.
      </p>
      <h2>Schedules are third-party content</h2>
      <p>
        schedules.sh lists schedule files found in public GitHub repositories. They are written by
        their authors, not by us, and we do not review, endorse, or guarantee them. Read a prompt
        before you push it. Your agent runs it under your own accounts, credentials, and
        permissions, and you are responsible for what it does.
      </p>
      <h2>Listings</h2>
      <p>
        By keeping schedule files in a public repository you allow us to index, store, display, and
        count installs of them. Remove the files from the repository to take them down, or contact
        us. We may decline or remove any listing at any time, including for unlawful, harmful, or
        misleading content, spam, or manipulated install counts.
      </p>
      <h2>Acceptable use</h2>
      <p>
        Do not inflate install counts, circumvent rate limits, submit false reports, or use the
        site, API, or tool to harm others. We may block access without notice.
      </p>
      <h2>No warranty and limited liability</h2>
      <p>
        The site, API, tool, and every listed schedule are provided as is, without warranty of any
        kind, including availability, accuracy, or fitness for a purpose. To the extent the law
        allows, we are not liable for any loss or damage arising from their use, and our total
        liability to you is limited to the amount you paid us in the preceding twelve months.
      </p>
      <h2>Changes</h2>
      <p>
        We may update these terms and will change the date above when we do. Continued use after a
        change means you accept it.
      </p>
      <h2>Contact</h2>
      <p>
        Questions and removal requests go to{" "}
        <a href="mailto:support@schedules.sh">support@schedules.sh</a>.
      </p>
    </LegalPage>
  );
}
