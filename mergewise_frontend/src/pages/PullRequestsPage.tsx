import { useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { AppLayout } from "../components/AppLayout";
import { ChevronDownIcon, PullRequestIcon, RefreshIcon, SearchIcon } from "../components/icons";
import { PullRequestRow, PullRequestRowSkeleton } from "../components/PullRequestRow";
import { RISK_LEVELS, RISK_META } from "../components/risk";
import { Button, Card, EmptyState, ErrorState, Kbd, PageHeader, cx } from "../components/ui";
import type { PullRequestListItem, RiskLevel } from "../lib/api";
import { plural } from "../lib/format";
import { usePullRequests } from "../lib/use-pull-requests";
import { useRepositories } from "../lib/use-repositories";

type StatusFilter = "open" | "merged" | "closed" | "all";
type SortKey = "risk" | "updated";

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "merged", label: "Merged" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
];

function statusOf(pr: PullRequestListItem): Exclude<StatusFilter, "all"> {
  if (pr.mergedAt) return "merged";
  return pr.state === "closed" ? "closed" : "open";
}

export function PullRequestsPage() {
  const [params, setParams] = useSearchParams();
  const repoId = params.get("repo") ?? "";
  const status = (params.get("status") as StatusFilter) || "open";
  const riskParam = params.get("risk") ?? "";
  const query = params.get("q") ?? "";
  const sort = (params.get("sort") as SortKey) || "risk";

  const selectedLevels = useMemo<RiskLevel[]>(() => {
    if (riskParam === "attention") return ["CRITICAL", "HIGH"];
    return riskParam.split(",").filter((l): l is RiskLevel => (RISK_LEVELS as string[]).includes(l));
  }, [riskParam]);

  const prs = usePullRequests();
  const repos = useRepositories();
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace: true });
  }

  function toggleLevel(level: RiskLevel) {
    const set = new Set(selectedLevels);
    if (set.has(level)) set.delete(level);
    else set.add(level);
    update({ risk: RISK_LEVELS.filter((l) => set.has(l)).join(",") || null });
  }

  const all = prs.data?.pullRequests ?? [];
  const inRepo = repoId ? all.filter((pr) => pr.repository.id === repoId) : all;

  const statusCounts = inRepo.reduce(
    (acc, pr) => {
      acc[statusOf(pr)] += 1;
      acc.all += 1;
      return acc;
    },
    { open: 0, merged: 0, closed: 0, all: 0 } as Record<StatusFilter, number>,
  );

  const needle = query.trim().toLowerCase();
  const filtered = inRepo
    .filter((pr) => status === "all" || statusOf(pr) === status)
    .filter((pr) => selectedLevels.length === 0 || (pr.latestRisk && selectedLevels.includes(pr.latestRisk.level)))
    .filter(
      (pr) =>
        !needle ||
        pr.title.toLowerCase().includes(needle) ||
        pr.author.toLowerCase().includes(needle) ||
        pr.repository.fullName.toLowerCase().includes(needle) ||
        `#${pr.number}`.includes(needle),
    )
    .sort((a, b) =>
      sort === "risk"
        ? (b.latestRisk?.score ?? -1) - (a.latestRisk?.score ?? -1) || b.updatedAt.localeCompare(a.updatedAt)
        : b.updatedAt.localeCompare(a.updatedAt),
    );

  const repoName = repos.data?.repositories.find((r) => r.id === repoId)?.fullName;
  const hasFilters = Boolean(needle || selectedLevels.length || repoId);

  return (
    <AppLayout>
      <PageHeader
        title="Pull requests"
        description={repoName ? `In ${repoName}` : "Every tracked pull request across your connected repositories."}
        inlineActions
        actions={
          <Button onClick={() => prs.refetch()} disabled={prs.isFetching} aria-label="Refresh">
            <RefreshIcon size={14} className={prs.isFetching ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        }
      />

      <Card className="mt-8 animate-fade-in-up [animation-delay:60ms]">
        {/* Toolbar */}
        <div className="space-y-3 border-b border-slate-200 dark:border-line p-3 sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="relative flex-1">
              <span className="sr-only">Search pull requests</span>
              <SearchIcon size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => update({ q: e.target.value || null })}
                placeholder="Search by title, author, repo or #number"
                className="h-9 w-full rounded-lg border border-slate-300 dark:border-line-strong bg-white dark:bg-canvas/60 pl-9 pr-10 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:border-emerald-400/50 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:focus:ring-emerald-400/20"
              />
              <span className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 sm:block">
                <Kbd>/</Kbd>
              </span>
            </label>

            <div className="flex gap-2">
              <Select
                label="Repository"
                value={repoId}
                onChange={(v) => update({ repo: v || null })}
                options={[
                  { value: "", label: "All repositories" },
                  ...(repos.data?.repositories ?? []).map((r) => ({ value: r.id, label: r.fullName })),
                ]}
              />
              <Select
                label="Sort"
                value={sort}
                onChange={(v) => update({ sort: v === "risk" ? null : v })}
                options={[
                  { value: "risk", label: "Highest risk" },
                  { value: "updated", label: "Recently updated" },
                ]}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Status">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.key}
                  role="tab"
                  aria-selected={status === tab.key}
                  onClick={() => update({ status: tab.key === "open" ? null : tab.key })}
                  className={cx(
                    "flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-xs font-medium transition-colors",
                    status === tab.key ? "bg-slate-100 dark:bg-white/[0.08] text-slate-900 dark:text-white" : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.04] hover:text-slate-800 dark:hover:text-slate-200",
                  )}
                >
                  {tab.label}
                  <span className="tabular rounded-full bg-slate-100 dark:bg-white/[0.06] px-1.5 text-[10px] text-slate-600 dark:text-slate-400">
                    {statusCounts[tab.key]}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1.5" aria-label="Filter by risk">
              {RISK_LEVELS.map((level) => {
                const active = selectedLevels.includes(level);
                const meta = RISK_META[level];
                return (
                  <button
                    key={level}
                    onClick={() => toggleLevel(level)}
                    aria-pressed={active}
                    className={cx(
                      "flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium ring-1 ring-inset transition-all",
                      active ? cx(meta.bg, meta.text, meta.ring) : "text-slate-600 dark:text-slate-400 ring-slate-300 dark:ring-line-strong hover:text-slate-800 dark:hover:text-slate-200",
                    )}
                  >
                    <span className={cx("size-1.5 rounded-full", meta.dot)} />
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Results */}
        {prs.isLoading ? (
          <PullRequestRowSkeleton count={6} />
        ) : prs.isError ? (
          <ErrorState description="We couldn't load pull requests. Check your connection and try again." onRetry={() => prs.refetch()} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={hasFilters ? <SearchIcon size={18} /> : <PullRequestIcon size={18} />}
            title={hasFilters ? "No pull requests match" : status === "open" ? "No open pull requests" : `No ${status} pull requests`}
            description={
              hasFilters
                ? "Try a different search, or clear the filters to see everything."
                : "New pull requests on your connected repos appear here within seconds of being opened."
            }
            action={
              hasFilters && (
                <Button size="sm" onClick={() => setParams(status === "open" ? {} : { status }, { replace: true })}>
                  Clear filters
                </Button>
              )
            }
          />
        ) : (
          <>
            <ul className="divide-y divide-slate-100 dark:divide-line">
              {filtered.map((pr, i) => (
                <PullRequestRow key={pr.id} pr={pr} index={i} showRepo={!repoId} />
              ))}
            </ul>
            <div className="border-t border-slate-200 dark:border-line px-5 py-2.5 text-xs text-slate-500">
              Showing {plural(filtered.length, "pull request")}
              {filtered.length !== inRepo.length && ` of ${inRepo.length}`}
            </div>
          </>
        )}
      </Card>
    </AppLayout>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="relative min-w-0 flex-1 sm:flex-none">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full appearance-none truncate rounded-lg border border-slate-300 dark:border-line-strong bg-white dark:bg-canvas/60 pl-3 pr-8 text-sm text-slate-800 dark:text-slate-200 focus:border-emerald-400/50 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:focus:ring-emerald-400/20 sm:w-auto sm:max-w-[14rem]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-white dark:bg-surface-overlay">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
    </label>
  );
}
