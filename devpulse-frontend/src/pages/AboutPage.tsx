import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { PAGE_CONTAINER, PublicLayout } from "../components/PublicLayout";
import { Reveal } from "../components/Reveal";
import {
  ArrowRightIcon,
  CheckIcon,
  ClockIcon,
  EyeOffIcon,
  FileIcon,
  GithubIcon,
  GlobeIcon,
  LayersIcon,
  LinkedInIcon,
  LockIcon,
  MailIcon,
  ShieldCheckIcon,
  SparkleIcon,
  XIcon,
} from "../components/icons";
import { buttonClasses, cx } from "../components/ui";
import { githubLoginUrl } from "../lib/api";
import { CREATORS, SITE, type Creator, type CreatorLinks } from "../lib/site";

// Every number here is checkable in the repo: the six rules in
// risk-rules.config.ts, the backend test suite, and the README's slice plan.
const NUMBERS = [
  { value: "6", label: "risk signals, each documented" },
  { value: "130", label: "automated backend tests" },
  { value: "6 of 11", label: "build stages shipped" },
  { value: "0", label: "lines of your code stored" },
];

const PRINCIPLES = [
  {
    icon: <ShieldCheckIcon size={20} />,
    title: "Explainable over clever",
    text: "Every point in a score traces back to a named rule and the files that triggered it. If we can't explain it, we don't show it.",
  },
  {
    icon: <LockIcon size={20} />,
    title: "Read-only by default",
    text: "Mergewise asks for the least access it needs. It can't push, comment or merge, and it never stores your source code.",
  },
  {
    icon: <SparkleIcon size={20} />,
    title: "Rules decide, AI explains",
    text: "The score is deterministic and versioned. AI is being added to explain it in plain English, and it will never change the number.",
  },
  {
    icon: <EyeOffIcon size={20} />,
    title: "Quiet by design",
    text: "No bots in your pull requests, no blocked merges, no noise. Mergewise helps reviewers decide where to look, then gets out of the way.",
  },
];

type StageStatus = "shipped" | "progress" | "planned";

const STAGES: { title: string; text: string; status: StageStatus }[] = [
  { title: "Sign in with GitHub", text: "OAuth, secure sessions and a personal organisation on first login.", status: "shipped" },
  { title: "Connect repositories", text: "A read-only GitHub App installed on just the repos you choose.", status: "shipped" },
  { title: "Reliable webhooks", text: "Signature-checked, de-duplicated events with a full audit trail.", status: "shipped" },
  { title: "Pull request sync", text: "Background processing that always fetches GitHub's current state.", status: "shipped" },
  { title: "Risk engine", text: "Six transparent rules, pure functions, 32 table-driven tests.", status: "shipped" },
  { title: "Dashboard and PR pages", text: "The review queue, risk breakdowns and a live deployment.", status: "shipped" },
  { title: "AI review", text: "Read your docs, then explain risky PRs with sources.", status: "progress" },
  { title: "Notifications", text: "Slack alerts and workflow automation.", status: "planned" },
];

const STACK: { group: string; items: string[] }[] = [
  { group: "Frontend", items: ["React", "TypeScript", "Tailwind CSS", "React Query", "Vite"] },
  { group: "Backend", items: ["Node.js", "Express", "Prisma", "Vitest"] },
  { group: "Data", items: ["PostgreSQL", "pgvector", "Redis"] },
  { group: "Infrastructure", items: ["Railway", "Vercel", "GitHub App", "Docker"] },
];

const LINKS: { key: keyof CreatorLinks; label: string; icon: ReactNode }[] = [
  { key: "github", label: "GitHub", icon: <GithubIcon size={16} /> },
  { key: "linkedin", label: "LinkedIn", icon: <LinkedInIcon size={16} /> },
  { key: "x", label: "X", icon: <XIcon size={15} /> },
  { key: "website", label: "Website", icon: <GlobeIcon size={16} /> },
  { key: "resume", label: "Resume", icon: <FileIcon size={16} /> },
  { key: "email", label: "Email", icon: <MailIcon size={16} /> },
];

export function AboutPage() {
  return (
    <PublicLayout>
      <main>
        <Hero />
        <Why />
        <Principles />
        <Journey />
        <Team />
        <Stack />
        <Cta />
      </main>
    </PublicLayout>
  );
}

/* ───────────────────────────── Hero ───────────────────────────── */

function Hero() {
  return (
    <section className={cx(PAGE_CONTAINER, "pb-20 pt-14 sm:pt-20")}>
      <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16">
        <div className="animate-fade-in-up">
          <Eyebrow>About Mergewise</Eyebrow>
          <h1 className="mt-4 text-5xl font-semibold leading-[1.04] tracking-[-0.04em] text-slate-900 sm:text-6xl dark:text-white">
            Calmer code reviews,{" "}
            <span className="bg-gradient-to-r from-emerald-600 via-teal-500 to-sky-600 bg-clip-text text-transparent dark:from-emerald-300 dark:via-teal-200 dark:to-sky-300">
              by design.
            </span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-600 dark:text-slate-400">
            Not every pull request deserves the same attention. A typo fix and an auth rewrite shouldn't wait in the
            same queue. We're building Mergewise so reviewers can skim the routine and focus on the changes that can
            actually hurt.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/login#try" className={buttonClasses("solid", "md", "h-11 px-5")}>
              Try it live <ArrowRightIcon size={14} />
            </Link>
            <a href={SITE.sourceUrl} target="_blank" rel="noreferrer" className={buttonClasses("outline", "md", "h-11 px-5")}>
              <GithubIcon size={15} /> Read the source
            </a>
          </div>
        </div>

        <div className="animate-fade-in-up [animation-delay:120ms]">
          <div className="rounded-3xl border border-slate-200 bg-white p-2 shadow-[0_30px_80px_-30px_rgb(15_23_42/0.25)] dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none">
            <p className="px-5 pb-2 pt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">By the numbers</p>
            <dl className="grid grid-cols-2 gap-2">
              {NUMBERS.map((n) => (
                <div key={n.label} className="rounded-2xl bg-slate-50 p-5 dark:bg-white/[0.03]">
                  <dt className="sr-only">{n.label}</dt>
                  <dd>
                    <span className="block text-4xl font-semibold tracking-tight text-slate-900 dark:text-white">{n.value}</span>
                    <span className="mt-1.5 block text-sm leading-snug text-slate-500 dark:text-slate-400">{n.label}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────────── Why ───────────────────────────── */

function Why() {
  return (
    <Band muted>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16">
        <Reveal>
          <Eyebrow>Why we built it</Eyebrow>
          <h2 className={cx(H2, "mt-3")}>Review time is the scarcest resource on a team.</h2>
        </Reveal>
        <Reveal delay={80} className="space-y-5 text-lg leading-relaxed text-slate-600 dark:text-slate-400">
          <p>
            Most review queues treat every pull request the same: newest first, or whoever shouts loudest. That means a
            one-line copy fix can get more attention than a change to authentication, billing or the database schema.
          </p>
          <p>
            Senior engineers already know the warning signs by instinct: sensitive paths, migrations, dependency bumps,
            missing tests, sprawling diffs. Mergewise turns that instinct into a{" "}
            <strong className="font-semibold text-slate-900 dark:text-white">transparent, repeatable score</strong>, so
            the whole team can see which changes need a careful look, and why.
          </p>
        </Reveal>
      </div>
    </Band>
  );
}

/* ───────────────────────────── Principles ───────────────────────────── */

function Principles() {
  return (
    <Band>
      <Reveal className="mx-auto max-w-2xl text-center">
        <Eyebrow>What we believe</Eyebrow>
        <h2 className={cx(H2, "mt-3")}>Four principles behind every decision.</h2>
      </Reveal>
      <div className="mt-14 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {PRINCIPLES.map((p, i) => (
          <Reveal key={p.title} delay={i * 70}>
            <div className={cx(CARD, "h-full p-7")}>
              <span className="flex size-12 items-center justify-center rounded-xl bg-slate-900 text-emerald-400 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-1 dark:ring-inset dark:ring-emerald-400/20">
                {p.icon}
              </span>
              <h3 className="mt-6 text-lg font-semibold text-slate-900 dark:text-white">{p.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">{p.text}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </Band>
  );
}

/* ───────────────────────────── Journey ───────────────────────────── */

const STATUS_META: Record<StageStatus, { label: string; dot: string; pill: string }> = {
  shipped: {
    label: "Shipped",
    dot: "bg-emerald-500 ring-emerald-500/20",
    pill: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20",
  },
  progress: {
    label: "In progress",
    dot: "bg-indigo-500 ring-indigo-500/20",
    pill: "bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-400/10 dark:text-indigo-300 dark:ring-indigo-400/20",
  },
  planned: {
    label: "Planned",
    dot: "bg-slate-300 ring-slate-300/30 dark:bg-slate-600 dark:ring-slate-600/30",
    pill: "bg-slate-100 text-slate-600 ring-slate-300 dark:bg-white/[0.05] dark:text-slate-400 dark:ring-white/10",
  },
};

function Journey() {
  return (
    <Band muted>
      <div className="grid gap-12 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16">
        <Reveal className="lg:sticky lg:top-28 lg:self-start">
          <Eyebrow>How it's being built</Eyebrow>
          <h2 className={cx(H2, "mt-3")}>One working slice at a time.</h2>
          <p className="mt-5 text-lg leading-relaxed text-slate-600 dark:text-slate-400">
            Mergewise is built in vertical slices: each stage ships something usable end to end, with tests, before the
            next one starts. No half-built layers.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {(Object.keys(STATUS_META) as StageStatus[]).map((s) => (
              <span key={s} className={cx("rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", STATUS_META[s].pill)}>
                {STATUS_META[s].label}
              </span>
            ))}
          </div>
        </Reveal>

        <ol className="relative">
          <span className="absolute bottom-3 left-[11px] top-3 w-px bg-slate-200 dark:bg-white/10" aria-hidden="true" />
          {STAGES.map((stage, i) => {
            const meta = STATUS_META[stage.status];
            return (
              <Reveal as="li" key={stage.title} delay={i * 50} className="relative pb-8 pl-12 last:pb-0">
                <span className={cx("absolute left-1 top-1.5 size-[15px] rounded-full ring-4", meta.dot)} aria-hidden="true" />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-mono text-xs text-slate-400 dark:text-slate-500">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{stage.title}</h3>
                  <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", meta.pill)}>
                    {stage.status === "shipped" ? (
                      <span className="inline-flex items-center gap-1">
                        <CheckIcon size={10} /> {meta.label}
                      </span>
                    ) : stage.status === "progress" ? (
                      <span className="inline-flex items-center gap-1">
                        <ClockIcon size={10} /> {meta.label}
                      </span>
                    ) : (
                      meta.label
                    )}
                  </span>
                </div>
                <p className="mt-1.5 text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">{stage.text}</p>
              </Reveal>
            );
          })}
        </ol>
      </div>
    </Band>
  );
}

/* ───────────────────────────── Team ───────────────────────────── */

function Team() {
  return (
    <Band>
      <Reveal className="mx-auto max-w-2xl text-center">
        <Eyebrow>The team</Eyebrow>
        <h2 className={cx(H2, "mt-3")}>Made by a team of two.</h2>
        <p className="mt-5 text-lg text-slate-600 dark:text-slate-400">The people who designed, built and ship Mergewise.</p>
      </Reveal>
      <ul className="mx-auto mt-14 grid max-w-4xl gap-6 md:grid-cols-2">
        {CREATORS.map((creator, i) => (
          <Reveal as="li" key={creator.name} delay={i * 90}>
            <CreatorCard creator={creator} />
          </Reveal>
        ))}
      </ul>
    </Band>
  );
}

function CreatorCard({ creator }: { creator: Creator }) {
  const links = LINKS.filter((l) => creator.links[l.key]);

  return (
    <div className={cx(CARD, "relative h-full overflow-hidden p-8")}>
      <div
        className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-gradient-to-br from-emerald-200/50 to-sky-200/40 blur-2xl dark:from-emerald-500/10 dark:to-sky-500/10"
        aria-hidden="true"
      />
      <div className="relative flex items-center gap-5">
        <CreatorAvatar creator={creator} />
        <div className="min-w-0">
          <h3 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">{creator.name}</h3>
          <p className="mt-0.5 text-sm font-medium text-emerald-700 dark:text-emerald-300">{creator.role}</p>
        </div>
      </div>

      {creator.bio && <p className="relative mt-5 text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">{creator.bio}</p>}

      <div className="relative mt-6 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-6 dark:border-white/[0.08]">
        {links.length > 0 ? (
          links.map((link) => {
            const value = creator.links[link.key];
            const href = link.key === "email" && !value.startsWith("mailto:") ? `mailto:${value}` : value;
            return (
              <a
                key={link.key}
                href={href}
                target={href.startsWith("mailto:") ? undefined : "_blank"}
                rel="noreferrer"
                aria-label={`${creator.name} on ${link.label}`}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:border-emerald-500 hover:text-slate-900 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300 dark:hover:border-emerald-400/50 dark:hover:text-white"
              >
                {link.icon}
                {link.label}
              </a>
            );
          })
        ) : (
          <p className="text-sm text-slate-500">Profile links coming soon.</p>
        )}
      </div>
    </div>
  );
}

function CreatorAvatar({ creator }: { creator: Creator }) {
  const initials = creator.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);

  return (
    <span className="relative shrink-0">
      <span className="absolute -inset-1 rounded-full bg-gradient-to-br from-emerald-400 to-sky-500 opacity-60 blur-sm" aria-hidden="true" />
      {creator.photo ? (
        <img
          src={creator.photo}
          alt={creator.name}
          width={80}
          height={80}
          className="relative size-20 rounded-full object-cover ring-4 ring-white dark:ring-canvas"
        />
      ) : (
        <span className="relative flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-sky-600 text-2xl font-semibold text-white ring-4 ring-white dark:ring-canvas">
          {initials}
        </span>
      )}
    </span>
  );
}

/* ───────────────────────────── Stack ───────────────────────────── */

function Stack() {
  return (
    <Band muted>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16">
        <Reveal>
          <Eyebrow>Built with</Eyebrow>
          <h2 className={cx(H2, "mt-3")}>A boring, reliable stack.</h2>
          <p className="mt-5 text-lg leading-relaxed text-slate-600 dark:text-slate-400">
            Proven tools, chosen so the interesting work goes into the product, not the plumbing.
          </p>
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-2">
          {STACK.map((group, i) => (
            <Reveal key={group.group} delay={i * 70}>
              <div className={cx(CARD, "h-full p-6")}>
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                  <LayersIcon size={15} className="text-emerald-600 dark:text-emerald-400" />
                  {group.group}
                </p>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {group.items.map((item) => (
                    <li
                      key={item}
                      className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700 dark:bg-white/[0.06] dark:text-slate-300"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </Band>
  );
}

/* ───────────────────────────── CTA ───────────────────────────── */

function Cta() {
  return (
    <section className={cx(PAGE_CONTAINER, "py-20 sm:py-24")}>
      <Reveal>
        <div className="relative overflow-hidden rounded-3xl bg-slate-900 px-6 py-14 ring-1 ring-inset ring-white/10 sm:px-14 sm:py-16 dark:bg-surface-raised">
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <div className="absolute -left-20 top-0 h-72 w-[36rem] -translate-y-1/2 rounded-full bg-emerald-500/30 blur-[100px]" />
            <div className="absolute -right-20 bottom-0 h-72 w-[30rem] translate-y-1/2 rounded-full bg-sky-500/20 blur-[100px]" />
          </div>
          <div className="relative flex flex-col items-center justify-between gap-8 text-center lg:flex-row lg:text-left">
            <div className="max-w-xl">
              <h2 className="text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">See it on your own pull requests.</h2>
              <p className="mt-3 text-lg text-slate-300">Connect a repository and your next PR is scored automatically.</p>
            </div>
            <div className="flex w-full shrink-0 flex-col gap-3 sm:w-auto sm:flex-row">
              <a href={githubLoginUrl()} className={buttonClasses("primary", "md", "h-12 px-6 text-[15px]")}>
                <GithubIcon size={17} /> Continue with GitHub
              </a>
              <Link
                to="/login#try"
                className="inline-flex h-12 items-center justify-center gap-1.5 rounded-lg px-6 text-[15px] font-medium text-white ring-1 ring-inset ring-white/20 transition-colors hover:bg-white/10"
              >
                Try it without signing in
              </Link>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/* ───────────────────────────── Shared ───────────────────────────── */

const CARD =
  "rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none";

const H2 = "text-3xl font-semibold leading-[1.1] tracking-[-0.03em] text-slate-900 sm:text-4xl dark:text-white";

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">{children}</p>;
}

function Band({ muted, children }: { muted?: boolean; children: ReactNode }) {
  return (
    <section
      className={cx(
        "border-t border-slate-200 dark:border-white/[0.08]",
        muted ? "bg-slate-50 dark:bg-white/[0.015]" : "bg-white dark:bg-transparent",
      )}
    >
      <div className={cx(PAGE_CONTAINER, "py-20 sm:py-24")}>{children}</div>
    </section>
  );
}
