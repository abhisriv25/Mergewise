import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  AlertIcon,
  CheckIcon,
  ClockIcon,
  GaugeIcon,
  GithubIcon,
  LockIcon,
  LogoMark,
  Wordmark,
  MailIcon,
  PullRequestIcon,
  ShieldCheckIcon,
  UsersIcon,
} from "../components/icons";
import { GridLines } from "../components/PublicLayout";
import { ThemeToggle } from "../components/ThemeToggle";
import { Avatar, ButtonAnchor, ButtonLink, cx } from "../components/ui";
import { ApiError, fetchInvitationPreview, githubLoginUrlForInvite, type InvitationPreview } from "../lib/api";
import { formatDateTime, timeAgo } from "../lib/format";

/** The GitHub account invitees must belong to, phrased for a sentence. */
function githubRequirement(preview: InvitationPreview): string | null {
  if (!preview.githubAccountLogin) return null;
  return preview.githubAccountType === "Organization"
    ? `a member of the ${preview.githubAccountLogin} GitHub organization`
    : `a collaborator on ${preview.githubAccountLogin}'s repositories`;
}

/** Why accepting failed, from the ?error= the API's sign-in callback adds. */
function failureMessage(code: string, preview: InvitationPreview | undefined): { title: string; body: string } {
  const inviter = preview?.invitedBy ?? "the person who invited you";
  switch (code) {
    case "expired":
      return { title: "This invitation has expired", body: `Invitations last 24 hours. Ask ${inviter} to send you a new one.` };
    case "used":
      return { title: "This invitation was already used", body: "Each link works once. Ask for a new one if you still need to join." };
    case "revoked":
      return { title: "This invitation was cancelled", body: "Ask the organization's admin if you still need access." };
    case "other_organization":
      return {
        title: "You're already in another organization",
        body: "Your GitHub account belongs to a different Mergewise organization, and you can only be in one for now.",
      };
    case "not_linked":
      return {
        title: "This team isn't ready for invitations yet",
        body: "Its admin needs to connect the team's GitHub account first. Let them know, then try the link again.",
      };
    case "not_in_github": {
      const requirement = preview ? githubRequirement(preview) : null;
      return {
        title: "That GitHub account isn't part of the team",
        body: requirement
          ? `The account you signed in with isn't ${requirement}. Try a different GitHub account, or ask an owner to add you on GitHub first.`
          : "The account you signed in with isn't part of this team on GitHub.",
      };
    }
    case "github_unavailable":
      return {
        title: "We couldn't reach GitHub",
        body: "Nothing was changed. Please try again in a minute.",
      };
    default:
      return {
        title: "This invitation link isn't valid",
        body: "Check that you opened the whole link, or ask for a new one.",
      };
  }
}

const PERKS = [
  { icon: GaugeIcon, title: "Every PR scored for risk", text: "Size, sensitive paths, migrations and missing tests — weighed the same way every time." },
  { icon: PullRequestIcon, title: "One review queue", text: "Open pull requests across your team's repositories, riskiest first." },
  { icon: ShieldCheckIcon, title: "Read-only by design", text: "Mergewise never writes to your code or your pull requests." },
];

const STEPS = [
  { title: "Continue with GitHub", text: "Sign in with your own account." },
  { title: "We check your access", text: "Your account must belong to the team on GitHub." },
  { title: "You're in", text: "Land on the team's dashboard." },
];

/** Public page an invite link opens: who's inviting you where, and a
 * "Continue with GitHub" button that signs in and joins in one round-trip. */
export function InvitePage() {
  const { token = "" } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const errorCode = searchParams.get("error");

  const preview = useQuery({
    queryKey: ["invitation", token],
    queryFn: () => fetchInvitationPreview(token),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  });

  const data = preview.data;
  const notFound = preview.error instanceof ApiError && preview.error.status === 404;
  const closedStatus = data && data.status !== "pending" ? data.status : null;
  const failureCode = errorCode ?? (notFound ? "invalid" : closedStatus === "accepted" ? "used" : closedStatus);
  const failure = failureCode ? failureMessage(failureCode, data) : null;
  const canAccept = data?.status === "pending";

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50 dark:bg-canvas">
      <Backdrop />

      <header className="relative mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-8">
        <Link to="/about" className="flex items-center gap-2.5">
          <LogoMark size={30} />
          <Wordmark className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white" />
        </Link>
        <ThemeToggle />
      </header>

      <main className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 pb-16 pt-6 sm:px-8 lg:min-h-[calc(100vh-8rem)] lg:grid-cols-[1fr_440px] lg:gap-16 lg:pt-0">
        {/* Pitch — after the card on small screens, beside it on large ones. */}
        <section className="order-2 min-w-0 animate-fade-in-up lg:order-1">
          <p className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200">
            <UsersIcon size={13} /> Team invitation
          </p>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
            Review pull requests <span className="text-emerald-600 dark:text-emerald-400">with your team</span>
          </h1>
          <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">
            Mergewise scores every pull request for risk and explains why, so your team spends its review time where it
            matters.
          </p>

          <ul className="mt-8 grid max-w-lg gap-4">
            {PERKS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-emerald-700 ring-1 ring-slate-200 dark:bg-white/[0.04] dark:text-emerald-300 dark:ring-line">
                  <Icon size={16} />
                </span>
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-slate-500">{text}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-10 max-w-lg">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">How joining works</p>
            <ol className="mt-3 grid gap-3 sm:grid-cols-3">
              {STEPS.map((step, i) => (
                <li key={step.title} className="flex gap-2.5 sm:flex-col sm:gap-2">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white dark:bg-white dark:text-slate-900">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-[13px] font-medium text-slate-900 dark:text-slate-100">{step.title}</p>
                    <p className="text-xs leading-relaxed text-slate-500">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* The invitation itself. */}
        <section className="order-1 min-w-0 animate-fade-in-up [animation-delay:80ms] lg:order-2">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgb(15_23_42/0.04),0_24px_48px_-24px_rgb(15_23_42/0.25)] dark:border-line dark:bg-surface dark:shadow-card">
            <div className="h-1 bg-gradient-to-r from-emerald-400 via-teal-400 to-sky-400" />

            <div className="p-6 sm:p-8">
              {preview.isLoading ? (
                <CardSkeleton />
              ) : (
                <>
                  <InviteHeading data={data} />

                  {failure && (
                    <div
                      role="alert"
                      className="mt-6 flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-400/20 dark:bg-rose-500/10"
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
                        <AlertIcon size={14} />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-rose-800 dark:text-rose-200">{failure.title}</p>
                        <p className="mt-1 text-[13px] leading-relaxed text-rose-700/90 dark:text-rose-200/80">
                          {failure.body}
                        </p>
                      </div>
                    </div>
                  )}

                  {data && (
                    <dl className="mt-6 divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-line dark:border-line">
                      <Detail icon={<MailIcon size={14} />} label="Invited as" value={data.email} />
                      {githubRequirement(data) && (
                        <Detail
                          icon={<GithubIcon size={14} />}
                          label="Who can join"
                          value={capitalize(githubRequirement(data) ?? "")}
                        />
                      )}
                      <Detail
                        icon={<ClockIcon size={14} />}
                        label={data.status === "expired" ? "Expired" : "Expires"}
                        value={<span title={formatDateTime(data.expiresAt)}>{capitalize(timeAgo(data.expiresAt))}</span>}
                      />
                    </dl>
                  )}

                  {canAccept ? (
                    <>
                      <ButtonAnchor
                        href={githubLoginUrlForInvite(token)}
                        variant="solid"
                        className="mt-6 h-11 w-full text-[15px]"
                      >
                        <GithubIcon size={16} />
                        {errorCode ? "Try again with GitHub" : "Continue with GitHub"}
                      </ButtonAnchor>
                      <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-slate-500">
                        <LockIcon size={11} /> We only read your public GitHub profile.
                      </p>
                    </>
                  ) : (
                    <ButtonLink to="/login" variant="outline" className="mt-6 h-11 w-full">
                      Go to Mergewise
                    </ButtonLink>
                  )}
                </>
              )}
            </div>
          </div>

          <p className="mt-5 text-center text-xs leading-relaxed text-slate-500">
            Each invitation works once and lasts 24 hours. Didn't expect this? You can safely ignore it.
            <br />
            <Link to="/privacy" className="hover:text-slate-800 dark:hover:text-slate-300">
              Privacy
            </Link>
            {" · "}
            <Link to="/terms" className="hover:text-slate-800 dark:hover:text-slate-300">
              Terms
            </Link>
            {" · "}
            <Link to="/about" className="hover:text-slate-800 dark:hover:text-slate-300">
              About Mergewise
            </Link>
          </p>
        </section>
      </main>
    </div>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Inviter's GitHub avatar overlapping the organization's monogram, then
 * who's inviting you where. */
function InviteHeading({ data }: { data: InvitationPreview | undefined }) {
  if (!data) {
    return (
      <div className="text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-white/[0.04]">
          <MailIcon size={20} />
        </span>
        <h2 className="mt-4 text-xl font-semibold tracking-tight text-slate-900 dark:text-white">Team invitation</h2>
      </div>
    );
  }

  return (
    <div className="text-center">
      <div className="mx-auto flex w-fit items-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-sky-500 text-xl font-semibold uppercase text-white shadow-[0_8px_20px_-8px_rgb(16_185_129/0.6)]">
          {data.organizationName.slice(0, 1)}
        </span>
        {data.invitedBy && (
          <span className="-ml-3 rounded-full ring-4 ring-white dark:ring-surface">
            <Avatar src={`https://github.com/${data.invitedBy}.png?size=96`} name={data.invitedBy} size={40} />
          </span>
        )}
      </div>
      <p className="mt-5 text-sm text-slate-600 dark:text-slate-400">
        {data.invitedBy ? (
          <>
            <span className="font-medium text-slate-900 dark:text-slate-100">@{data.invitedBy}</span> invited you to join
          </>
        ) : (
          "You've been invited to join"
        )}
      </p>
      <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 [overflow-wrap:anywhere] dark:text-white">
        {data.organizationName}
      </h2>
      {data.status === "pending" && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
          <CheckIcon size={12} /> Invitation active
        </p>
      )}
    </div>
  );
}

function Detail({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span className="mt-0.5 shrink-0 text-slate-400">{icon}</span>
      <div className="min-w-0">
        <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</dt>
        <dd className="mt-0.5 text-sm text-slate-900 [overflow-wrap:anywhere] dark:text-slate-100">{value}</dd>
      </div>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="space-y-4" role="status">
      <div className="skeleton mx-auto size-14 rounded-2xl" />
      <div className="skeleton mx-auto h-4 w-40 rounded" />
      <div className="skeleton mx-auto h-6 w-56 rounded" />
      <div className="skeleton mt-6 h-36 rounded-xl" />
      <div className="skeleton h-11 rounded-lg" />
      <span className="sr-only">Checking your invitation…</span>
    </div>
  );
}

function Backdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute left-[-10%] top-[-18rem] h-[36rem] w-[46rem] animate-blob-drift rounded-full bg-emerald-200/50 blur-[130px] dark:bg-emerald-500/[0.12]" />
      <div className="absolute right-[-10%] top-[-4rem] h-[32rem] w-[36rem] animate-blob-drift-slow rounded-full bg-sky-200/50 blur-[130px] dark:bg-indigo-500/[0.10]" />
      <GridLines
        className={cx("text-slate-200/80 dark:text-white/[0.05]")}
        mask="radial-gradient(ellipse 70% 60% at 50% 0%, black 20%, transparent 100%)"
      />
    </div>
  );
}
