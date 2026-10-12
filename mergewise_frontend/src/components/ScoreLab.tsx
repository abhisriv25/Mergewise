import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  AlertIcon,
  CheckIcon,
  DatabaseIcon,
  ExternalLinkIcon,
  FileIcon,
  FlaskIcon,
  GithubIcon,
  LayersIcon,
  LockIcon,
  PackageIcon,
  SearchIcon,
} from "./icons";
import { RISK_META, RiskBadge, ScoreComposition, ScoreRing, signalMeta } from "./risk";
import { buttonClasses, cx } from "./ui";
import type { RiskLevel } from "../lib/api";
import { plural } from "../lib/format";
import {
  GithubLookupError,
  fetchPublicPullRequest,
  parsePrReference,
  type PublicPullRequest,
} from "../lib/github-public";
import { RISK_ENGINE_VERSION, calculateRiskScore, calculateRiskSignals, type EngineSignal } from "../lib/risk-engine";

/** Public PRs scored with the real engine while choosing them: one per level. */
const EXAMPLES = [
  { ref: "vitejs/vite#23611", label: "Vite build fix", hint: "Low" },
  { ref: "supabase/auth#2745", label: "Supabase schema change", hint: "Medium" },
  { ref: "twentyhq/twenty#26129", label: "Twenty billing update", hint: "High" },
];

interface PlaygroundState {
  auth: boolean;
  migration: boolean;
  dependencies: boolean;
  tests: boolean;
  lines: number;
  files: number;
}

const PRESETS: { label: string; state: PlaygroundState }[] = [
  { label: "Typo fix", state: { auth: false, migration: false, dependencies: false, tests: true, lines: 4, files: 1 } },
  { label: "Dependency bump", state: { auth: false, migration: false, dependencies: true, tests: false, lines: 60, files: 2 } },
  { label: "Auth rewrite", state: { auth: true, migration: true, dependencies: false, tests: false, lines: 420, files: 7 } },
  { label: "Huge refactor", state: { auth: true, migration: true, dependencies: true, tests: false, lines: 2400, files: 72 } },
];

const TOGGLES: { key: "auth" | "migration" | "dependencies" | "tests"; label: string; hint: string; icon: ReactNode }[] = [
  { key: "auth", label: "Touches authentication code", hint: "src/auth/session.ts", icon: <LockIcon size={15} /> },
  { key: "migration", label: "Adds a database migration", hint: "db/migrations/0042_tokens.sql", icon: <DatabaseIcon size={15} /> },
  { key: "dependencies", label: "Updates dependencies", hint: "package.json, package-lock.json", icon: <PackageIcon size={15} /> },
  { key: "tests", label: "Includes tests", hint: "*.test.ts", icon: <FlaskIcon size={15} /> },
];

type Tab = "playground" | "real";

export function ScoreLab() {
  const [tab, setTab] = useState<Tab>("playground");

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_30px_80px_-30px_rgb(15_23_42/0.25)] dark:border-white/10 dark:bg-white/[0.02] dark:shadow-none">
      <div className="flex gap-1 border-b border-slate-200 p-2 dark:border-white/10" role="tablist" aria-label="Try the engine">
        <TabButton active={tab === "playground"} onClick={() => setTab("playground")}>
          <LayersIcon size={14} /> Playground
        </TabButton>
        <TabButton active={tab === "real"} onClick={() => setTab("real")}>
          <GithubIcon size={14} /> Score a real PR
        </TabButton>
      </div>
      {tab === "playground" ? <Playground /> : <RealPrScorer />}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cx(
        "inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-colors",
        active
          ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

/* ─────────────────────────── Playground ─────────────────────────── */

function Playground() {
  const [state, setState] = useState<PlaygroundState>(PRESETS[2].state);
  const set = (patch: Partial<PlaygroundState>) => setState((s) => ({ ...s, ...patch }));

  const result = useMemo(() => {
    const changedFiles = ["src/api/handler.ts"];
    if (state.auth) changedFiles.push("src/auth/session.ts");
    if (state.migration) changedFiles.push("db/migrations/0042_tokens.sql");
    if (state.dependencies) changedFiles.push("package.json", "package-lock.json");
    if (state.tests) changedFiles.push(state.auth ? "src/auth/session.test.ts" : "src/api/handler.test.ts");
    const additions = Math.round(state.lines * 0.8);
    const signals = calculateRiskSignals({
      additions,
      deletions: state.lines - additions,
      changedFilesCount: Math.max(state.files, changedFiles.length),
      changedFiles,
    });
    return { signals, ...calculateRiskScore(signals) };
  }, [state]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="space-y-6 p-6 sm:p-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Start from</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {PRESETS.map((p) => {
              const active = JSON.stringify(p.state) === JSON.stringify(state);
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setState(p.state)}
                  aria-pressed={active}
                  className={cx(
                    "rounded-full px-3 py-1.5 text-[13px] font-medium ring-1 ring-inset transition-colors",
                    active
                      ? "bg-emerald-50 text-emerald-700 ring-emerald-600/25 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/30"
                      : "text-slate-600 ring-slate-200 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:ring-white/10 dark:hover:bg-white/[0.04] dark:hover:text-white",
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          {TOGGLES.map((t) => (
            <Switch
              key={t.key}
              checked={state[t.key]}
              onChange={(checked) => set({ [t.key]: checked })}
              icon={t.icon}
              label={t.label}
              hint={t.hint}
            />
          ))}
        </div>

        <Slider label="Lines changed" value={state.lines} min={0} max={2500} step={10} onChange={(lines) => set({ lines })} />
        <Slider label="Files changed" value={state.files} min={1} max={80} step={1} onChange={(files) => set({ files })} />
      </div>

      <ResultPanel
        score={result.score}
        level={result.level}
        signals={result.signals}
        header={<p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Your pretend pull request</p>}
      />
    </div>
  );
}

function Switch({
  checked,
  onChange,
  icon,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  icon: ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-3 transition-colors hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/[0.03]">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-slate-900 dark:text-white">{label}</span>
        <span className="block truncate font-mono text-[11px] text-slate-500">{hint}</span>
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden="true"
        className={cx(
          "relative h-6 w-10 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500/50",
          checked ? "bg-emerald-500" : "bg-slate-300 dark:bg-white/15",
        )}
      >
        <span
          className={cx(
            "absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-[18px]" : "translate-x-0.5",
          )}
        />
      </span>
    </label>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-sm">
        <span className="font-medium text-slate-900 dark:text-white">{label}</span>
        <span className="tabular font-mono text-slate-600 dark:text-slate-400">{value.toLocaleString()}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2.5 w-full accent-emerald-500"
      />
    </label>
  );
}

/* ─────────────────────────── Real PR ─────────────────────────── */

type Lookup =
  | { status: "idle" }
  | { status: "loading"; ref: string }
  | { status: "error"; message: string }
  | { status: "done"; pr: PublicPullRequest; signals: EngineSignal[]; score: number; level: RiskLevel };

function RealPrScorer() {
  const [input, setInput] = useState("");
  const [lookup, setLookup] = useState<Lookup>({ status: "idle" });

  async function score(text: string) {
    const ref = parsePrReference(text);
    if (!ref) {
      setLookup({ status: "error", message: "Paste a pull request link like github.com/owner/repo/pull/123, or owner/repo#123." });
      return;
    }
    setLookup({ status: "loading", ref: `${ref.owner}/${ref.repo}#${ref.number}` });
    try {
      const pr = await fetchPublicPullRequest(ref);
      const signals = calculateRiskSignals({
        additions: pr.additions,
        deletions: pr.deletions,
        changedFilesCount: pr.changedFilesCount,
        changedFiles: pr.changedFiles,
      });
      setLookup({ status: "done", pr, signals, ...calculateRiskScore(signals) });
    } catch (err) {
      setLookup({
        status: "error",
        message: err instanceof GithubLookupError ? err.message : "Something went wrong while scoring that PR.",
      });
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void score(input);
  }

  function tryExample(ref: string) {
    setInput(ref);
    void score(ref);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="p-6 sm:p-8">
        <form onSubmit={onSubmit}>
          <label htmlFor="pr-url" className="text-sm font-medium text-slate-900 dark:text-white">
            Public pull request
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <SearchIcon size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="pr-url"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="github.com/owner/repo/pull/123"
                autoComplete="off"
                spellCheck={false}
                className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-white/15 dark:bg-white/[0.03] dark:text-white dark:placeholder:text-slate-500"
              />
            </div>
            <button
              type="submit"
              disabled={lookup.status === "loading" || !input.trim()}
              className={buttonClasses("solid", "md", "h-11 px-5")}
            >
              {lookup.status === "loading" ? "Scoring…" : "Score it"}
            </button>
          </div>
        </form>

        <p className="mt-6 text-xs font-semibold uppercase tracking-wider text-slate-500">Or try one</p>
        <div className="mt-2.5 space-y-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.ref}
              type="button"
              onClick={() => tryExample(ex.ref)}
              disabled={lookup.status === "loading"}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 px-3.5 py-3 text-left transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-white/10 dark:hover:bg-white/[0.03]"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-900 dark:text-white">{ex.label}</span>
                <span className="block truncate font-mono text-[11px] text-slate-500">{ex.ref}</span>
              </span>
              <span className="shrink-0 text-xs text-slate-500">Score →</span>
            </button>
          ))}
        </div>

        <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
          <LockIcon size={13} className="mt-0.5 shrink-0" />
          Runs entirely in your browser: Mergewise fetches the file list from GitHub's public API and scores it with the
          same engine ({RISK_ENGINE_VERSION}) that scores connected repos. Nothing is sent to our servers.
        </p>
      </div>

      {lookup.status === "done" ? (
        <ResultPanel
          score={lookup.score}
          level={lookup.level}
          signals={lookup.signals}
          header={<PrHeader pr={lookup.pr} />}
          footer={
            <>
              {lookup.pr.filesTruncated &&
                `Scored the first ${lookup.pr.changedFiles.length.toLocaleString()} files; totals use all ${lookup.pr.changedFilesCount.toLocaleString()}. `}
              {lookup.pr.rateLimitRemaining !== null &&
                `${plural(lookup.pr.rateLimitRemaining, "free GitHub lookup")} left this hour.`}
            </>
          }
        />
      ) : (
        <div className="flex min-h-[26rem] flex-col items-center justify-center gap-4 border-t border-slate-200 bg-slate-50/70 p-8 text-center lg:border-l lg:border-t-0 dark:border-white/10 dark:bg-white/[0.015]">
          {lookup.status === "loading" ? (
            <>
              <div className="skeleton size-[132px] rounded-full" />
              <p className="text-sm text-slate-500">
                Fetching <span className="font-mono">{lookup.ref}</span> from GitHub…
              </p>
            </>
          ) : lookup.status === "error" ? (
            <div role="alert" className="max-w-sm">
              <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
                <AlertIcon size={18} />
              </span>
              <p className="mt-4 text-sm font-medium text-slate-900 dark:text-white">Couldn't score that one</p>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">{lookup.message}</p>
            </div>
          ) : (
            <div className="max-w-xs">
              <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900">
                <GithubIcon size={18} />
              </span>
              <p className="mt-4 text-sm font-medium text-slate-900 dark:text-white">Any public pull request</p>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
                Paste a link, or pick an example, and see exactly how Mergewise would score it.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PrHeader({ pr }: { pr: PublicPullRequest }) {
  const stateStyle = {
    open: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20",
    merged: "bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-400/10 dark:text-violet-300 dark:ring-violet-400/20",
    closed: "bg-slate-100 text-slate-600 ring-slate-300 dark:bg-slate-400/10 dark:text-slate-400 dark:ring-slate-400/20",
  }[pr.state];

  return (
    <div>
      <p className="flex flex-wrap items-center gap-2 font-mono text-xs text-slate-500">
        {pr.ref.owner}/{pr.ref.repo}#{pr.ref.number}
        <span className={cx("rounded-full px-2 py-0.5 font-sans text-[11px] font-medium capitalize ring-1 ring-inset", stateStyle)}>
          {pr.state}
        </span>
      </p>
      <a
        href={pr.url}
        target="_blank"
        rel="noreferrer"
        className="group mt-1.5 inline-flex items-start gap-1.5 text-base font-semibold leading-snug text-slate-900 hover:text-emerald-700 dark:text-white dark:hover:text-emerald-300"
      >
        <span className="line-clamp-2">{pr.title}</span>
        <ExternalLinkIcon size={13} className="mt-1 shrink-0 text-slate-400" />
      </a>
      <p className="mt-1 text-xs text-slate-500">
        by {pr.author} ·{" "}
        <span className="font-mono">
          <span className="text-emerald-600 dark:text-emerald-400">+{pr.additions.toLocaleString()}</span>{" "}
          <span className="text-rose-600 dark:text-rose-400">−{pr.deletions.toLocaleString()}</span>
        </span>{" "}
        · {plural(pr.changedFilesCount, "file")}
      </p>
    </div>
  );
}

/* ─────────────────────────── Shared result ─────────────────────────── */

function ResultPanel({
  score,
  level,
  signals,
  header,
  footer,
}: {
  score: number;
  level: RiskLevel;
  signals: EngineSignal[];
  header: ReactNode;
  footer?: ReactNode;
}) {
  const triggered = signals.filter((s) => s.triggered).sort((a, b) => b.points - a.points);
  const passed = signals.filter((s) => !s.triggered);
  const meta = RISK_META[level];

  return (
    <div
      className="border-t border-slate-200 bg-slate-50/70 p-6 sm:p-8 lg:border-l lg:border-t-0 dark:border-white/10 dark:bg-white/[0.015]"
      aria-live="polite"
    >
      {header}

      <div className="mt-5 flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-6">
        <ScoreRing score={score} level={level} size={120} stroke={10} />
        <div className="w-full min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={cx("text-xl font-semibold", meta.text)}>{meta.label} risk</p>
            <RiskBadge level={level} score={score} size="sm" />
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {triggered.length === 0
              ? "No signals fired: a routine change."
              : `${plural(triggered.length, "signal")} fired out of ${signals.length} checks.`}
          </p>
          <div className="mt-4">
            <ScoreComposition key={triggered.map((s) => s.code).join()} signals={signals} level={level} />
          </div>
        </div>
      </div>

      <ul className="mt-6 space-y-2">
        {triggered.map((s) => {
          const m = signalMeta(s.code);
          return (
            <li key={s.code} className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2.5 text-sm font-medium text-slate-900 dark:text-white">
                  <span className="flex size-7 items-center justify-center rounded-lg bg-orange-50 text-orange-600 dark:bg-orange-400/10 dark:text-orange-300">
                    {m.icon}
                  </span>
                  {m.label}
                </span>
                <span className="tabular font-mono text-sm font-semibold text-orange-600 dark:text-orange-300">+{s.points}</span>
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600 dark:text-slate-400">{s.explanation}</p>
              {s.evidence.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {s.evidence.slice(0, 2).map((path) => (
                    <li key={path} className="flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-slate-500">
                      <FileIcon size={11} className="shrink-0" />
                      <span className="truncate">{path}</span>
                    </li>
                  ))}
                  {s.evidence.length > 2 && <li className="text-[11px] text-slate-500">+{s.evidence.length - 2} more</li>}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {passed.length > 0 && (
        <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span className="font-medium">Passed:</span>
          {passed.map((s) => (
            <span key={s.code} className="inline-flex items-center gap-1">
              <CheckIcon size={11} className="text-emerald-600 dark:text-emerald-400" />
              {signalMeta(s.code).label}
            </span>
          ))}
        </p>
      )}

      {footer && <p className="mt-4 text-xs text-slate-500">{footer}</p>}
    </div>
  );
}
