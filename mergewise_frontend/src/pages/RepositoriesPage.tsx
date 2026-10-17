import { Link, useSearchParams } from "react-router-dom";
import { AppLayout } from "../components/AppLayout";
import { AlertIcon, CheckIcon, ChevronRightIcon, LockIcon, PlusIcon, RepoIcon } from "../components/icons";
import { RISK_META, RiskBadge } from "../components/risk";
import { Banner, ButtonAnchor, Card, EmptyState, ErrorState, PageHeader } from "../components/ui";
import { githubInstallUrl, type PullRequestListItem, type Repository } from "../lib/api";
import { plural, timeAgo } from "../lib/format";
import { usePullRequests } from "../lib/use-pull-requests";
import { useRepositories } from "../lib/use-repositories";
import { usePageTitle } from "../lib/use-page-title";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_callback: "GitHub didn't send back what we expected. Please try connecting again.",
  invalid_state: "That connection request expired or was already used. Please try again.",
  install_failed: "We couldn't finish syncing your repositories. Please try again.",
  admin_only: "Only your organization's admins can connect repositories. Ask one of them to add the repo.",
  not_account_owner:
    "Only an owner of that GitHub account can connect it. Ask a GitHub organization owner to connect it from their Mergewise admin account.",
  account_mismatch:
    "This organization is already linked to a different GitHub account. Install Mergewise on that same account to add more repositories.",
  account_taken: "That GitHub account is already linked to another Mergewise organization.",
  app_permission_missing:
    "The Mergewise GitHub App needs the new “Members: read” permission. A GitHub organization owner can accept it under Settings → GitHub Apps → Mergewise, then try again.",
};

export function RepositoriesPage() {
  usePageTitle("Repositories");
  const [searchParams] = useSearchParams();
  const repos = useRepositories();
  const prs = usePullRequests();

  const justConnected = searchParams.get("connected") === "1";
  const errorCode = searchParams.get("error");
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] ?? "Something went wrong. Please try again." : null;

  const repositories = repos.data?.repositories ?? [];
  const pullRequests = prs.data?.pullRequests ?? [];

  return (
    <AppLayout>
      <PageHeader
        title="Repositories"
        description={
          repositories.length > 0
            ? `${plural(repositories.length, "repository", "repositories")} connected. Pull requests are scored as soon as they're opened.`
            : "Connect a repository to start scoring its pull requests."
        }
        actions={
          <ButtonAnchor href={githubInstallUrl()} variant="solid">
            <PlusIcon size={14} />
            Connect repository
          </ButtonAnchor>
        }
      />

      {(justConnected || errorMessage) && (
        <div className="mt-6">
          {justConnected && (
            <Banner tone="success">
              <CheckIcon size={15} /> Repositories connected.
            </Banner>
          )}
          {errorMessage && (
            <Banner tone="error">
              <AlertIcon size={15} /> {errorMessage}
            </Banner>
          )}
        </div>
      )}

      <div className="mt-8 animate-fade-in-up [animation-delay:60ms]">
        {repos.isLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-[148px] rounded-xl" />
            ))}
          </div>
        ) : repos.isError ? (
          <Card>
            <ErrorState description="We couldn't load your repositories." onRetry={() => repos.refetch()} />
          </Card>
        ) : repositories.length === 0 ? (
          <Card>
            <EmptyState
              icon={<RepoIcon size={18} />}
              title="Nothing connected yet"
              description="Install the Mergewise GitHub App and choose which repositories to watch. It only asks for read access."
              action={
                <ButtonAnchor href={githubInstallUrl()} variant="solid">
                  <PlusIcon size={14} /> Connect repository
                </ButtonAnchor>
              }
            />
          </Card>
        ) : (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {repositories.map((repo, i) => (
              <RepoCard key={repo.id} repo={repo} pullRequests={pullRequests} index={i} />
            ))}
            <li>
              <a
                href={githubInstallUrl()}
                className="group flex h-full min-h-[148px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 dark:border-line-strong text-sm text-slate-500 transition-colors hover:border-emerald-500 dark:hover:border-emerald-400/40 hover:bg-emerald-50 dark:hover:bg-emerald-400/[0.03] hover:text-emerald-700 dark:hover:text-emerald-300"
              >
                <span className="flex size-9 items-center justify-center rounded-lg bg-slate-100 dark:bg-white/[0.04] transition-colors group-hover:bg-emerald-50 dark:group-hover:bg-emerald-400/10">
                  <PlusIcon size={16} />
                </span>
                Add or remove repositories
              </a>
            </li>
          </ul>
        )}
      </div>
    </AppLayout>
  );
}

function RepoCard({ repo, pullRequests, index }: { repo: Repository; pullRequests: PullRequestListItem[]; index: number }) {
  const repoPrs = pullRequests.filter((pr) => pr.repository.id === repo.id);
  const open = repoPrs.filter((pr) => pr.state === "open");
  const attention = open.filter((pr) => pr.latestRisk?.level === "HIGH" || pr.latestRisk?.level === "CRITICAL");
  const worst = open
    .filter((pr) => pr.latestRisk)
    .sort((a, b) => b.latestRisk!.score - a.latestRisk!.score)[0];

  return (
    <li className="animate-fade-in" style={{ animationDelay: `${index * 50}ms` }}>
      <Link
        to={`/pulls?repo=${repo.id}`}
        className="group flex h-full flex-col rounded-xl border border-slate-200 dark:border-line bg-white dark:bg-surface p-5 shadow-sm dark:shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 dark:hover:border-line-strong hover:bg-white dark:hover:bg-surface-raised"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-400/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20 dark:ring-emerald-400/20">
              <RepoIcon size={16} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{repo.name}</p>
              <p className="truncate text-xs text-slate-500">{repo.owner}</p>
            </div>
          </div>
          {repo.private && (
            <span className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-slate-600 dark:text-slate-400 ring-1 ring-inset ring-slate-300 dark:ring-line-strong">
              <LockIcon size={10} /> Private
            </span>
          )}
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          <Metric label="Open PRs" value={open.length} />
          <Metric
            label="Need attention"
            value={attention.length}
            className={attention.length > 0 ? RISK_META.HIGH.text : undefined}
          />
          <Metric label="Tracked" value={repoPrs.length} />
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-slate-200 dark:border-line pt-3.5 text-xs text-slate-500">
          {worst?.latestRisk ? (
            <span className="flex min-w-0 items-center gap-2">
              <span className="shrink-0">Riskiest:</span>
              <RiskBadge level={worst.latestRisk.level} score={worst.latestRisk.score} size="sm" />
            </span>
          ) : (
            <span>Connected {timeAgo(repo.connectedAt)}</span>
          )}
          <ChevronRightIcon size={14} className="shrink-0 text-slate-400 dark:text-slate-600 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-600 dark:group-hover:text-slate-400" />
        </div>
      </Link>
    </li>
  );
}

function Metric({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className="mb-4">
      <p className={`tabular text-xl font-semibold ${className ?? "text-slate-900 dark:text-slate-100"}`}>{value}</p>
      <p className="mt-0.5 text-[11px] text-slate-500">{label}</p>
    </div>
  );
}
