import { Link } from "react-router-dom";
import type { PullRequestListItem } from "../lib/api";
import { timeAgo } from "../lib/format";
import { ChevronRightIcon, PullRequestIcon } from "./icons";
import { RISK_META, RiskBadge } from "./risk";
import { StatusPill, cx } from "./ui";

export function PullRequestRow({
  pr,
  index = 0,
  showRepo = true,
  showStatus = true,
}: {
  pr: PullRequestListItem;
  index?: number;
  showRepo?: boolean;
  showStatus?: boolean;
}) {
  const level = pr.latestRisk?.level;
  const statusColor = pr.mergedAt ? "text-violet-600 dark:text-violet-400" : pr.state === "closed" ? "text-slate-500" : "text-emerald-600 dark:text-emerald-400";

  return (
    <li className="animate-fade-in" style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}>
      <Link
        to={`/pulls/${pr.id}`}
        className="group relative flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.025]"
      >
        {level && (
          <span
            className={cx("absolute inset-y-3 left-0 w-[3px] rounded-r-full opacity-70", RISK_META[level].bar)}
            aria-hidden="true"
          />
        )}
        <PullRequestIcon size={16} className={cx("hidden shrink-0 sm:block", statusColor)} />

        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-medium leading-snug text-slate-900 dark:text-slate-100 group-hover:text-slate-900 dark:group-hover:text-white sm:truncate">
            {pr.title}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500">
            {showRepo && <span className="text-slate-600 dark:text-slate-400">{pr.repository.fullName}</span>}
            <span className="font-mono">#{pr.number}</span>
            <span aria-hidden="true">·</span>
            <span>{pr.author}</span>
            <span aria-hidden="true">·</span>
            <span>updated {timeAgo(pr.updatedAt)}</span>
            <span className="hidden font-mono sm:inline">
              <span aria-hidden="true">· </span>
              <span className="text-emerald-600 dark:text-emerald-400/80">+{pr.additions}</span>{" "}
              <span className="text-rose-600 dark:text-rose-400/80">−{pr.deletions}</span>
            </span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          {showStatus && (
            <span className="hidden md:inline-flex">
              <StatusPill state={pr.state} mergedAt={pr.mergedAt} />
            </span>
          )}
          {pr.latestRisk ? (
            <RiskBadge level={pr.latestRisk.level} score={pr.latestRisk.score} />
          ) : (
            <span className="rounded-full px-2.5 py-0.5 text-xs text-slate-500 ring-1 ring-inset ring-slate-300 dark:ring-line-strong">
              Not scored
            </span>
          )}
          <ChevronRightIcon
            size={14}
            className="text-slate-400 dark:text-slate-600 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-600 dark:group-hover:text-slate-400"
          />
        </div>
      </Link>
    </li>
  );
}

export function PullRequestRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <ul className="divide-y divide-slate-100 dark:divide-line" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="flex items-center gap-4 px-5 py-4">
          <div className="skeleton hidden size-4 rounded-full sm:block" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3.5" style={{ width: `${60 - i * 7}%` }} />
            <div className="skeleton h-2.5 w-1/3" />
          </div>
          <div className="skeleton h-5 w-16 rounded-full" />
        </li>
      ))}
    </ul>
  );
}
