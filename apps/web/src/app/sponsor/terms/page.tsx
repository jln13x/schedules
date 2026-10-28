import Link from "next/link";
import { pageMetadata } from "@/lib/site";
import { LegalPage } from "@/components/legal-page";

export const metadata = {
  ...pageMetadata({
    title: "Sponsorship terms",
    path: "/sponsor/terms",
    description: "Terms for sponsoring schedules.sh.",
  }),
  robots: { index: false },
};

export default function SponsorTermsPage() {
  return (
    <LegalPage title="Sponsorship terms" updated="October 27, 2026">
      <p>
        These terms apply to sponsoring schedules.sh, operated by JLN LABS LTD. They add to the site{" "}
        <Link href="/terms">terms</Link>. Sponsorship is offered to businesses only. By sponsoring
        you confirm that you act on behalf of a business and not as a consumer.
      </p>
      <h2>Placement</h2>
      <p>
        A sponsorship is one row pinned above the leaderboard on the homepage, labelled as sponsored
        and shown on every visit, including searches. Sponsorship never affects the organic ranking,
        the search API, or llms.txt. We may change the placement as schedules.sh evolves. We will
        notify you, and if a change does not work for you, you may cancel and receive a prorated
        refund for unused time.
      </p>
      <h2>No guarantees</h2>
      <p>
        We do not guarantee traffic, impressions, clicks, installs, or any other result, and we are
        not liable for downtime or interruptions.
      </p>
      <h2>Your listing</h2>
      <p>
        You provide a name, a one-line description, and a link. You confirm that you hold the rights
        to them, that they are lawful and not misleading, and that the link leads to the product
        described and will keep doing so. We may shorten the description to fit the row. We may
        decline a listing that does not fit the audience and refund unused time.
      </p>
      <h2>Removal</h2>
      <p>
        We may remove a listing immediately and without refund for malware, phishing, deceptive
        content, changing the link to a different product, or any other breach of these terms.
      </p>
      <h2>Fees and billing</h2>
      <p>
        Sponsorship is a monthly subscription billed in advance through Stripe. Prices exclude
        applicable taxes. Cancel any time through the billing portal or by contacting us; your row
        stays up until the end of the paid period. If a payment fails and is not resolved within
        Stripe&apos;s retry period, the sponsorship ends.
      </p>
      <h2>Replacement</h2>
      <p>
        We may end a sponsorship to accept a higher rate from another sponsor. We will notify you
        and refund the unused part of your paid period.
      </p>
      <h2>Liability</h2>
      <p>
        You are responsible for claims arising from your listing and will cover our costs from them.
        To the extent the law allows, our total liability to you is limited to the fees you paid for
        the current billing period.
      </p>
      <h2>Changes</h2>
      <p>
        We may update these terms and will change the date above when we do. We will notify active
        sponsors by email. Continuing the subscription after a change means you accept it.
      </p>
      <h2>Governing law</h2>
      <p>
        These terms are governed by the laws of the Republic of Cyprus, and the courts of Cyprus
        have exclusive jurisdiction over any dispute arising from them.
      </p>
      <h2>Contact</h2>
      <p>
        <a href="mailto:support@schedules.sh">support@schedules.sh</a>
      </p>
    </LegalPage>
  );
}
