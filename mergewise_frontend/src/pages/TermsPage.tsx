import { Link } from "react-router-dom";
import { ContactLine, DocSection, DocumentPage, GlanceCard } from "../components/PublicLayout";
import { AlertIcon, EyeOffIcon, LockIcon, LogOutIcon } from "../components/icons";
import { usePageTitle } from "../lib/use-page-title";

const SECTIONS = [
  { id: "the-service", title: "The service" },
  { id: "your-account", title: "Your account" },
  { id: "your-content", title: "Your content" },
  { id: "acceptable-use", title: "Acceptable use" },
  { id: "no-warranty", title: "Risk scores are guidance" },
  { id: "ending", title: "Stopping and changes" },
];

const KEY_POINTS = [
  { icon: <AlertIcon size={16} />, title: "Early-stage, as-is", text: "Features may change and the service may occasionally be down." },
  { icon: <EyeOffIcon size={16} />, title: "Your code stays yours", text: "We only use the data described in the privacy policy." },
  { icon: <LockIcon size={16} />, title: "Scores are guidance", text: "They help you prioritise reviews, not replace them." },
  { icon: <LogOutIcon size={16} />, title: "Leave any time", text: "Uninstall the GitHub App and Mergewise stops immediately." },
];

export function TermsPage() {
  usePageTitle("Terms of service");
  return (
    <DocumentPage
      eyebrow="Terms of use"
      title="Simple terms, plainly written."
      intro="The short version: Mergewise is an early-stage project, provided as-is. Use its risk scores to guide reviews, not to replace them."
      aside={<GlanceCard title="The short version" items={KEY_POINTS} />}
      sections={SECTIONS}
    >
      <DocSection id="the-service" title="The service">
        <p>
          Mergewise connects to GitHub repositories you choose and scores their pull requests by risk. It's a
          work in progress: features may change, and the service may occasionally be unavailable.
        </p>
      </DocSection>

      <DocSection id="your-account" title="Your account">
        <p>
          You sign in with your GitHub account and must follow{" "}
          <a href="https://docs.github.com/site-policy/github-terms/github-terms-of-service" target="_blank" rel="noreferrer" className="text-emerald-700 dark:text-emerald-300 hover:underline">
            GitHub's Terms of Service
          </a>
          . Only connect repositories you're allowed to share with a third-party tool.
        </p>
      </DocSection>

      <DocSection id="your-content" title="Your content">
        <p>
          Your code and pull requests remain yours. Mergewise only uses the data described in the{" "}
          <Link to="/privacy" className="text-emerald-700 dark:text-emerald-300 hover:underline">
            Privacy policy
          </Link>
          , and only to provide the service.
        </p>
      </DocSection>

      <DocSection id="acceptable-use" title="Acceptable use">
        <ul>
          <li>
            <span>Don't try to access data from repositories or workspaces that aren't yours.</span>
          </li>
          <li>
            <span>Don't overload, probe or disrupt the service or its infrastructure.</span>
          </li>
          <li>
            <span>Don't use Mergewise for anything unlawful.</span>
          </li>
        </ul>
      </DocSection>

      <DocSection id="no-warranty" title="Risk scores are guidance">
        <p>
          Scores come from automated rules and can miss real problems or flag safe changes. Mergewise is provided
          <strong> "as is", without warranties</strong>, and the creators aren't liable for decisions made using it.
          Always review code with your team's own judgement.
        </p>
      </DocSection>

      <DocSection id="ending" title="Stopping and changes">
        <p>
          You can stop using Mergewise at any time by uninstalling the GitHub App. We may update these terms as the
          project grows and will change the date above when we do. Questions? <ContactLine />.
        </p>
      </DocSection>
    </DocumentPage>
  );
}
