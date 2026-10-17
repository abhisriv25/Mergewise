import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AppLayout } from "../components/AppLayout";
import { AlertIcon, CheckIcon, ChevronRightIcon, FileIcon, LockIcon, PlusIcon, RefreshIcon, RepoIcon } from "../components/icons";
import { RISK_META, RiskBadge } from "../components/risk";
import { Banner, Button, ButtonAnchor, Card, CardHeader, EmptyState, ErrorState, PageHeader } from "../components/ui";
import { ApiError, githubInstallUrl, type Repository, type RepositoryPullRequestSummary } from "../lib/api";
import { plural, timeAgo } from "../lib/format";
import { useCurrentUser } from "../lib/use-current-user";
import { usePullRequestSummary } from "../lib/use-pull-requests";
import {
  useDisconnectRepository,
  useReconnectRepository,
  useRepositories,
  useSyncRepositories,
} from "../lib/use-repositories";
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

function errorMessage(err: unknown, fallback: string) {
  if (err instanceof ApiError && err.status === 429) return "Too many changes in a row. Wait a minute and try again.";
  return err instanceof ApiError ? err.message : fallback;
}

export function RepositoriesPage() {
  usePageTitle("Repositories");
  const [searchParams] = useSearchParams();
  const { data: user } = useCurrentUser();
  const repos = useRepositories();
  const summary = usePullRequestSummary();
  const sync = useSyncRepositories();
  const disconnect = useDisconnectRepository();
  const reconnect = useReconnectRepository();
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const isAdmin = user?.organizations[0]?.role === "ADMIN";
  const justConnected = searchParams.get("connected") === "1";
  const errorCode = searchParams.get("error");
  const redirectError = errorCode ? ERROR_MESSAGES[errorCode] ?? "Something went wrong. Please try again." : null;

  const all = repos.data?.repositories ?? [];
  const connected = all.filter((repo) => !repo.disconnectedAt);
  const disconnected = all.filter((repo) => repo.disconnectedAt);
  const repoStats = new Map((summary.data?.repositories ?? []).map((r) => [r.repositoryId, r]));

  function handleSync() {
    setNotice(null);
    sync.mutate(undefined, {
      onSuccess: ({ added, disconnected: removed }) =>
        setNotice({
          tone: "success",
          text:
            added === 0 && removed === 0
              ? "Already up to date with GitHub."
              : [added && `${plural(added, "repository", "repositories")} added`, removed && `${removed} no longer shared with Mergewise`]
                  .filter(Boolean)
                  .join(", ") + ".",
        }),
      onError: (err) => setNotice({ tone: "error", text: errorMessage(err, "We couldn't sync with GitHub. Please try again.") }),
    });
  }

  function handleDisconnect(repo: Repository) {
    const confirmed = window.confirm(
      `Disconnect ${repo.fullName}?\n\nIts pull requests will be hidden and new activity ignored until you reconnect it. Nothing is deleted.`,
    );
    if (!confirmed) return;
    setNotice(null);
    disconnect.mutate(repo.id, {
      onSuccess: () => setNotice({ tone: "success", text: `${repo.fullName} disconnected. You can reconnect it below.` }),
      onError: (err) => setNotice({ tone: "error", text: errorMessage(err, "We couldn't disconnect that repository.") }),
    });
  }

  function handleReconnect(repo: Repository) {
    setNotice(null);
    reconnect.mutate(repo.id, {
      onSuccess: () => setNotice({ tone: "success", text: `${repo.fullName} reconnected. Its docs are being indexed.` }),
      onError: (err) => setNotice({ tone: "error", text: errorMessage(err, "We couldn't reconnect that repository.") }),
    });
  }

  return (
    <AppLayout>
      <PageHeader
        title="Repositories"
        description={
          connected.length > 0
            ? `${plural(connected.length, "repository", "repositories")} connected. Pull requests are scored as soon as they're opened.`
            : "Connect a repository to start scoring its pull requests."
        }
        actions={
          <>
            {isAdmin && all.length > 0 && (
              <Button onClick={handleSync} disabled={sync.isPending} title="Re-read which repositories the GitHub App can see">
                <RefreshIcon size={14} className={sync.isPending ? "animate-spin" : ""} />
                <span className="hidden sm:inline">Sync with GitHub</span>
              </Button>
            )}
            <ButtonAnchor href={githubInstallUrl()} variant="solid">
              <PlusIcon size={14} />
              {all.length > 0 ? "Add repositories" : "Connect repository"}
            </ButtonAnchor>
          </>
        }
      />

      {(justConnected || redirectError || notice) && (
        <div className="mt-6 space-y-2">
          {justConnected && (
            <Banner tone="success">
              <CheckIcon size={15} /> Repositories connected.
            </Banner>
          )}
          {redirectError && (
            <Banner tone="error">
              <AlertIcon size={15} /> {redirectError}
            </Banner>
          )}
          {notice && (
            <Banner tone={notice.tone}>
              {notice.tone === "success" ? <CheckIcon size={15} /> : <AlertIcon size={15} />} {notice.text}
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
        ) : connected.length === 0 && disconnected.length === 0 ? (
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
            {connected.map((repo, i) => (
              <RepoCard
                key={repo.id}
                repo={repo}
                stats={repoStats.get(repo.id)}
                index={i}
                onDisconnect={isAdmin ? () => handleDisconnect(repo) : undefined}
                busy={disconnect.isPending && disconnect.variables === repo.id}
              />
            ))}
            <li>
              <a
                href={githubInstallUrl()}
                className="group flex h-full min-h-[148px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 dark:border-line-strong text-sm text-slate-500 transition-colors hover:border-emerald-500 dark:hover:border-emerald-400/40 hover:bg-emerald-50 dark:hover:bg-emerald-400/[0.03] hover:text-emerald-700 dark:hover:text-emerald-300"
              >
                <span className="flex size-9 items-center justify-center rounded-lg bg-slate-100 dark:bg-white/[0.04] transition-colors group-hover:bg-emerald-50 dark:group-hover:bg-emerald-400/10">
                  <PlusIcon size={16} />
                </span>
                Add repositories on GitHub
              </a>
            </li>
          </ul>
        )}

        {disconnected.length > 0 && (
          <Card className="mt-8">
            <CardHeader
              title="Disconnected"
              description="Not tracked right now. Their history is kept, so reconnecting brings it back."
            />
            <ul className="divide-y divide-slate-100 dark:divide-line">
              {disconnected.map((repo) => (
                <li key={repo.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-slate-100 dark:bg-white/[0.04] text-slate-500 ring-1 ring-inset ring-slate-200 dark:ring-line">
                    <RepoIcon size={13} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-700 dark:text-slate-300">
                      <span className="text-slate-500">{repo.owner}/</span>
                      {repo.name}
                    </p>
                    <p className="text-xs text-slate-500">Disconnected {timeAgo(repo.disconnectedAt!)}</p>
                  </div>
                  {isAdmin && (
                    <Button
                      size="sm"
                      onClick={() => handleReconnect(repo)}
                      disabled={reconnect.isPending && reconnect.variables === repo.id}
                    >
                      Reconnect
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

function RepoCard({
  repo,
  stats,
  index,
  onDisconnect,
  busy,
}: {
  repo: Repository;
  stats?: RepositoryPullRequestSummary;
  index: number;
  onDisconnect?: () => void;
  busy: boolean;
}) {
  const open = stats?.open ?? 0;
  const attention = stats?.needsAttention ?? 0;
  const worst = stats?.worst;

  return (
    <li className="animate-fade-in" style={{ animationDelay: `${index * 50}ms` }}>
      <div className="flex h-full flex-col rounded-xl border border-slate-200 dark:border-line bg-white dark:bg-surface shadow-sm dark:shadow-card transition-all duration-200 hover:border-slate-300 dark:hover:border-line-strong">
        <Link
          to={`/pulls?repo=${repo.id}`}
          className="group flex flex-1 flex-col rounded-t-xl p-5 transition-colors hover:bg-slate-50/60 dark:hover:bg-surface-raised"
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
            <Metric label="Open PRs" value={open} />
            <Metric label="Need attention" value={attention} className={attention > 0 ? RISK_META.HIGH.text : undefined} />
            <Metric label="Tracked" value={stats?.tracked ?? 0} />
          </div>

          <div className="mt-auto flex items-center justify-between gap-3 border-t border-slate-200 dark:border-line pt-3.5 text-xs text-slate-500">
            {worst ? (
              <span className="flex min-w-0 items-center gap-2">
                <span className="shrink-0">Riskiest:</span>
                <RiskBadge level={worst.level} score={worst.score} size="sm" />
              </span>
            ) : (
              <span>Connected {timeAgo(repo.connectedAt)}</span>
            )}
            <ChevronRightIcon size={14} className="shrink-0 text-slate-400 dark:text-slate-600 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-600 dark:group-hover:text-slate-400" />
          </div>
        </Link>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 dark:border-line px-5 py-2 text-xs text-slate-500">
          <span className="flex min-w-0 items-center gap-1.5" title="README.md and docs/ are indexed so AI review can cite them">
            <FileIcon size={12} className="shrink-0" />
            <span className="truncate">{repo.docsIndexedAt ? `Docs indexed ${timeAgo(repo.docsIndexedAt)}` : "Docs not indexed yet"}</span>
          </span>
          {onDisconnect && (
            <Button size="sm" variant="subtle" onClick={onDisconnect} disabled={busy} className="-mr-2">
              Disconnect
            </Button>
          )}
        </div>
      </div>
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
