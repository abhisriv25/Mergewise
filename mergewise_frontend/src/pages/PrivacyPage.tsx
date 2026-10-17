import type { ReactNode } from "react";
import { ContactLine, DocSection, DocumentPage, GlanceCard } from "../components/PublicLayout";
import { EyeOffIcon, LockIcon, ServerIcon, ShieldCheckIcon } from "../components/icons";
import { usePageTitle } from "../lib/use-page-title";

const HIGHLIGHTS = [
  { icon: <EyeOffIcon size={16} />, title: "No source code stored", text: "We keep file names and line counts — never file contents or diffs." },
  { icon: <LockIcon size={16} />, title: "Read-only access", text: "Mergewise can't push, comment, merge or change anything." },
  { icon: <ShieldCheckIcon size={16} />, title: "No ads, no tracking", text: "No analytics or advertising cookies. We don't sell data." },
  { icon: <ServerIcon size={16} />, title: "Encrypted at rest", text: "Stored in an encrypted, private database on AWS." },
];

const SECTIONS = [
  { id: "what-we-collect", title: "What we collect" },
  { id: "what-we-dont", title: "What we don't collect" },
  { id: "how-we-use-it", title: "How we use it" },
  { id: "cookies", title: "Cookies" },
  { id: "where-its-stored", title: "Where it's stored" },
  { id: "ai", title: "AI features" },
  { id: "retention", title: "How long we keep it" },
  { id: "your-choices", title: "Your choices" },
  { id: "changes", title: "Changes and contact" },
];

export function PrivacyPage() {
  usePageTitle("Privacy policy");
  return (
    <DocumentPage
      eyebrow="Privacy policy"
      title="Your code stays yours."
      aside={<GlanceCard title="At a glance" items={HIGHLIGHTS} />}
      sections={SECTIONS}
      intro={
        <>
          Mergewise helps teams decide which pull requests need a careful review. To do that it needs a small amount
          of information from GitHub. This page explains exactly what we collect, why, and what we never touch.
        </>
      }
    >
      <DocSection id="what-we-collect" title="What we collect">
        <p>When you sign in with GitHub, we store:</p>
        <ul>
          <li>
            <span>
              <strong>Your GitHub profile basics</strong> — your GitHub user ID, username, display name and avatar URL.
              We ask GitHub only for the <code className="font-mono text-[13px] text-slate-700 dark:text-slate-300">read:user</code> scope.
            </span>
          </li>
          <li>
            <span>
              <strong>Your workspace</strong> — the organization Mergewise creates for you and your role in it.
            </span>
          </li>
        </ul>
        <p>When you connect repositories through the Mergewise GitHub App, we store:</p>
        <ul>
          <li>
            <span>
              <strong>Repository details</strong> — owner, name, whether it's private, and the installation it belongs to.
            </span>
          </li>
          <li>
            <span>
              <strong>Pull request metadata</strong> — title, description, author username, branch names, commit IDs,
              state, timestamps, and how many lines and files changed.
            </span>
          </li>
          <li>
            <span>
              <strong>Risk assessments</strong> — the score, the rules that fired, and the <em>paths</em> of the files
              that triggered them (for example <code className="font-mono text-[13px] text-slate-700 dark:text-slate-300">src/auth/login.js</code>).
            </span>
          </li>
          <li>
            <span>
              <strong>Webhook events</strong> — the notifications GitHub sends when a pull request changes, which contain
              pull request and repository metadata.
            </span>
          </li>
        </ul>
      </DocSection>

      <DocSection id="what-we-dont" title="What we don't collect">
        <ul>
          <li>
            <span>
              <strong>Your source code.</strong> We never store file contents or diffs. To score a pull request we
              ask GitHub for its list of changed files; GitHub's reply includes short diff snippets, which we discard
              immediately — only the file paths are kept.
            </span>
          </li>
          <li>
            <span>
              <strong>Your GitHub password or access token.</strong> Sign-in happens on GitHub. The token GitHub gives
              us is used once to read your profile and then discarded.
            </span>
          </li>
          <li>
            <span>
              <strong>Repositories you didn't choose.</strong> The GitHub App only sees repositories you explicitly
              grant it, and you can change that selection at any time.
            </span>
          </li>
          <li>
            <span>
              <strong>Analytics or advertising data.</strong> There are no trackers, pixels or third-party analytics.
            </span>
          </li>
        </ul>
      </DocSection>

      <DocSection id="how-we-use-it" title="How we use it">
        <p>
          Only to run Mergewise: to sign you in, show your repositories and pull requests, and calculate risk scores.
          We don't sell your data, use it for advertising, or share it with anyone except the service providers
          listed below.
        </p>
      </DocSection>

      <DocSection id="cookies" title="Cookies">
        <p>
          Mergewise sets <strong>one cookie</strong>, <code className="font-mono text-[13px] text-slate-700 dark:text-slate-300">devpulse.sid</code>,
          to keep you signed in. It's HTTP-only (scripts can't read it), sent only over HTTPS, and expires after 7
          days or when you sign out. There are no other cookies.
        </p>
      </DocSection>

      <DocSection id="where-its-stored" title="Where it's stored and who processes it">
        <ul>
          <li>
            <span>
              <strong>Amazon Web Services</strong> (United States, us-east-1) — runs the Mergewise server and its
              encrypted PostgreSQL database. The database isn't reachable from the internet.
            </span>
          </li>
          <li>
            <span>
              <strong>Vercel</strong> — serves the website and forwards its requests to the Mergewise server.
            </span>
          </li>
          <li>
            <span>
              <strong>GitHub</strong> — handles sign-in and is the source of repository and pull request data.
            </span>
          </li>
          <li>
            <span>
              <strong>Google Fonts</strong> — delivers the typeface this site uses, so Google sees a request from your
              browser when fonts load.
            </span>
          </li>
        </ul>
        <p>
          Server logs record which pages and API routes were requested. Session cookies, access tokens and webhook
          signatures are removed before anything is written to the logs.
        </p>
      </DocSection>

      <DocSection id="ai" title="AI features">
        <p>
          The AI review feature isn't switched on. When it is, the relevant pull request metadata and documentation
          excerpts will be sent to an AI model provider to generate the review. We'll update this page to name that
          provider <strong>before</strong> the feature is enabled.
        </p>
      </DocSection>

      <DocSection id="retention" title="How long we keep it">
        <ul>
          <li>
            <span>
              <strong>Sign-in sessions</strong> expire after 7 days, or immediately when you sign out.
            </span>
          </li>
          <li>
            <span>
              <strong>Account, repository and pull request data</strong> is kept while you use Mergewise, so your
              history and risk scores stay available.
            </span>
          </li>
          <li>
            <span>
              <strong>Database backups</strong> are kept for 7 days.
            </span>
          </li>
        </ul>
      </DocSection>

      <DocSection id="your-choices" title="Your choices">
        <ul>
          <Choice title="Stop Mergewise reading repositories">
            Uninstall the Mergewise app or remove repositories under <em>GitHub → Settings → Applications → Installed
            GitHub Apps</em>. We stop receiving updates immediately.
          </Choice>
          <Choice title="Revoke sign-in access">
            Under <em>GitHub → Settings → Applications → Authorized OAuth Apps</em>.
          </Choice>
          <Choice title="Get a copy or ask us to delete your data">
            To do this, <ContactLine />. We'll delete your account and everything linked to it.
          </Choice>
        </ul>
      </DocSection>

      <DocSection id="changes" title="Changes and contact">
        <p>
          If we change how Mergewise handles data, we'll update this page and the date at the top. For any privacy
          question, <ContactLine />.
        </p>
      </DocSection>
    </DocumentPage>
  );
}

function Choice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li>
      <span>
        <strong>{title}.</strong> {children}
      </span>
    </li>
  );
}
