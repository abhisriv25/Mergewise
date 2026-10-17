import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AppLayout } from "../components/AppLayout";
import {
  AlertIcon,
  ArrowRightIcon,
  CheckIcon,
  GaugeIcon,
  PlusIcon,
  PullRequestIcon,
  RepoIcon,
  ShieldCheckIcon,
} from "../components/icons";
import { PullRequestRow, PullRequestRowSkeleton } from "../components/PullRequestRow";
import { RISK_META, RiskDistribution } from "../components/risk";
import { Banner, ButtonAnchor, ButtonLink, Card, CardHeader, EmptyState, ErrorState, PageHeader, cx } from "../components/ui";
import { githubInstallUrl, type RepositoryPullRequestSummary, type RiskLevel } from "../lib/api";
import { greeting, plural } from "../lib/format";
import { useCurrentUser } from "../lib/use-current-user";
import { usePullRequestSummary, usePullRequests } from "../lib/use-pull-requests";
import { useConnectedRepositories } from "../lib/use-repositories";
import { usePageTitle } from "../lib/use-page-title";

const QUEUE_SIZE = 6;
const EMPTY_RISK_COUNTS: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };

function levelForScore(score: number): RiskLevel {
  if (score >= 75) return "CRITICAL";
  if (score >= 50) return "HIGH";
  if (score >= 25) return "MEDIUM";
  return "LOW";
}

export function DashboardPage() {
  usePageTitle("Dashboard");
  const { data: user } = useCurrentUser();
  const repos = useConnectedRepositories();
  const summary = usePullRequestSummary();
  // The review queue: the riskiest open, ready-for-review PRs, ranked
  // server-side so it's right however many PRs there are.
  const queue = usePullRequests({ status: "open", sort: "risk", pageSize: QUEUE_SIZE });
  // Set by the API after an invitation is accepted at sign-in.
  const [searchParams] = useSearchParams();
  const justJoined = searchParams.get("joined") === "1";

  if (!user) return null; // ProtectedRoute handles loading and redirects

  const repositories = repos.repositories;
  const stats = summary.data;
  const openCount = stats?.open ?? 0;
  const riskCounts = stats?.openRiskCounts ?? EMPTY_RISK_COUNTS;
  const scoredOpenCount = Object.values(riskCounts).reduce((sum, n) => sum + n, 0);
  const needsAttention = stats?.needsAttention ?? 0;
  const avgScore = stats?.averageOpenScore ?? null;
  const topRisk = (queue.data?.pullRequests ?? []).filter((pr) => pr.latestRisk);
  const repoStats = new Map((stats?.repositories ?? []).map((r) => [r.repositoryId, r]));

  const firstName = (user.displayName ?? user.githubLogin).split(" ")[0];
  const org = user.organizations[0];
  const isAdmin = org?.role === "ADMIN";
  const loading = summary.isLoading;

  return (
    <AppLayout>
      <PageHeader
        eyebrow={new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        title={`${greeting()}, ${firstName}`}
        description={
          loading
            ? "Loading your review queue…"
            : needsAttention > 0
              ? `${plural(needsAttention, "pull request")} ${needsAttention === 1 ? "needs" : "need"} a careful review today.`
              : openCount > 0
                ? "Nothing high-risk in the queue. Nice."
                : "Your review queue is empty."
        }
        actions={
          <>
            <ButtonLink to="/pulls" variant="outline">
              <PullRequestIcon size={14} />
              All pull requests
            </ButtonLink>
            {isAdmin && (
              <ButtonAnchor href={githubInstallUrl()} variant="solid">
                <PlusIcon size={14} />
                Connect repo
              </ButtonAnchor>
            )}
          </>
        }
      />

      {justJoined && org && (
        <div className="mt-6">
          <Banner tone="success">
            <CheckIcon size={15} /> You've joined {org.name}. Its pull requests are below.
          </Banner>
        </div>
      )}

      <div className="mt-8 grid animate-fade-in-up grid-cols-2 gap-3 [animation-delay:60ms] lg:grid-cols-4 lg:gap-4">
        <StatCard
          label="Open pull requests"
          value={loading ? null : openCount}
          icon={<PullRequestIcon size={15} />}
          footnote={
            loading
              ? null
              : `${plural(stats?.tracked ?? 0, "PR")} tracked${stats?.draft ? ` · ${plural(stats.draft, "draft")}` : ""}`
          }
          href="/pulls"
        />
        <StatCard
          label="Needs attention"
          value={loading ? null : needsAttention}
          icon={<AlertIcon size={15} />}
          tone={needsAttention > 0 ? "warn" : "neutral"}
          footnote={loading ? null : "High + critical risk"}
          href="/pulls?risk=attention"
        />
        <StatCard
          label="Average risk"
          value={loading ? null : avgScore ?? "—"}
          icon={<GaugeIcon size={15} />}
          footnote={
            avgScore === null ? "No scored PRs yet" : (
              <span className={RISK_META[levelForScore(avgScore)].text}>{RISK_META[levelForScore(avgScore)].label} band</span>
            )
          }
        />
        <StatCard
          label="Repositories"
          value={repos.isLoading ? null : repositories.length}
          icon={<RepoIcon size={15} />}
          footnote={repos.isLoading ? null : repositories.length ? "Synced from GitHub" : "None connected"}
          href="/repositories"
        />
      </div>

      <div className="mt-6 grid animate-fade-in-up grid-cols-1 gap-6 [animation-delay:120ms] lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardHeader
            title="Review queue"
            description="Open PRs ranked by risk"
            action={
              openCount > 0 && (
                <Link to="/pulls" className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400 transition-colors hover:text-emerald-700 dark:hover:text-emerald-300">
                  View all <ArrowRightIcon size={12} />
                </Link>
              )
            }
          />
          {queue.isLoading ? (
            <PullRequestRowSkeleton count={4} />
          ) : queue.isError ? (
            <ErrorState description="We couldn't load pull requests. Check your connection and try again." onRetry={() => queue.refetch()} />
          ) : topRisk.length === 0 ? (
            <QueueEmpty hasRepos={repositories.length > 0} hasPrs={(stats?.tracked ?? 0) > 0} />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-line">
              {topRisk.map((pr, i) => (
                <PullRequestRow key={pr.id} pr={pr} index={i} showStatus={false} />
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Risk mix" description={`Across ${plural(scoredOpenCount, "open PR")}`} />
            <div className="p-5">
              {loading ? (
                <div className="space-y-4">
                  <div className="skeleton h-2.5 w-full rounded-full" />
                  <div className="grid grid-cols-2 gap-3">
                    {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-4" />)}
                  </div>
                </div>
              ) : (
                <RiskDistribution counts={riskCounts} />
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Repositories"
              action={
                <Link to="/repositories" className="text-xs text-slate-600 dark:text-slate-400 transition-colors hover:text-emerald-700 dark:hover:text-emerald-300">
                  Manage
                </Link>
              }
            />
            {repos.isLoading ? (
              <div className="space-y-3 p-5">
                {[0, 1].map((i) => <div key={i} className="skeleton h-8" />)}
              </div>
            ) : repos.isError ? (
              <ErrorState compact description="Couldn't load repositories." onRetry={() => repos.refetch()} />
            ) : repositories.length === 0 ? (
              <EmptyState
                compact
                icon={<RepoIcon size={18} />}
                title="No repositories yet"
                description="Install the GitHub App on a repo to start scoring its PRs."
                action={
                  <ButtonAnchor href={githubInstallUrl()} size="sm" variant="solid">
                    <PlusIcon size={13} /> Connect repository
                  </ButtonAnchor>
                }
              />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-line">
                {repositories.slice(0, 6).map((repo) => (
                  <RepoSummaryRow key={repo.id} repoId={repo.id} fullName={repo.fullName} stats={repoStats.get(repo.id)} />
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}

function StatCard({
  label,
  value,
  icon,
  footnote,
  tone = "neutral",
  href,
}: {
  label: string;
  value: number | string | null;
  icon: ReactNode;
  footnote?: ReactNode;
  tone?: "neutral" | "warn";
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{label}</span>
        <span
          className={cx(
            "flex size-7 items-center justify-center rounded-lg",
            tone === "warn" ? "bg-orange-50 dark:bg-orange-400/10 text-orange-600 dark:text-orange-300" : "bg-slate-100 dark:bg-white/[0.05] text-slate-600 dark:text-slate-400",
          )}
        >
          {icon}
        </span>
      </div>
      {value === null ? (
        <div className="skeleton mt-3 h-8 w-12" />
      ) : (
        <p className={cx("tabular mt-3 text-3xl font-semibold tracking-tight", tone === "warn" ? "text-orange-700 dark:text-orange-200" : "text-slate-900 dark:text-white")}>
          {value}
        </p>
      )}
      {footnote !== undefined && <p className="mt-1 truncate text-xs text-slate-500">{footnote ?? " "}</p>}
    </>
  );

  const classes = cx(
    "block rounded-xl border bg-white dark:bg-surface p-4 shadow-sm dark:shadow-card transition-all duration-200",
    tone === "warn" ? "border-orange-200 dark:border-orange-400/20" : "border-slate-200 dark:border-line",
    href && "hover:-translate-y-0.5 hover:border-slate-300 dark:hover:border-line-strong hover:bg-white dark:hover:bg-surface-raised",
  );

  return href ? (
    <Link to={href} className={classes}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}

function RepoSummaryRow({
  repoId,
  fullName,
  stats,
}: {
  repoId: string;
  fullName: string;
  stats?: RepositoryPullRequestSummary;
}) {
  const worst = stats?.worst;
  const [owner, name] = fullName.split("/");

  return (
    <li>
      <Link to={`/pulls?repo=${repoId}`} className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.025]">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-slate-100 dark:bg-white/[0.04] text-slate-600 dark:text-slate-400 ring-1 ring-inset ring-slate-200 dark:ring-line">
          <RepoIcon size={13} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-slate-800 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white">
            <span className="text-slate-500">{owner}/</span>
            {name}
          </p>
          <p className="text-xs text-slate-500">{plural(stats?.open ?? 0, "open PR")}</p>
        </div>
        {worst && <span className={cx("size-2 shrink-0 rounded-full", RISK_META[worst.level].dot)} title={`Highest: ${worst.level}`} />}
      </Link>
    </li>
  );
}

function QueueEmpty({ hasRepos, hasPrs }: { hasRepos: boolean; hasPrs: boolean }) {
  if (!hasRepos) {
    return (
      <EmptyState
        icon={<RepoIcon size={18} />}
        title="Connect your first repository"
        description="Mergewise installs as a read-only GitHub App. Pick the repos to watch and new pull requests are scored automatically."
        action={
          <ButtonAnchor href={githubInstallUrl()} variant="solid">
            <PlusIcon size={14} /> Connect repository
          </ButtonAnchor>
        }
      />
    );
  }
  return (
    <EmptyState
      icon={<ShieldCheckIcon size={18} />}
      title={hasPrs ? "Nothing open right now" : "No pull requests yet"}
      description={
        hasPrs
          ? "Every tracked PR is merged or closed. New ones show up here as soon as they're opened."
          : "Open a pull request on a connected repo — it'll appear here within seconds, already scored."
      }
    />
  );
}
