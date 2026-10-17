import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, NavLink, useLocation } from "react-router-dom";
import { logout } from "../lib/api";
import { useCurrentUser } from "../lib/use-current-user";
import { usePullRequestSummary } from "../lib/use-pull-requests";
import { CloseIcon, HomeIcon, LogOutIcon, MenuIcon, LogoMark, PullRequestIcon, RepoIcon, UsersIcon, Wordmark } from "./icons";
import { GridLines } from "./PublicLayout";
import { ThemeToggle } from "./ThemeToggle";
import { Avatar, cx } from "./ui";

const NAV = [
  { to: "/", label: "Overview", icon: HomeIcon, end: true },
  { to: "/pulls", label: "Pull requests", icon: PullRequestIcon, end: false },
  { to: "/repositories", label: "Repositories", icon: RepoIcon, end: false },
];

/** Only shown to admins; the API enforces the same rule. */
const ADMIN_NAV = [{ to: "/members", label: "Members", icon: UsersIcon, end: false }];

export function AppLayout({ children, width = "wide" }: { children: ReactNode; width?: "wide" | "narrow" }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setMenuOpen(false), [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <div className="relative min-h-screen bg-slate-50 dark:bg-canvas">
      <Backdrop />

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-slate-200 dark:border-line bg-white/80 dark:bg-canvas/80 backdrop-blur-xl lg:block">
        <SidebarContent />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 dark:border-line bg-white/80 dark:bg-canvas/80 px-4 backdrop-blur-xl lg:hidden">
        <Brand />
        <div className="flex items-center gap-1.5">
        <ThemeToggle />
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="flex size-9 items-center justify-center rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
          aria-label="Open menu"
        >
          <MenuIcon size={18} />
        </button>
        </div>
      </header>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-sm" onClick={() => setMenuOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] animate-slide-in-left border-r border-slate-200 dark:border-line bg-white dark:bg-surface">
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="absolute right-3 top-3.5 flex size-8 items-center justify-center rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
              aria-label="Close menu"
            >
              <CloseIcon size={16} />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      <main className="relative lg:pl-60">
        <div className={cx("mx-auto px-4 py-8 sm:px-8 sm:py-10", width === "wide" ? "max-w-6xl" : "max-w-4xl")}>
          {children}
        </div>
      </main>
    </div>
  );
}

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <LogoMark size={32} className="shrink-0" />
      <Wordmark className="text-[16px] font-semibold tracking-tight text-slate-900 dark:text-white" />
    </Link>
  );
}

function SidebarContent() {
  const { data: user } = useCurrentUser();
  const { data: summary } = usePullRequestSummary();
  const queryClient = useQueryClient();

  const attentionCount = summary?.needsAttention ?? 0;

  async function handleLogout() {
    await logout().catch(() => undefined);
    queryClient.clear();
    window.location.href = "/";
  }

  const org = user?.organizations[0];

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center px-4 lg:h-16">
        <Brand />
      </div>

      {org && (
        <div className="mx-3 mb-2 flex items-center gap-2.5 rounded-lg border border-slate-200 dark:border-line bg-slate-50 dark:bg-white/[0.02] px-2.5 py-2">
          <span className="flex size-6 items-center justify-center rounded-md bg-gradient-to-br from-emerald-400/40 to-indigo-400/40 text-[11px] font-semibold uppercase text-slate-900 dark:text-white">
            {org.name.slice(0, 1)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-slate-800 dark:text-slate-200">{org.name}</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">{org.role.toLowerCase()}</p>
          </div>
        </div>
      )}

      <nav className="mt-2 flex-1 space-y-0.5 px-3" aria-label="Main">
        <p className="px-2.5 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-600">Workspace</p>
        {[...NAV, ...(org?.role === "ADMIN" ? ADMIN_NAV : [])].map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cx(
                "group relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors",
                isActive ? "bg-slate-100 dark:bg-white/[0.07] text-slate-900 dark:text-white" : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.04] hover:text-slate-800 dark:hover:text-slate-200",
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute -left-3 h-5 w-[3px] rounded-r-full bg-emerald-400" />}
                <Icon size={16} className={isActive ? "text-emerald-700 dark:text-emerald-300" : "text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300"} />
                {label}
                {to === "/pulls" && attentionCount > 0 && (
                  <span
                    className="tabular ml-auto rounded-full bg-orange-100 dark:bg-orange-400/15 px-1.5 py-px text-[10px] font-semibold text-orange-600 dark:text-orange-300"
                    title={`${attentionCount} high-risk open PRs`}
                  >
                    {attentionCount}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="flex gap-3 px-5 pb-3 text-[11px] text-slate-400 dark:text-slate-600">
        <Link to="/about" className="hover:text-slate-700 dark:hover:text-slate-300">About</Link>
        <Link to="/privacy" className="hover:text-slate-700 dark:hover:text-slate-300">Privacy</Link>
        <Link to="/terms" className="hover:text-slate-700 dark:hover:text-slate-300">Terms</Link>
      </div>

      {user && (
        <div className="border-t border-slate-200 dark:border-line p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5">
            <Avatar src={user.avatarUrl} name={user.githubLogin} size={30} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{user.displayName ?? user.githubLogin}</p>
              <p className="truncate text-xs text-slate-500">@{user.githubLogin}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="flex size-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:text-slate-800 dark:hover:text-slate-200"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOutIcon size={15} />
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-slate-100 py-1 pl-3 pr-1 dark:bg-white/[0.04]">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Appearance</span>
            <ThemeToggle className="size-8" />
          </div>
        </div>
      )}
    </div>
  );
}

/** Subtle ambient glow + fading grid behind every app page. */
function Backdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute -top-48 right-[-12rem] h-[32rem] w-[32rem] animate-blob-drift-slow rounded-full bg-emerald-200/40 blur-[140px] dark:bg-emerald-500/[0.07]" />
      <div className="absolute left-[10%] top-[40%] h-[26rem] w-[26rem] animate-blob-drift rounded-full bg-sky-200/30 blur-[130px] dark:bg-indigo-500/[0.06]" />
      <GridLines
        className="text-slate-300/50 dark:text-white/[0.035]"
        mask="radial-gradient(ellipse 70% 45% at 60% 0%, black 10%, transparent 80%)"
      />
    </div>
  );
}
