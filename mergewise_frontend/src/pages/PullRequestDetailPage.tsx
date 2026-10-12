import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { AppLayout } from "../components/AppLayout";
import {
  ArrowLeftIcon,
  BranchIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  ExternalLinkIcon,
  FileIcon,
  GithubIcon,
  PullRequestIcon,
  RepoIcon,
  ShieldCheckIcon,
  SparkleIcon,
} from "../components/icons";
import { RISK_META, RiskBadge, ScoreComposition, ScoreRing, signalMeta } from "../components/risk";
import { ButtonAnchor, ButtonLink, Card, CardHeader, EmptyState, ErrorState, StatusPill, cx } from "../components/ui";
import { ApiError, type PrIntelligenceResponse, type RiskAssessment, type RiskSignal } from "../lib/api";
import { formatDateTime, plural, timeAgo } from "../lib/format";
import { usePullRequest, usePullRequestIntelligence, usePullRequestRisk } from "../lib/use-pull-requests";

/** Concrete reviewer actions for each rule the engine can trigger —
 * deterministic, derived from the signals, not AI output. */
const REVIEW_CHECKS: Record<string, string> = {
  SENSITIVE_PATH: "Get a security-minded reviewer on the auth/config changes",
  MIGRATION_CHANGE: "Confirm the migration is reversible and safe to run on live data",
  NO_TEST_FILES: "Ask for tests that cover the new behaviour",
  DEPENDENCY_CHANGE: "Check new or upgraded packages for advisories and licences",
  DIFF_SIZE: "Consider splitting this into smaller, reviewable PRs",
  FILE_COUNT: "Walk through the change with the author — it touches many files",
};

export function PullRequestDetailPage() {
  const { pullId } = useParams<{ pullId: string }>();
  const pr = usePullRequest(pullId);
  const risk = usePullRequestRisk(pullId);
  const intelligence = usePullRequestIntelligence(pullId);

  if (pr.isLoading) {
    return (
      <AppLayout>
        <DetailSkeleton />
      </AppLayout>
    );
  }

  if (pr.isError || !pr.data) {
    const notFound = pr.error instanceof ApiError && pr.error.status === 404;
    return (
      <AppLayout>
        <BackLink />
        <Card className="mt-6">
          {notFound ? (
            <EmptyState
              icon={<PullRequestIcon size={18} />}
              title="Pull request not found"
              description="It may belong to a repository you're not connected to, or the link is out of date."
              action={<ButtonLink to="/pulls">Back to pull requests</ButtonLink>}
            />
          ) : (
            <ErrorState description="We couldn't load this pull request." onRetry={() => pr.refetch()} />
          )}
        </Card>
      </AppLayout>
    );
  }

  const data = pr.data;
  const [owner, repoName] = data.repository.fullName.split("/");

  return (
    <AppLayout>
      <BackLink />

      {/* Header */}
      <header className="mt-5 animate-fade-in-up">
        <Link
          to={`/pulls?repo=${data.repository.id}`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-slate-700 dark:hover:text-slate-300"
        >
          <RepoIcon size={13} />
          {owner}/<span className="text-slate-700 dark:text-slate-300">{repoName}</span>
        </Link>

        <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <h1 className="text-2xl font-semibold leading-tight tracking-tight text-slate-900 dark:text-white sm:text-[28px]">
            {data.title} <span className="font-normal text-slate-500">#{data.number}</span>
          </h1>
          <ButtonAnchor href={data.url} target="_blank" rel="noreferrer" className="self-start">
            <GithubIcon size={14} />
            Open on GitHub
            <ExternalLinkIcon size={12} className="text-slate-500" />
          </ButtonAnchor>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-600 dark:text-slate-400">
          <StatusPill state={data.state} mergedAt={data.mergedAt} />
          <span>
            <span className="font-medium text-slate-800 dark:text-slate-200">{data.author}</span> wants to merge
          </span>
          <BranchChip name={data.headBranch} />
          <span className="text-slate-400 dark:text-slate-600">→</span>
          <BranchChip name={data.baseBranch} />
        </div>
      </header>

      {/* Diff stats strip */}
      <div className="mt-6 grid animate-fade-in-up grid-cols-3 divide-x divide-slate-100 dark:divide-line overflow-hidden rounded-xl border border-slate-200 dark:border-line bg-white dark:bg-surface [animation-delay:40ms]">
        <Stat label="Additions" value={<span className="text-emerald-700 dark:text-emerald-300">+{data.additions}</span>} />
        <Stat label="Deletions" value={<span className="text-rose-600 dark:text-rose-300">−{data.deletions}</span>} />
        <Stat label="Files changed" value={data.changedFilesCount} />
      </div>

      <div className="mt-6 grid animate-fade-in-up grid-cols-1 gap-6 [animation-delay:80ms] lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-6">
          <RiskSection risk={risk.data} isLoading={risk.isLoading} isError={risk.isError} onRetry={() => risk.refetch()} />
          <AiSection
            data={intelligence.data}
            isLoading={intelligence.isLoading}
            error={intelligence.error}
            onRetry={() => intelligence.refetch()}
          />
          {data.body && (
            <Card>
              <CardHeader title="Description" />
              <div className="whitespace-pre-wrap break-words px-5 py-4 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                {data.body}
              </div>
            </Card>
          )}
        </div>

        <aside className="space-y-6">
          {risk.data && <ReviewChecklist signals={risk.data.rulesTriggered} />}

          <Card>
            <CardHeader title="Details" />
            <dl className="divide-y divide-slate-100 dark:divide-line text-sm">
              <DetailRow label="Repository">
                <Link to={`/pulls?repo=${data.repository.id}`} className="truncate text-slate-800 dark:text-slate-200 hover:text-emerald-700 dark:hover:text-emerald-300">
                  {data.repository.fullName}
                </Link>
              </DetailRow>
              <DetailRow label="Author">{data.author}</DetailRow>
              <DetailRow label="Opened">
                <span title={formatDateTime(data.createdAt)}>{timeAgo(data.createdAt)}</span>
              </DetailRow>
              <DetailRow label="Updated">
                <span title={formatDateTime(data.updatedAt)}>{timeAgo(data.updatedAt)}</span>
              </DetailRow>
              {data.mergedAt && (
                <DetailRow label="Merged">
                  <span title={formatDateTime(data.mergedAt)}>{timeAgo(data.mergedAt)}</span>
                </DetailRow>
              )}
              <DetailRow label="Head">
                <code className="font-mono text-xs text-slate-700 dark:text-slate-300">{data.headSha.slice(0, 7)}</code>
              </DetailRow>
              {risk.data && (
                <DetailRow label="Scored">
                  <span title={formatDateTime(risk.data.createdAt)}>
                    {timeAgo(risk.data.createdAt)} · engine {risk.data.engineVersion}
                  </span>
                </DetailRow>
              )}
            </dl>
          </Card>
        </aside>
      </div>
    </AppLayout>
  );
}

function RiskSection({
  risk,
  isLoading,
  isError,
  onRetry,
}: {
  risk?: RiskAssessment;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const [showPassed, setShowPassed] = useState(false);

  if (isLoading) {
    return (
      <Card>
        <CardHeader title="Risk assessment" icon={<ShieldCheckIcon size={15} />} />
        <div className="flex flex-col items-center gap-6 p-6 sm:flex-row">
          <div className="skeleton size-[132px] rounded-full" />
          <div className="w-full flex-1 space-y-3">
            <div className="skeleton h-5 w-40" />
            <div className="skeleton h-3 w-64 max-w-full" />
            <div className="skeleton mt-4 h-2.5 w-full rounded-full" />
          </div>
        </div>
        <p className="border-t border-slate-200 dark:border-line px-5 py-3 text-xs text-slate-500">
          Fetching changed files from GitHub and scoring them…
        </p>
      </Card>
    );
  }

  if (isError || !risk) {
    return (
      <Card>
        <CardHeader title="Risk assessment" icon={<ShieldCheckIcon size={15} />} />
        <ErrorState compact description="We couldn't score this pull request right now." onRetry={onRetry} />
      </Card>
    );
  }

  const triggered = risk.rulesTriggered.filter((s) => s.triggered).sort((a, b) => b.points - a.points);
  const passed = risk.rulesTriggered.filter((s) => !s.triggered);
  const meta = RISK_META[risk.level];

  return (
    <Card>
      <CardHeader
        title="Risk assessment"
        icon={<ShieldCheckIcon size={15} />}
        action={<RiskBadge level={risk.level} score={risk.score} />}
      />

      <div className="relative flex flex-col items-center gap-6 p-6 sm:flex-row sm:items-center">
        <ScoreRing score={risk.score} level={risk.level} />
        <div className="relative w-full min-w-0 flex-1">
          <p className={cx("text-lg font-semibold", meta.text)}>{meta.label} risk</p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {triggered.length === 0
              ? "No risk signals fired — this looks like a routine change."
              : `${plural(triggered.length, "signal")} fired out of ${risk.rulesTriggered.length} checks.`}
          </p>
          <div className="mt-5">
            <ScoreComposition signals={risk.rulesTriggered} level={risk.level} />
          </div>
        </div>
      </div>

      {triggered.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 border-t border-slate-200 dark:border-line p-4 sm:grid-cols-2 sm:p-5">
          {triggered.map((signal) => (
            <SignalCard key={signal.code} signal={signal} />
          ))}
        </ul>
      )}

      {passed.length > 0 && (
        <div className="border-t border-slate-200 dark:border-line">
          <button
            type="button"
            onClick={() => setShowPassed((v) => !v)}
            aria-expanded={showPassed}
            className="flex w-full items-center justify-between px-5 py-3 text-xs font-medium text-slate-600 dark:text-slate-400 transition-colors hover:text-slate-800 dark:hover:text-slate-200"
          >
            <span className="flex items-center gap-2">
              <CheckIcon size={13} className="text-emerald-600 dark:text-emerald-400" />
              {plural(passed.length, "check")} passed
            </span>
            <ChevronDownIcon size={14} className={cx("transition-transform", showPassed && "rotate-180")} />
          </button>
          {showPassed && (
            <ul className="animate-fade-in space-y-2 px-5 pb-4">
              {passed.map((signal) => {
                const m = signalMeta(signal.code);
                return (
                  <li key={signal.code} className="flex items-start gap-2.5 text-sm">
                    <span className="mt-0.5 text-slate-400 dark:text-slate-600">{m.icon}</span>
                    <div>
                      <p className="text-slate-700 dark:text-slate-300">{m.label}</p>
                      <p className="text-xs text-slate-500">{signal.explanation}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

function SignalCard({ signal }: { signal: RiskSignal }) {
  const meta = signalMeta(signal.code);
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? signal.evidence : signal.evidence.slice(0, 3);

  return (
    <li className="rounded-lg border border-slate-200 dark:border-line bg-slate-50 dark:bg-white/[0.015] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-orange-50 dark:bg-orange-400/10 text-orange-600 dark:text-orange-300">
            {meta.icon}
          </span>
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{meta.label}</p>
            {meta.hint && <p className="text-xs text-slate-500">{meta.hint}</p>}
          </div>
        </div>
        <span className="tabular shrink-0 rounded-md bg-slate-100 dark:bg-white/[0.05] px-1.5 py-0.5 font-mono text-xs font-medium text-slate-800 dark:text-slate-200">
          +{signal.points}
        </span>
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-slate-600 dark:text-slate-400">{signal.explanation}</p>
      {signal.evidence.length > 0 && (
        <ul className="mt-3 space-y-1">
          {visible.map((path) => (
            <li key={path} className="flex min-w-0 items-center gap-1.5 font-mono text-xs text-slate-700 dark:text-slate-300">
              <FileIcon size={12} className="shrink-0 text-slate-500" />
              <span className="truncate" title={path}>
                {path}
              </span>
            </li>
          ))}
          {signal.evidence.length > 3 && (
            <li>
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="text-xs text-slate-500 hover:text-emerald-700 dark:hover:text-emerald-300"
              >
                {expanded ? "Show less" : `+${signal.evidence.length - 3} more`}
              </button>
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

function ReviewChecklist({ signals }: { signals: RiskSignal[] }) {
  const items = signals.filter((s) => s.triggered && REVIEW_CHECKS[s.code]).sort((a, b) => b.points - a.points);
  const [done, setDone] = useState<Set<string>>(new Set());

  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader title="Review checklist" description={`${done.size} of ${items.length} done`} />
      <ul className="space-y-1 p-2">
        {items.map((s) => {
          const checked = done.has(s.code);
          return (
            <li key={s.code}>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    setDone((prev) => {
                      const next = new Set(prev);
                      if (next.has(s.code)) next.delete(s.code);
                      else next.add(s.code);
                      return next;
                    })
                  }
                  className="peer sr-only"
                />
                <span
                  className={cx(
                    "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-400/50",
                    checked ? "border-emerald-400 bg-emerald-400 text-emerald-950" : "border-slate-300 dark:border-line-strong",
                  )}
                >
                  {checked && <CheckIcon size={11} strokeWidth={2.5} />}
                </span>
                <span className={cx("text-[13px] leading-snug", checked ? "text-slate-500 line-through" : "text-slate-700 dark:text-slate-300")}>
                  {REVIEW_CHECKS[s.code]}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function AiSection({
  data,
  isLoading,
  error,
  onRetry,
}: {
  data?: PrIntelligenceResponse;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const header = (
    <CardHeader
      title="AI review"
      icon={<SparkleIcon size={15} />}
      action={<span className="rounded-full bg-indigo-50 dark:bg-indigo-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-indigo-600 dark:text-indigo-300">Beta</span>}
    />
  );

  if (isLoading) {
    return (
      <Card>
        {header}
        <div className="space-y-2.5 p-5">
          <div className="skeleton h-3 w-11/12" />
          <div className="skeleton h-3 w-4/5" />
          <div className="skeleton h-3 w-2/3" />
        </div>
      </Card>
    );
  }

  if (error) {
    const unavailable = error instanceof ApiError && error.status === 503;
    return (
      <Card>
        {header}
        {unavailable ? (
          <div className="flex items-start gap-3.5 p-5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-400/10 text-indigo-600 dark:text-indigo-300">
              <SparkleIcon size={16} />
            </span>
            <div>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">AI review isn't switched on</p>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
                The server has no AI key configured, so this pull request can't be explained right now. The risk score
                above doesn't depend on it.
              </p>
            </div>
          </div>
        ) : (
          <ErrorState compact description="We couldn't load the AI review." onRetry={onRetry} />
        )}
      </Card>
    );
  }

  if (!data) return null;

  if (data.status === "skipped_low_risk") {
    return (
      <Card>
        {header}
        <div className="flex items-start gap-3.5 p-5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-400/10 text-emerald-700 dark:text-emerald-300">
            <CheckIcon size={16} />
          </span>
          <div>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Skipped — low risk</p>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
              Routine changes don't get an AI review, which keeps the signal high and the cost low.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const ai = data.intelligence;
  return (
    <Card>
      {header}
      <div className="space-y-5 p-5">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="rounded-full px-2 py-0.5 text-slate-700 dark:text-slate-300 ring-1 ring-inset ring-slate-300 dark:ring-line-strong">
              {ai.confidence.toLowerCase()} confidence
            </span>
            <span className="flex items-center gap-1">
              <ClockIcon size={12} /> {timeAgo(ai.createdAt)} · {ai.llmModel}
            </span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate-800 dark:text-slate-200">{ai.summary}</p>
        </div>

        {ai.findings.length > 0 && (
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wider text-slate-500">Findings</h3>
            <ul className="mt-2.5 space-y-2.5">
              {ai.findings.map((f, i) => (
                <li key={i} className="rounded-lg border border-slate-200 dark:border-line bg-slate-50 dark:bg-white/[0.015] p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{f.title}</p>
                    <RiskBadge level={f.severity} size="sm" />
                  </div>
                  <p className="mt-1.5 text-[13px] text-slate-600 dark:text-slate-400">{f.reason}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {ai.recommendations.length > 0 && (
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wider text-slate-500">Recommendations</h3>
            <ul className="mt-2.5 space-y-2.5">
              {ai.recommendations.map((r, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-indigo-400" />
                  <div>
                    <p className="text-slate-800 dark:text-slate-200">{r.action}</p>
                    <p className="mt-0.5 text-[13px] text-slate-500">{r.reason}</p>
                    {r.source && <p className="mt-1 font-mono text-[11px] text-slate-400 dark:text-slate-600">Source: {r.source}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

function BackLink() {
  return (
    <Link
      to="/pulls"
      className="inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400 transition-colors hover:text-slate-900 dark:hover:text-slate-100"
    >
      <ArrowLeftIcon size={14} />
      Pull requests
    </Link>
  );
}

function BranchChip({ name }: { name: string }) {
  return (
    <code className="inline-flex max-w-[16rem] items-center gap-1 rounded-md bg-slate-100 dark:bg-white/[0.05] px-1.5 py-0.5 font-mono text-xs text-slate-700 dark:text-slate-300 ring-1 ring-inset ring-slate-200 dark:ring-line">
      <BranchIcon size={11} className="shrink-0 text-slate-500" />
      <span className="truncate">{name}</span>
    </code>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="px-4 py-3.5 sm:px-5">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="tabular mt-1 font-mono text-lg font-medium text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-2.5">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 truncate text-right text-slate-700 dark:text-slate-300">{children}</dd>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading pull request">
      <div className="skeleton h-4 w-28" />
      <div className="skeleton mt-6 h-3 w-40" />
      <div className="skeleton mt-3 h-8 w-3/4" />
      <div className="skeleton mt-4 h-5 w-1/2" />
      <div className="skeleton mt-6 h-[74px] w-full rounded-xl" />
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="skeleton h-72 rounded-xl" />
        <div className="skeleton h-72 rounded-xl" />
      </div>
    </div>
  );
}
