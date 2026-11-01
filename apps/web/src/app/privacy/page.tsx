import { pageMetadata } from "@/lib/site";
import { LegalPage } from "@/components/legal-page";

export const metadata = {
  ...pageMetadata({
    title: "Privacy",
    path: "/privacy",
    description: "Privacy policy for schedules.sh.",
  }),
  robots: { index: false },
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="October 28, 2026">
      <p>
        JLN LABS LTD operates schedules.sh and is responsible for your personal data. Contact{" "}
        <a href="mailto:support@schedules.sh">support@schedules.sh</a> for privacy questions or
        requests.
      </p>
      <h2>Data and purposes</h2>
      <p>
        We process IP addresses and request information to operate and protect the site, based on
        our legitimate interests: to limit how often one address can send feedback, report a
        listing, or look up a payment. We store a keyed hash of the address rather than the address
        itself, and those entries expire within minutes. We use cookieless usage statistics to
        improve the site and public listing data from skills.sh and GitHub to maintain the
        directory.
      </p>
      <p>
        The directory records nothing about who installs or schedules a skill. Install counts shown
        here are read from skills.sh.
      </p>
      <p>
        Stripe handles sponsorship payments and collects the required billing details. We use
        listing and subscription records to fulfil sponsorship contracts and meet legal accounting
        obligations. Sponsor listings are public.
      </p>
      <p>
        The directory shows the public GitHub user or organisation name of each listed repository.
        Removing the schedule files from the repository removes it from the directory; owners can
        also contact us. Reports and feedback sent through the site are anonymous and are kept while
        we handle them.
      </p>
      <h2>Sharing and retention</h2>
      <p>
        Our hosting, analytics, database and payment providers process relevant data. Transfers
        outside the European Economic Area rely on adequacy decisions or standard contractual
        clauses where required. Contact us for details of these safeguards.
      </p>
      <p>
        We retain usage and directory records while operating the directory, and sponsorship and
        billing records for administration and applicable legal retention requirements.
      </p>
      <h2>Your rights</h2>
      <p>
        Where applicable, you may request access, correction, deletion, restriction or portability
        of your personal data, or object to its processing. Contact us to exercise these rights.
      </p>
      <h2>Changes</h2>
      <p>We may update this policy and will change the date above when we do.</p>
    </LegalPage>
  );
}
