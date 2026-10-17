import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { AlertIcon, ArrowRightIcon, LogOutIcon, LogoMark, MailIcon } from "../components/icons";
import { Button, Card } from "../components/ui";
import { ApiError, createOrganization, logout } from "../lib/api";
import { useCurrentUser } from "../lib/use-current-user";
import { usePageTitle } from "../lib/use-page-title";

const MIN_NAME = 2;
const MAX_NAME = 60;

/** First stop for a signed-in user who doesn't belong to an organization:
 * name one and become its admin. Teammates don't come through here — they
 * join an existing organization from an invitation link. */
export function WelcomePage() {
  usePageTitle("Create your organization");
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const valid = trimmed.length >= MIN_NAME && trimmed.length <= MAX_NAME;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!valid || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      await createOrganization(trimmed);
      await queryClient.invalidateQueries({ queryKey: ["currentUser"] });
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Already in one (e.g. created in another tab) — just go there.
        await queryClient.invalidateQueries({ queryKey: ["currentUser"] });
        navigate("/", { replace: true });
        return;
      }
      setError(err instanceof ApiError ? err.message : "Couldn't create the organization. Please try again.");
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    await logout().catch(() => undefined);
    queryClient.clear();
    window.location.href = "/";
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12 dark:bg-canvas">
      <div className="w-full max-w-md animate-fade-in-up">
        <div className="flex flex-col items-center text-center">
          <LogoMark size={44} />
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Create your organization
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            {user ? <>Signed in as <span className="font-medium text-slate-900 dark:text-slate-200">{user.githubLogin}</span>. </> : null}
            Your organization holds your team's repositories and pull requests. You'll be its admin.
          </p>
        </div>

        <Card className="mt-8 p-5 sm:p-6">
          <form onSubmit={handleSubmit} noValidate>
            <label htmlFor="org-name" className="block text-sm font-medium text-slate-900 dark:text-slate-100">
              Organization name
            </label>
            <input
              id="org-name"
              autoFocus
              autoComplete="organization"
              value={name}
              maxLength={MAX_NAME}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Inc."
              aria-invalid={error ? true : undefined}
              aria-describedby="org-name-hint"
              className="mt-2 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-emerald-400/50 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-line-strong dark:bg-canvas/60 dark:text-slate-100 dark:focus:ring-emerald-400/20"
            />
            <p id="org-name-hint" className="mt-2 text-xs text-slate-500">
              Usually your company or team name. {MIN_NAME}–{MAX_NAME} characters.
            </p>

            {error && (
              <div
                role="alert"
                className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-200"
              >
                <AlertIcon size={14} className="mt-0.5 shrink-0" />
                {error}
              </div>
            )}

            <Button type="submit" variant="primary" className="mt-5 h-10 w-full" disabled={!valid || submitting}>
              {submitting ? "Creating…" : "Create organization"}
              {!submitting && <ArrowRightIcon size={14} />}
            </Button>
          </form>
        </Card>

        <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white/60 px-4 py-3 text-[13px] text-slate-600 dark:border-line dark:bg-white/[0.02] dark:text-slate-400">
          <MailIcon size={15} className="mt-0.5 shrink-0 text-slate-500" />
          <p>
            <span className="font-medium text-slate-900 dark:text-slate-200">Joining your team instead?</span> Ask your
            organization's admin to send you an invitation, then open the link from your email.
          </p>
        </div>

        <div className="mt-6 text-center">
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOutIcon size={13} /> Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
