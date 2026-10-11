import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertIcon,
  ArrowRightIcon,
  CheckIcon,
  ChevronDownIcon,
  DatabaseIcon,
  DiffIcon,
  EyeOffIcon,
  FlaskIcon,
  GithubIcon,
  LayersIcon,
  LockIcon,
  PackageIcon,
  PullRequestIcon,
  RepoIcon,
  ServerIcon,
  ShieldCheckIcon,
  SparkleIcon,
} from "../components/icons";
import { GridLines, PAGE_CONTAINER, PublicLayout } from "../components/PublicLayout";
import { Reveal } from "../components/Reveal";
import { ScoreLab } from "../components/ScoreLab";
import { RISK_META, RiskBadge, ScoreComposition, ScoreRing } from "../components/risk";
import { buttonClasses, cx } from "../components/ui";
import { githubLoginUrl, type RiskLevel, type RiskSignal } from "../lib/api";
import { SITE } from "../lib/site";

// Every number on this page comes from the backend's risk-rules.config.ts,
// so the marketing copy can't drift from what the engine actually does.

const QUEUE: { number: number; title: string; author: string; repo: string; risk: RiskLevel; score: number; age: string }[] = [
  { number: 482, title: "Rework session refresh to avoid token race", author: "priyaverma", repo: "acme/api", risk: "HIGH", score: 60, age: "12m" },
  { number: 118, title: "Rotate IAM role for deploy pipeline", author: "m-okafor", repo: "acme/infra", risk: "MEDIUM", score: 35, age: "1h" },
  { number: 479, title: "Add pagination to /pull-requests", author: "jrs-dev", repo: "acme/api", risk: "MEDIUM", score: 30, age: "2h" },
  { number: 481, title: "Bump eslint to 9.12", author: "priyaverma", repo: "acme/web", risk: "LOW", score: 10, age: "3h" },
  { number: 477, title: "Fix typo in onboarding email copy", author: "kwan-oss", repo: "acme/web", risk: "LOW", score: 0, age: "5h" },
];

/** Manifest/lockfile ecosystems the dependency rule recognises. */
const ECOSYSTEMS = [
  { name: "npm", file: "package.json" },
  { name: "Yarn", file: "yarn.lock" },
  { name: "pnpm", file: "pnpm-lock.yaml" },
  { name: "pip", file: "requirements.txt" },
  { name: "Poetry", file: "poetry.lock" },
  { name: "Go", file: "go.mod" },
  { name: "Cargo", file: "Cargo.toml" },
  { name: "Bundler", file: "Gemfile" },
  { name: "Maven", file: "pom.xml" },
  { name: "Gradle", file: "build.gradle" },
];

const SIGNALS: { icon: ReactNode; title: string; points: string; text: string; example: string }[] = [
  {
    icon: <LockIcon size={18} />,
    title: "Sensitive code",
    points: "+20",
    text: "Changes under auth, security, payments, billing, secrets or IAM — matched on exact path segments, never substrings.",
    example: "src/auth/session.ts",
  },
  {
    icon: <DatabaseIcon size={18} />,
    title: "Database migrations",
    points: "+15",
    text: "Schema changes are the hardest thing to roll back, so anything in a migrations directory is flagged.",
    example: "db/migrations/0042_tokens.sql",
  },
  {
    icon: <FlaskIcon size={18} />,
    title: "Missing tests",
    points: "+15",
    text: "Code changed but no test file did. Nothing verifies the new behaviour.",
    example: "0 of 7 files are tests",
  },
  {
    icon: <PackageIcon size={18} />,
    title: "Dependency changes",
    points: "+10",
    text: "Manifests and lockfiles across npm, Yarn, pnpm, pip, Poetry, Go, Cargo, Bundler, Maven and Gradle.",
    example: "package-lock.json",
  },
  {
    icon: <DiffIcon size={18} />,
    title: "Diff size",
    points: "0–30",
    text: "Additions plus deletions, bucketed. Big diffs hide small mistakes.",
    example: "+412 −96 lines",
  },
  {
    icon: <LayersIcon size={18} />,
    title: "Files touched",
    points: "0–30",
    text: "Changes spread across many files are harder to reason about as a whole.",
    example: "23 files changed",
  },
];

const STEPS = [
  {
    icon: <RepoIcon size={20} />,
    title: "Connect your repositories",
    text: "Sign in with GitHub and install the Mergewise GitHub App on just the repositories you choose. Access is read-only.",
    detail: ["acme/api", "acme/web", "acme/infra"],
  },
  {
    icon: <PullRequestIcon size={20} />,
    title: "Every PR is scored on open",
    text: "GitHub notifies Mergewise the moment a pull request is opened or updated. The engine scores it 0–100 within seconds.",
    detail: ["opened", "synchronize", "reopened"],
  },
  {
    icon: <ShieldCheckIcon size={20} />,
    title: "Review where it counts",
    text: "Your queue is sorted by risk, and every score shows the files and rules behind it. No black box.",
    detail: ["Critical", "High", "Medium", "Low"],
  },
];

const EXAMPLE_SIGNALS: RiskSignal[] = [
  { code: "SENSITIVE_PATH", triggered: true, points: 20, explanation: "", evidence: ["src/auth/session.ts"] },
  { code: "MIGRATION_CHANGE", triggered: true, points: 15, explanation: "", evidence: ["db/migrations/0042_tokens.sql"] },
  { code: "NO_TEST_FILES", triggered: true, points: 15, explanation: "", evidence: [] },
  { code: "DIFF_SIZE", triggered: true, points: 10, explanation: "", evidence: [] },
];

const BREAKDOWN = [
  { icon: <LockIcon size={14} />, label: "Sensitive code", detail: "src/auth/session.ts", points: 20 },
  { icon: <DatabaseIcon size={14} />, label: "Database migration", detail: "db/migrations/0042_tokens.sql", points: 15 },
  { icon: <FlaskIcon size={14} />, label: "No tests changed", detail: "0 of 7 files are tests", points: 15 },
  { icon: <DiffIcon size={14} />, label: "Diff size", detail: "+412 −96 lines", points: 10 },
];

const LEVELS: { level: RiskLevel; range: string; meaning: string }[] = [
  { level: "LOW", range: "0–24", meaning: "Skim it" },
  { level: "MEDIUM", range: "25–49", meaning: "Normal review" },
  { level: "HIGH", range: "50–74", meaning: "Careful look" },
  { level: "CRITICAL", range: "75–100", meaning: "Senior reviewer" },
];

const TRUST = [
  {
    icon: <EyeOffIcon size={20} />,
    title: "We never store your code",
    text: "Mergewise reads file names and diff stats to score a PR. Source code is never written to our database.",
  },
  {
    icon: <LockIcon size={20} />,
    title: "Read-only GitHub App",
    text: "Mergewise can't push, comment, merge or change settings. It only sees the repositories you pick.",
  },
  {
    icon: <ShieldCheckIcon size={20} />,
    title: "Verified webhooks",
    text: "Every event from GitHub is checked against its signature and de-duplicated before it's processed.",
  },
  {
    icon: <ServerIcon size={20} />,
    title: "Versioned, traceable scores",
    text: "Each score is stamped with the engine version that produced it, so a change is always explainable.",
  },
  {
    icon: <GithubIcon size={20} />,
    title: "Protected sign-in",
    text: "GitHub sign-in and app installation are CSRF-checked and rate-limited, and sessions live in HttpOnly cookies.",
  },
  {
    icon: <SparkleIcon size={20} />,
    title: "AI reads your docs, not your code",
    text: "When AI review launches, it will only read your repo's README and docs, and only for Medium-risk PRs and above.",
  },
];

const FAQS: { q: string; a: ReactNode }[] = [
  {
    q: "Does Mergewise read or store my source code?",
    a: "No source code is stored. To score a pull request, the engine only needs which files changed and how many lines were added or removed — the same summary you see at the top of a GitHub diff.",
  },
  {
    q: "Do you use AI to score pull requests?",
    a: "No, and that's on purpose. The score comes from transparent rules, so it's predictable, auditable and identical every time. AI is being added to explain risky pull requests in plain English, grounded in your own docs. It will never change the score.",
  },
  {
    q: "What access does the GitHub App need?",
    a: "Read-only access to the repositories you select during installation, and nothing else. Mergewise can't push code, comment, approve, merge, or change repository settings. You can remove it at any time from your GitHub settings.",
  },
  {
    q: "How exactly is the score calculated?",
    a: "Six documented rules each add points: sensitive paths (+20), migrations (+15), no test changes (+15), dependency changes (+10), and diff size and file count (0–30 each, bucketed). The total is capped at 100 and mapped to Low, Medium, High or Critical.",
  },
  {
    q: "Will it block merges or post comments on my PRs?",
    a: "No. Mergewise is advisory: it helps reviewers decide where to spend their attention, and never changes anything on GitHub.",
  },
  {
    q: "What happens when someone pushes new commits?",
    a: "GitHub sends a webhook and the pull request is scored again. Every score is stamped with the engine version that produced it, so you can always tell why a number changed.",
  },
  {
    q: "Which languages and frameworks are supported?",
    a: "All of them. The rules look at file paths and diff sizes, not syntax. Dependency detection recognises manifests and lockfiles for npm, Yarn, pnpm, pip, Poetry, Go, Cargo, Bundler, Maven and Gradle.",
  },
];

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const oauthFailed = searchParams.get("error") === "oauth_failed";

  return (
    <PublicLayout backdrop={<LandingBackdrop />}>
      <main>
        <Hero oauthFailed={oauthFailed} />
        <EcosystemStrip />
        <TryItSection />
        <SignalsSection />
        <HowItWorksSection />
        <ScoreSection />
        <AiSection />
        <SecuritySection />
        <FaqSection />
        <FinalCta />
      </main>
    </PublicLayout>
  );
}

/* ───────────────────────────── Hero ───────────────────────────── */

const NEXT_STEPS = [
  { title: "Sign in with GitHub", detail: "about 10 seconds" },
  { title: "Pick repos to watch", detail: "read-only access" },
  { title: "PRs get scored", detail: "automatically" },
];

/** Sets expectations right under the sign-in button, so nobody hesitates
 * over what happens after they click it. */
function WhatHappensNext() {
  return (
    <div className="mt-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">What happens next</p>
      <ol className="mt-3 flex flex-wrap justify-center gap-x-6 gap-y-3 lg:justify-start">
        {NEXT_STEPS.map((step, i) => (
          <li key={step.title} className="flex items-center gap-2.5 text-left">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white dark:bg-white dark:text-slate-900">
              {i + 1}
            </span>
            <span>
              <span className="block whitespace-nowrap text-[13px] font-medium leading-tight text-slate-900 dark:text-white">
                {step.title}
              </span>
              <span className="block whitespace-nowrap text-[11px] text-slate-500">{step.detail}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Shown when GitHub sends people back with ?error=oauth_failed: the usual
 * causes, and a one-click retry. */
function SignInError() {
  return (
    <div
      role="alert"
      className="mx-auto mt-8 max-w-lg animate-shake rounded-2xl border border-rose-200 bg-rose-50 p-4 text-left lg:mx-0 dark:border-rose-400/20 dark:bg-rose-500/10"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
          <AlertIcon size={15} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-rose-800 dark:text-rose-200">Sign-in didn't complete</p>
          <p className="mt-1 text-[13px] leading-relaxed text-rose-700/90 dark:text-rose-200/80">
            This usually means the GitHub window was cancelled, or the sign-in link expired. Nothing was changed on
            your account, so it's safe to try again.
          </p>
          <a
            href={githubLoginUrl()}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-400"
          >
            <GithubIcon size={13} /> Try again
          </a>
        </div>
      </div>
    </div>
  );
}

function Hero({ oauthFailed }: { oauthFailed: boolean }) {
  return (
    <section className={cx(PAGE_CONTAINER, "pb-16 pt-14 sm:pt-20")}>
      <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
        <div className="animate-fade-in-up text-center lg:text-left">
          <a
            href="#ai"
            className="group inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 py-1 pl-1 pr-3 text-xs font-medium text-slate-700 shadow-sm backdrop-blur transition-colors hover:border-indigo-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:shadow-none dark:hover:border-indigo-400/40"
          >
            <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              <SparkleIcon size={10} /> Coming soon
            </span>
            AI review: rules score it, AI explains it
            <ArrowRightIcon size={12} className="text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </a>

          <h1 className="mt-7 text-5xl font-semibold leading-[1.03] tracking-[-0.04em] text-slate-900 sm:text-6xl xl:text-7xl dark:text-white">
            Review what matters.{" "}
            <span className="bg-gradient-to-r from-emerald-600 via-teal-500 to-sky-600 bg-clip-text text-transparent dark:from-emerald-300 dark:via-teal-200 dark:to-sky-300">
              Skim the rest.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-slate-600 lg:mx-0 dark:text-slate-400">
            Mergewise scores every pull request against real risk signals — sensitive code, migrations, dependencies,
            missing tests — so your team spends review time where it counts.
          </p>

          {oauthFailed && <SignInError />}

          <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <GithubCta />
            <a href="#try" className={buttonClasses("outline", "md", "h-12 w-full px-6 text-[15px] sm:w-auto")}>
              Try it live
            </a>
          </div>

          <WhatHappensNext />
        </div>

        <div className="animate-fade-in-up [animation-delay:150ms]">
          <ProductWindow />
        </div>
      </div>

      <dl className="mt-20 grid grid-cols-2 overflow-hidden rounded-2xl border border-slate-200 bg-white/80 shadow-sm backdrop-blur lg:grid-cols-4 dark:border-white/10 dark:bg-white/[0.02] dark:shadow-none">
        {[
          { value: "6", label: "Risk signals checked on every PR" },
          { value: "0–100", label: "Score, with every point explained" },
          { value: "Seconds", label: "From PR opened to PR scored" },
          { value: "0 lines", label: "Of your source code stored" },
        ].map((stat, i) => (
          <div
            key={stat.label}
            className={cx(
              "border-slate-200 px-6 py-7 sm:px-8 dark:border-white/10",
              i % 2 === 1 && "border-l",
              i >= 2 && "border-t lg:border-t-0",
              i === 2 && "lg:border-l",
            )}
          >
            <dt className="sr-only">{stat.label}</dt>
            <dd>
              <span className="block text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">{stat.value}</span>
              <span className="mt-1.5 block text-sm text-slate-500 dark:text-slate-400">{stat.label}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function GithubCta({ className }: { className?: string }) {
  return (
    <a
      href={githubLoginUrl()}
      className={buttonClasses("solid", "md", cx("group h-12 w-full px-6 text-[15px] sm:w-auto", className))}
    >
      <GithubIcon size={17} />
      Continue with GitHub
      <span className="transition-transform group-hover:translate-x-0.5" aria-hidden="true">
        →
      </span>
    </a>
  );
}

/** A fake-but-faithful app window: review queue plus the selected PR's
 * score. Purely decorative, so it's hidden from assistive tech. */
function ProductWindow() {

  return (
    <div className="relative" aria-hidden="true">
      <div className="absolute -inset-6 -z-10 rounded-[40px] bg-gradient-to-br from-emerald-200/60 via-sky-100/50 to-indigo-200/50 blur-2xl dark:from-emerald-500/20 dark:via-transparent dark:to-indigo-500/20" />

      <div className={WINDOW}>
        <WindowChrome label="Mergewise · Pull requests" />

        <div className="grid sm:grid-cols-[1fr_220px]">
          <div className="min-w-0">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-white/10">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Review queue</p>
                <p className="text-xs text-slate-500">5 open · sorted by risk</p>
              </div>
              <span className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 dark:border-white/10 dark:text-slate-400">
                All repositories
              </span>
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-white/[0.06]">
              {QUEUE.map((pr, i) => (
                <li
                  key={pr.number}
                  className={cx(
                    "flex animate-fade-in items-center justify-between gap-3 px-5 py-3",
                    i === 0 && "bg-orange-50/60 dark:bg-orange-400/[0.05]",
                  )}
                  style={{ animationDelay: `${350 + i * 100}ms` }}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={cx("size-2 shrink-0 rounded-full", RISK_META[pr.risk].dot)} />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-slate-800 dark:text-slate-200">{pr.title}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                        {pr.repo} #{pr.number} · {pr.author} · {pr.age}
                      </p>
                    </div>
                  </div>
                  <RiskBadge level={pr.risk} score={pr.score} size="sm" />
                </li>
              ))}
            </ul>
          </div>

          <div className="hidden border-l border-slate-200 bg-slate-50/60 p-5 sm:block dark:border-white/10 dark:bg-white/[0.02]">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">#482 risk</p>
            <div className="mt-4 flex justify-center">
              <ScoreRing score={60} level="HIGH" size={112} stroke={9} />
            </div>
            <div className="mt-5 space-y-2.5">
              {BREAKDOWN.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="flex min-w-0 items-center gap-2 text-slate-600 dark:text-slate-400">
                    <span className="text-slate-400 dark:text-slate-500">{row.icon}</span>
                    <span className="truncate">{row.label}</span>
                  </span>
                  <span className="tabular font-mono font-medium text-orange-600 dark:text-orange-300">+{row.points}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Floating "live" event, to show that scoring happens on its own. */}
      <div className="absolute -bottom-6 -left-4 hidden animate-float-in items-center gap-3 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-xl shadow-slate-900/10 backdrop-blur [animation-delay:1100ms] sm:flex lg:-left-10 dark:border-white/10 dark:bg-surface-raised/95 dark:shadow-black/50">
        <span className="relative flex size-2.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
        </span>
        <div>
          <p className="text-[12px] font-semibold text-slate-900 dark:text-white">pull_request.opened</p>
          <p className="font-mono text-[11px] text-slate-500">acme/api #482 → scored 60 · High</p>
        </div>
      </div>
    </div>
  );
}

const WINDOW =
  "overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_30px_80px_-20px_rgb(15_23_42/0.25)] dark:border-white/10 dark:bg-surface/90 dark:shadow-[0_30px_80px_-20px_rgb(0_0_0/0.8)] dark:backdrop-blur-xl";

function WindowChrome({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-white/[0.02]">
      <div className="flex gap-1.5">
        <span className="size-2.5 rounded-full bg-rose-300 dark:bg-white/10" />
        <span className="size-2.5 rounded-full bg-amber-300 dark:bg-white/10" />
        <span className="size-2.5 rounded-full bg-emerald-300 dark:bg-white/10" />
      </div>
      <div className="mx-auto hidden rounded-md border border-slate-200 bg-white px-10 py-1 text-[11px] text-slate-500 sm:block dark:border-white/10 dark:bg-white/[0.03]">
        {label}
      </div>
    </div>
  );
}

/* ─────────────────────────── Ecosystems ─────────────────────────── */

function EcosystemStrip() {
  const items = [...ECOSYSTEMS, ...ECOSYSTEMS];

  return (
    <section className="border-y border-slate-200 bg-slate-50/70 py-8 dark:border-white/10 dark:bg-white/[0.015]" aria-label="Supported ecosystems">
      <div className={cx(PAGE_CONTAINER, "flex flex-col items-center gap-6 lg:flex-row lg:gap-10")}>
        <p className="shrink-0 text-center text-sm font-medium text-slate-500 lg:text-left dark:text-slate-400">
          Understands dependency changes in
        </p>
        <div className="relative w-full overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
          <ul className="flex w-max animate-marquee gap-3 hover:[animation-play-state:paused]">
            {items.map((eco, i) => (
              <li
                key={`${eco.name}-${i}`}
                aria-hidden={i >= ECOSYSTEMS.length ? "true" : undefined}
                className="flex items-center gap-2.5 rounded-full border border-slate-200 bg-white px-4 py-2 dark:border-white/10 dark:bg-white/[0.03]"
              >
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{eco.name}</span>
                <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500">{eco.file}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── Try it ───────────────────────── */

function TryItSection() {
  return (
    <Section id="try" muted>
      <SectionHeading
        eyebrow="Try it live"
        title="See the engine think."
        text="Flip the switches, or paste any public pull request. The same engine that scores connected repos runs right here in your browser. No sign-up needed."
      />
      <Reveal className="mt-14">
        <ScoreLab />
      </Reveal>
    </Section>
  );
}

/* ───────────────────────── Risk signals ───────────────────────── */

function SignalsSection() {
  return (
    <Section id="signals">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16">
        <SectionHeading
          align="left"
          eyebrow="The engine"
          title="Six signals. One honest number."
          text="No machine-learning guesswork in the score. Mergewise applies a small set of transparent, documented rules that senior reviewers already check by instinct. AI comes in afterwards: to explain, never to decide."
          sticky
        >
          <div className="mt-8 overflow-hidden rounded-xl border border-slate-200 bg-slate-950 font-mono text-[12px] leading-relaxed shadow-lg dark:border-white/10 dark:bg-black/40 dark:shadow-none">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 text-[11px] text-slate-500">
              <span>risk-rules.config.ts</span>
              <span>v1</span>
            </div>
            <pre className="overflow-x-auto px-4 py-3 text-slate-300">
              <code>
                <span className="text-sky-300">export const</span> SENSITIVE_PATH_POINTS = <span className="text-amber-300">20</span>;{"\n"}
                <span className="text-sky-300">export const</span> MIGRATION_CHANGE_POINTS = <span className="text-amber-300">15</span>;{"\n"}
                <span className="text-sky-300">export const</span> NO_TEST_FILES_POINTS = <span className="text-amber-300">15</span>;{"\n"}
                <span className="text-sky-300">export const</span> DEPENDENCY_CHANGE_POINTS = <span className="text-amber-300">10</span>;
              </code>
            </pre>
          </div>
          <a
            href="#ai"
            className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-300"
          >
            <SparkleIcon size={14} /> How AI fits in
            <ArrowRightIcon size={13} />
          </a>
        </SectionHeading>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {SIGNALS.map((signal, i) => (
            <Reveal key={signal.title} delay={i * 60}>
              <div className={cx(CARD, "group flex h-full flex-col p-6 transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg hover:shadow-slate-200/70 dark:hover:border-white/20 dark:hover:shadow-black/40")}>
                <div className="flex items-start justify-between">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/15 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20">
                    {signal.icon}
                  </span>
                  <span className="tabular rounded-full bg-slate-100 px-2.5 py-1 font-mono text-xs font-medium text-slate-700 dark:bg-white/[0.06] dark:text-slate-300">
                    {signal.points} pts
                  </span>
                </div>
                <h3 className="mt-5 text-base font-semibold text-slate-900 dark:text-white">{signal.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{signal.text}</p>
                <p className="mt-5 truncate rounded-lg bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-500 ring-1 ring-inset ring-slate-200 dark:bg-white/[0.03] dark:ring-white/10">
                  {signal.example}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* ───────────────────────── How it works ───────────────────────── */

function HowItWorksSection() {
  return (
    <Section id="how-it-works" muted>
      <SectionHeading
        eyebrow="How it works"
        title="Set up in minutes. Useful on the next PR."
        text="No config files, no CI changes, nothing to install in your codebase."
      />

      <ol className="relative mt-14 grid gap-5 lg:grid-cols-3">
        {STEPS.map((step, i) => (
          <Reveal as="li" key={step.title} delay={i * 100}>
            <div className={cx(CARD, "relative flex h-full flex-col overflow-hidden p-7 sm:p-8")}>
              <span className="absolute right-6 top-4 select-none text-7xl font-semibold tracking-tighter text-slate-100 dark:text-white/[0.04]">
                0{i + 1}
              </span>
              <span className={cx(ICON_TILE, "relative")}>{step.icon}</span>
              <h3 className="relative mt-6 text-lg font-semibold text-slate-900 dark:text-white">{step.title}</h3>
              <p className="relative mt-2 flex-1 text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">{step.text}</p>
              <div className="relative mt-6 flex flex-wrap gap-2 border-t border-slate-100 pt-5 dark:border-white/[0.06]">
                {step.detail.map((d) => (
                  <span
                    key={d}
                    className="rounded-md bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-600 ring-1 ring-inset ring-slate-200 dark:bg-white/[0.03] dark:text-slate-400 dark:ring-white/10"
                  >
                    {d}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>
        ))}
      </ol>
    </Section>
  );
}

/* ──────────────────────── Explained score ──────────────────────── */

function ScoreSection() {

  return (
    <Section id="product">
      <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
        <Reveal>
          <Eyebrow>Explainable by design</Eyebrow>
          <h2 className={H2}>Every point has a reason you can click.</h2>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600 dark:text-slate-400">
            A score is only useful if you trust it. Mergewise shows exactly which files tripped which rule, and how many
            points each one added — so a reviewer knows where to look before opening the diff.
          </p>

          <ul className="mt-8 space-y-3.5">
            {[
              "Points per signal, with the files as evidence",
              "Four clear levels, from Low to Critical",
              "Re-scored automatically on every new push",
            ].map((item) => (
              <li key={item} className="flex items-center gap-3 text-[15px] text-slate-700 dark:text-slate-300">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white dark:bg-emerald-400/15 dark:text-emerald-300 dark:ring-1 dark:ring-inset dark:ring-emerald-400/30">
                  <CheckIcon size={11} />
                </span>
                {item}
              </li>
            ))}
          </ul>

          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {LEVELS.map(({ level, range, meaning }) => (
              <div key={level} className={cx(CARD, "p-4")}>
                <span className={cx("block h-1 w-8 rounded-full", RISK_META[level].dot)} />
                <p className={cx("mt-3 text-sm font-semibold", RISK_META[level].text)}>
                  {RISK_META[level].label}
                </p>
                <p className="tabular mt-0.5 font-mono text-[11px] text-slate-500">{range}</p>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">{meaning}</p>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div className="relative" aria-hidden="true">
            <div className="absolute -inset-6 -z-10 rounded-[40px] bg-gradient-to-br from-orange-200/60 via-transparent to-indigo-200/50 blur-2xl dark:from-orange-500/15 dark:to-indigo-500/15" />
            <div className={WINDOW}>
              <WindowChrome label="acme/api · Pull request #482" />
              <div className="flex items-center gap-5 border-b border-slate-200 p-6 dark:border-white/10">
                <ScoreRing score={60} level="HIGH" size={108} stroke={9} />
                <div className="min-w-0">
                  <p className="font-mono text-xs text-slate-500">acme/api #482 · priyaverma</p>
                  <p className="mt-1.5 text-lg font-semibold leading-snug text-slate-900 dark:text-white">
                    Rework session refresh to avoid token race
                  </p>
                  <div className="mt-3">
                    <RiskBadge level="HIGH" />
                  </div>
                </div>
              </div>

              <div className="border-b border-slate-200 px-6 py-5 dark:border-white/10">
                <ScoreComposition signals={EXAMPLE_SIGNALS} level="HIGH" />
              </div>

              <ul className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                {BREAKDOWN.map((row) => (
                  <li key={row.label} className="flex items-center justify-between gap-4 px-6 py-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600 ring-1 ring-inset ring-orange-600/15 dark:bg-orange-400/10 dark:text-orange-300 dark:ring-orange-400/20">
                        {row.icon}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-200">{row.label}</p>
                        <p className="truncate font-mono text-[11px] text-slate-500">{row.detail}</p>
                      </div>
                    </div>
                    <span className="tabular font-mono text-sm font-semibold text-orange-600 dark:text-orange-300">+{row.points}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

/* ──────────────────────── AI (coming soon) ──────────────────────── */

const SCORE_TODAY = [
  "Six transparent, documented rules",
  "Same pull request, same score, every time",
  "Versioned and auditable",
  "Instant, with no AI cost",
];

const EXPLANATION_SOON = [
  "Reads your repo's README and docs/",
  "Summarises the risk in plain English",
  "Findings and recommendations that cite your docs",
  "Only for Medium-risk pull requests and above",
];

function AiSection() {
  return (
    <section id="ai" className="relative scroll-mt-16 overflow-hidden border-t border-slate-200 bg-white dark:border-white/[0.08] dark:bg-transparent">
      <div
        className="pointer-events-none absolute left-1/2 top-0 h-[28rem] w-[56rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-200/40 blur-[120px] dark:bg-indigo-500/[0.12]"
        aria-hidden="true"
      />
      <div className={cx(PAGE_CONTAINER, "relative py-20 sm:py-24")}>
        <SectionHeading
          eyebrow="AI review · coming soon"
          title="Scored by rules. Explained by AI."
          text="The score stays deterministic: predictable, auditable and identical every time. AI is being added on top to explain the why, in plain English, grounded in your team's own docs."
        />

        <div className="mt-14 grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10">
          <div className="space-y-5">
            <Reveal>
              <Pillar title="The score" status="Live today" tone="live" icon={<ShieldCheckIcon size={18} />} items={SCORE_TODAY} />
            </Reveal>
            <Reveal delay={100}>
              <Pillar title="The explanation" status="Coming soon" tone="soon" icon={<SparkleIcon size={18} />} items={EXPLANATION_SOON} />
            </Reveal>
          </div>

          <Reveal delay={160}>
            <AiReviewPreview />
          </Reveal>
        </div>

        <div className="mx-auto mt-12 flex max-w-3xl flex-col items-center justify-center gap-3 text-center text-sm text-slate-600 sm:flex-row sm:gap-8 dark:text-slate-400">
          <span className="inline-flex items-start gap-2 text-left">
            <LockIcon size={14} className="mt-0.5 shrink-0 text-indigo-500 dark:text-indigo-300" /> AI never changes the score.
          </span>
          <span className="inline-flex items-start gap-2 text-left">
            <CheckIcon size={14} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" /> Low-risk PRs skip AI entirely, so it stays fast and cheap.
          </span>
        </div>
      </div>
    </section>
  );
}

function Pillar({
  title,
  status,
  tone,
  icon,
  items,
}: {
  title: string;
  status: string;
  tone: "live" | "soon";
  icon: ReactNode;
  items: string[];
}) {
  const live = tone === "live";
  return (
    <div className={cx(CARD, "p-6 sm:p-7")}>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-3">
          <span
            className={cx(
              "flex size-10 items-center justify-center rounded-xl",
              live
                ? "bg-slate-900 text-emerald-400 dark:bg-emerald-400/10 dark:text-emerald-300"
                : "bg-gradient-to-br from-indigo-500 to-violet-600 text-white",
            )}
          >
            {icon}
          </span>
          <span className="text-lg font-semibold text-slate-900 dark:text-white">{title}</span>
        </span>
        <span
          className={cx(
            "rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
            live
              ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20"
              : "bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-400/10 dark:text-indigo-300 dark:ring-indigo-400/20",
          )}
        >
          {status}
        </span>
      </div>
      <ul className="mt-5 space-y-2.5">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-[15px] text-slate-700 dark:text-slate-300">
            <CheckIcon
              size={14}
              className={cx("mt-1 shrink-0", live ? "text-emerald-600 dark:text-emerald-400" : "text-indigo-500 dark:text-indigo-300")}
            />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Mirrors the app's AI review card, filled with an illustrative example.
 * Clearly labelled as a preview: the feature isn't live yet. */
function AiReviewPreview() {
  return (
    <div className="relative" aria-label="Example of an AI review (preview)">
      <div className="absolute -inset-6 -z-10 rounded-[40px] bg-gradient-to-br from-indigo-200/60 via-transparent to-violet-200/50 blur-2xl dark:from-indigo-500/15 dark:to-violet-500/15" />
      <div className={WINDOW}>
        <WindowChrome label="acme/api · Pull request #482" />
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-4 dark:border-white/10">
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <SparkleIcon size={15} className="text-indigo-500 dark:text-indigo-300" /> AI review
          </span>
          <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-300">
            Preview · example
          </span>
        </div>

        <div className="space-y-5 p-6">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="rounded-full px-2 py-0.5 text-slate-700 ring-1 ring-inset ring-slate-300 dark:text-slate-300 dark:ring-white/15">
                medium confidence
              </span>
              <span>explains a score of 60 · High</span>
            </div>
            <p className="mt-3 text-[15px] leading-relaxed text-slate-800 dark:text-slate-200">
              This PR rewrites how session tokens are refreshed in <code className="font-mono text-[13px]">src/auth/</code>{" "}
              and adds a migration for a new tokens table. Your team's security guide asks for a second reviewer on any
              auth change, and none of the changed files are tests.
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Findings</p>
            <div className="mt-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-900 dark:text-white">Refresh path skips the expiry check</p>
                <RiskBadge level="HIGH" size="sm" />
              </div>
              <p className="mt-1.5 text-[13px] text-slate-600 dark:text-slate-400">
                Tokens are re-signed on refresh without checking whether the old one has expired.
              </p>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Recommendations</p>
            <ul className="mt-2.5 space-y-3">
              {[
                { action: "Request a review from the security owners", source: "docs/security.md" },
                { action: "Add a test for expired refresh tokens", source: "docs/testing.md" },
              ].map((r) => (
                <li key={r.action} className="flex gap-3 text-sm">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-indigo-500" />
                  <div>
                    <p className="text-slate-800 dark:text-slate-200">{r.action}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-slate-500">Source: {r.source}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────── Security ──────────────────────── */

function SecuritySection() {
  return (
    <Section id="security" muted>
      <SectionHeading
        eyebrow="Security & privacy"
        title="Built to be trusted with your repositories."
        text="Mergewise asks for the least access it needs, and keeps even less."
      />

      <div className="mt-14 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {TRUST.map((item, i) => (
          <Reveal key={item.title} delay={i * 70}>
            <div className={cx(CARD, "h-full p-7")}>
              <span className={ICON_TILE}>{item.icon}</span>
              <h3 className="mt-6 text-base font-semibold text-slate-900 dark:text-white">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{item.text}</p>
            </div>
          </Reveal>
        ))}
      </div>

      <p className="mt-8 text-center text-sm text-slate-500 dark:text-slate-400">
        Read the details in our{" "}
        <Link to="/privacy" className={INLINE_LINK}>
          privacy policy
        </Link>{" "}
        and{" "}
        <Link to="/terms" className={INLINE_LINK}>
          terms
        </Link>
        .
      </p>
    </Section>
  );
}

/* ──────────────────────── FAQ ──────────────────────── */

function FaqSection() {
  return (
    <Section id="faq">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16">
        <SectionHeading
          align="left"
          eyebrow="FAQ"
          title="Questions, answered."
          text="The things engineering teams usually ask before connecting a repository."
          sticky
        >
          <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">
            Still curious?{" "}
            <Link to="/about" className={INLINE_LINK}>
              Meet the team
            </Link>{" "}
            or{" "}
            <a href={SITE.sourceUrl} target="_blank" rel="noreferrer" className={INLINE_LINK}>
              read the source
            </a>
            .
          </p>
        </SectionHeading>

        <Reveal>
          <div className="divide-y divide-slate-200 border-y border-slate-200 dark:divide-white/10 dark:border-white/10">
            {FAQS.map((faq, i) => (
              <details key={faq.q} className="group" open={i === 0}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-left text-base font-semibold text-slate-900 transition-colors hover:text-emerald-700 dark:text-white dark:hover:text-emerald-300 [&::-webkit-details-marker]:hidden">
                  {faq.q}
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-transform duration-300 group-open:rotate-180 dark:border-white/10 dark:text-slate-400">
                    <ChevronDownIcon size={14} />
                  </span>
                </summary>
                <p className="max-w-3xl pb-6 pr-12 text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">{faq.a}</p>
              </details>
            ))}
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

/* ──────────────────────── Final CTA ──────────────────────── */

function FinalCta() {
  return (
    <section className={cx(PAGE_CONTAINER, "pb-24")}>
      <Reveal>
        <div className="relative overflow-hidden rounded-3xl bg-slate-900 px-6 py-16 ring-1 ring-inset ring-white/10 sm:px-16 sm:py-20 dark:bg-surface-raised">
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <div className="absolute -left-20 top-0 h-72 w-[36rem] -translate-y-1/2 rounded-full bg-emerald-500/30 blur-[100px]" />
            <div className="absolute -right-20 bottom-0 h-72 w-[30rem] translate-y-1/2 rounded-full bg-sky-500/20 blur-[100px]" />
            <GridLines
              size={40}
              className="text-white/[0.07]"
              mask="radial-gradient(ellipse 70% 80% at 50% 50%, black, transparent)"
            />
          </div>
          <div className="relative flex flex-col items-center justify-between gap-10 text-center lg:flex-row lg:text-left">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-semibold tracking-[-0.03em] text-white sm:text-5xl sm:leading-[1.06]">
                Your next pull request is already waiting.
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-slate-300">
                Connect a repository and see its open PRs ranked by risk in minutes.
              </p>
            </div>
            <div className="flex w-full shrink-0 flex-col gap-3 sm:w-auto sm:flex-row">
              <a href={githubLoginUrl()} className={buttonClasses("primary", "md", "group h-12 w-full px-6 text-[15px] sm:w-auto")}>
                <GithubIcon size={17} />
                Continue with GitHub
              </a>
              <Link
                to="/about"
                className="group inline-flex h-12 items-center justify-center gap-1.5 rounded-lg px-6 text-[15px] font-medium text-white ring-1 ring-inset ring-white/20 transition-colors hover:bg-white/10"
              >
                About the project
                <ArrowRightIcon size={14} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/* ──────────────────────── Shared building blocks ──────────────────────── */

const CARD =
  "rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none";

const ICON_TILE =
  "flex size-12 items-center justify-center rounded-xl bg-slate-900 text-emerald-400 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-1 dark:ring-inset dark:ring-emerald-400/20";

const H2 = "mt-4 text-4xl font-semibold tracking-[-0.03em] text-slate-900 sm:text-5xl sm:leading-[1.06] dark:text-white";

const INLINE_LINK =
  "font-medium text-slate-800 underline decoration-slate-300 underline-offset-2 hover:text-slate-900 dark:text-slate-200 dark:decoration-slate-600 dark:hover:text-white";

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">{children}</p>;
}

function Section({ id, muted, children }: { id: string; muted?: boolean; children: ReactNode }) {
  return (
    <section
      id={id}
      className={cx(
        "scroll-mt-16 border-t border-slate-200 dark:border-white/[0.08]",
        muted ? "bg-slate-50 dark:bg-white/[0.015]" : "bg-white dark:bg-transparent",
      )}
    >
      <div className={cx(PAGE_CONTAINER, "py-20 sm:py-24")}>{children}</div>
    </section>
  );
}

function SectionHeading({
  eyebrow,
  title,
  text,
  align = "center",
  sticky,
  children,
}: {
  eyebrow: string;
  title: string;
  text: string;
  align?: "center" | "left";
  sticky?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={cx(sticky && "lg:sticky lg:top-28 lg:self-start")}>
      <Reveal className={cx(align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-xl")}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className={H2}>{title}</h2>
        <p className="mt-5 text-lg leading-relaxed text-slate-600 dark:text-slate-400">{text}</p>
        {children}
      </Reveal>
    </div>
  );
}

function LandingBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-[60rem] overflow-hidden" aria-hidden="true">
      <div className="absolute left-[-10%] top-[-20rem] h-[40rem] w-[50rem] animate-blob-drift rounded-full bg-emerald-200/50 blur-[130px] dark:bg-emerald-500/[0.13]" />
      <div className="absolute right-[-10%] top-[-6rem] h-[36rem] w-[40rem] animate-blob-drift-slow rounded-full bg-sky-200/50 blur-[130px] dark:bg-indigo-500/[0.12]" />
      <GridLines
        className="text-slate-200/80 dark:text-white/[0.05]"
        mask="radial-gradient(ellipse 70% 60% at 50% 0%, black 20%, transparent 100%)"
      />
    </div>
  );
}
