import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate } from "react-router-dom";
import { AppLayout } from "../components/AppLayout";
import {
  AlertIcon,
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  GithubIcon,
  MailIcon,
  PlusIcon,
  UsersIcon,
} from "../components/icons";
import { Avatar, Banner, Button, Card, CardHeader, EmptyState, ErrorState, PageHeader, cx } from "../components/ui";
import {
  ApiError,
  changeMemberRole,
  createInvitations,
  fetchCurrentOrganization,
  fetchInvitations,
  fetchMembers,
  removeMember,
  resendInvitation,
  revokeInvitation,
  type IssuedInvitation,
  type Member,
  type OrganizationDetails,
  type PendingInvitation,
} from "../lib/api";
import { formatDateTime, plural, timeAgo } from "../lib/format";
import { useCurrentUser } from "../lib/use-current-user";

const MAX_INVITES = 20;

function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

/** Splits pasted text on commas, semicolons, spaces and newlines. */
function parseEmails(text: string): string[] {
  return [...new Set(text.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Admin-only: everyone in the organization, invitations still open, and
 * the controls to invite, re-role and remove people. */
export function MembersPage() {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const isAdmin = user?.organizations[0]?.role === "ADMIN";

  const organization = useQuery({ queryKey: ["organization"], queryFn: fetchCurrentOrganization, enabled: isAdmin });
  const members = useQuery({ queryKey: ["members"], queryFn: fetchMembers, enabled: isAdmin });
  const invitations = useQuery({ queryKey: ["invitations"], queryFn: fetchInvitations, enabled: isAdmin });

  const [inviteOpen, setInviteOpen] = useState(false);
  const [issued, setIssued] = useState<IssuedInvitation[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);

  if (user && !isAdmin) return <Navigate to="/" replace />;

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["members"] }),
      queryClient.invalidateQueries({ queryKey: ["invitations"] }),
    ]);

  async function run(action: () => Promise<unknown>, fallback: string) {
    setActionError(null);
    try {
      await action();
      await refresh();
    } catch (err) {
      setActionError(errorText(err, fallback));
    }
  }

  const memberList = members.data?.members ?? [];
  const openInvitations = (invitations.data?.invitations ?? []).filter((i) => i.status !== "revoked");
  const adminCount = memberList.filter((m) => m.role === "ADMIN").length;
  const linked = Boolean(organization.data?.github);

  return (
    <AppLayout>
      <PageHeader
        eyebrow={organization.data?.name}
        title="Members"
        description="Everyone in your organization. Only admins can see this page."
        actions={
          <Button variant="solid" onClick={() => setInviteOpen((open) => !open)} disabled={!linked}>
            <PlusIcon size={14} /> Invite people
          </Button>
        }
      />

      <div className="mt-6 space-y-3">
        {organization.data && <GithubLinkNotice organization={organization.data} />}
        {actionError && (
          <Banner tone="error">
            <AlertIcon size={15} /> {actionError}
          </Banner>
        )}
      </div>

      {inviteOpen && linked && organization.data && (
        <InvitePanel
          organization={organization.data}
          onIssued={async (fresh) => {
            setIssued((prev) => [...fresh, ...prev]);
            setInviteOpen(false);
            await refresh();
          }}
          onCancel={() => setInviteOpen(false)}
        />
      )}

      {issued.length > 0 && <IssuedLinks issued={issued} onDismiss={() => setIssued([])} />}

      <Card className="mt-6 animate-fade-in-up [animation-delay:60ms]">
        <CardHeader
          icon={<UsersIcon size={15} />}
          title="People"
          description={members.data ? plural(memberList.length, "member") : undefined}
        />
        {members.isLoading ? (
          <ListSkeleton />
        ) : members.isError ? (
          <ErrorState compact description="We couldn't load the members." onRetry={() => members.refetch()} />
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-line">
            {memberList.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                isSelf={member.user.id === user?.id}
                isLastAdmin={member.role === "ADMIN" && adminCount <= 1}
                githubAccount={organization.data?.github?.login ?? null}
                onRole={(role) => run(() => changeMemberRole(member.id, role), "Couldn't change the role.")}
                onRemove={() => {
                  const name = member.user.displayName ?? member.user.githubLogin;
                  if (window.confirm(`Remove ${name} from the organization? They lose access immediately.`)) {
                    void run(async () => {
                      await removeMember(member.id);
                      if (member.user.id === user?.id) window.location.href = "/welcome";
                    }, "Couldn't remove this member.");
                  }
                }}
              />
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-6 animate-fade-in-up [animation-delay:120ms]">
        <CardHeader
          icon={<MailIcon size={15} />}
          title="Invitations"
          description="Links that haven't been used yet. Each works once and lasts 24 hours."
        />
        {invitations.isLoading ? (
          <ListSkeleton />
        ) : invitations.isError ? (
          <ErrorState compact description="We couldn't load the invitations." onRetry={() => invitations.refetch()} />
        ) : openInvitations.length === 0 ? (
          <EmptyState
            compact
            icon={<MailIcon size={18} />}
            title="No open invitations"
            description="Invite teammates by email. They join once they sign in with a GitHub account that belongs to your team."
          />
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-line">
            {openInvitations.map((invitation) => (
              <InvitationRow
                key={invitation.id}
                invitation={invitation}
                onResend={() =>
                  run(async () => {
                    const { invitation: fresh } = await resendInvitation(invitation.id);
                    setIssued((prev) => [fresh, ...prev]);
                  }, "Couldn't resend the invitation.")
                }
                onRevoke={() => {
                  if (window.confirm(`Cancel the invitation for ${invitation.email}? The link stops working.`)) {
                    void run(() => revokeInvitation(invitation.id), "Couldn't cancel the invitation.");
                  }
                }}
              />
            ))}
          </ul>
        )}
      </Card>
    </AppLayout>
  );
}

function GithubLinkNotice({ organization }: { organization: OrganizationDetails }) {
  if (!organization.github) {
    return (
      <Banner tone="error">
        <AlertIcon size={15} />
        <span>
          Connect your GitHub organization before inviting anyone — invitees are checked against it.{" "}
          <Link to="/repositories" className="font-medium underline underline-offset-2">
            Connect a repository
          </Link>
        </span>
      </Banner>
    );
  }

  const who =
    organization.github.type === "Organization"
      ? `members of the ${organization.github.login} GitHub organization`
      : `collaborators on ${organization.github.login}'s connected repositories`;
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-white/70 px-3.5 py-2.5 text-[13px] text-slate-600 dark:border-line dark:bg-white/[0.02] dark:text-slate-400">
      <GithubIcon size={14} className="mt-0.5 shrink-0 text-slate-500" />
      <p>
        Linked to <span className="font-medium text-slate-900 dark:text-slate-200">{organization.github.login}</span> on
        GitHub. Only {who} can accept an invitation.
      </p>
    </div>
  );
}

function InvitePanel({
  organization,
  onIssued,
  onCancel,
}: {
  organization: OrganizationDetails;
  onIssued: (issued: IssuedInvitation[]) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emails = parseEmails(text);
  const invalid = emails.filter((email) => !EMAIL_PATTERN.test(email));
  const tooMany = emails.length > MAX_INVITES;
  const canSend = emails.length > 0 && invalid.length === 0 && !tooMany && !sending;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      const { invitations } = await createInvitations(emails);
      await onIssued(invitations);
    } catch (err) {
      setError(errorText(err, "Couldn't send the invitations."));
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="mt-6 animate-fade-in-up p-5">
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="invite-emails" className="block text-sm font-medium text-slate-900 dark:text-slate-100">
          Email addresses
        </label>
        <textarea
          id="invite-emails"
          autoFocus
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="alex@company.com, sam@company.com"
          className="mt-2 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-emerald-400/50 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-line-strong dark:bg-canvas/60 dark:text-slate-100 dark:focus:ring-emerald-400/20"
        />
        <p className="mt-2 text-xs text-slate-500">
          Separate addresses with commas or new lines, up to {MAX_INVITES} at a time.{" "}
          {organization.emailEnabled
            ? "Each person gets an email with their link."
            : "Email isn't set up yet, so you'll get each link to copy and send yourself."}
        </p>

        {(invalid.length > 0 || tooMany || error) && (
          <p role="alert" className="mt-3 flex items-start gap-1.5 text-[13px] text-rose-700 dark:text-rose-300">
            <AlertIcon size={14} className="mt-0.5 shrink-0" />
            {error ??
              (tooMany
                ? `That's ${emails.length} addresses — invite at most ${MAX_INVITES} at a time.`
                : `Not a valid email: ${invalid.slice(0, 3).join(", ")}`)}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!canSend}>
            {sending ? "Sending…" : emails.length > 1 ? `Invite ${emails.length} people` : "Send invitation"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** Links are only returned when issued (the server stores a hash), so
 * they're shown here until dismissed. */
function IssuedLinks({ issued, onDismiss }: { issued: IssuedInvitation[]; onDismiss: () => void }) {
  const unsent = issued.filter((invite) => !invite.emailSent);
  return (
    <Card className="mt-6 animate-fade-in-up border-emerald-200 dark:border-emerald-400/20">
      <CardHeader
        icon={<CheckIcon size={15} />}
        title={`${plural(issued.length, "invitation")} ready`}
        description={
          unsent.length > 0
            ? "Copy each link and send it to that person. Links can't be shown again after you leave this page."
            : "Emails are on their way."
        }
        action={
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            Done
          </Button>
        }
      />
      <ul className="divide-y divide-slate-200 dark:divide-line">
        {issued.map((invite) => (
          <li key={invite.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{invite.email}</p>
              <p className="text-xs text-slate-500">
                {invite.emailSent ? "Email sent" : "Not emailed — share the link"} · expires {timeAgo(invite.expiresAt)}
              </p>
            </div>
            <CopyButton value={invite.url} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        } catch {
          window.prompt("Copy this invitation link:", value);
        }
      }}
    >
      {copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
      {copied ? "Copied" : "Copy link"}
    </Button>
  );
}

function MemberRow({
  member,
  isSelf,
  isLastAdmin,
  githubAccount,
  onRole,
  onRemove,
}: {
  member: Member;
  isSelf: boolean;
  isLastAdmin: boolean;
  githubAccount: string | null;
  onRole: (role: Member["role"]) => void;
  onRemove: () => void;
}) {
  const { user } = member;
  return (
    <li className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <Avatar src={user.avatarUrl} name={user.githubLogin} size={36} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
              {user.displayName ?? user.githubLogin}
              {isSelf && <span className="ml-1.5 text-xs font-normal text-slate-500">(you)</span>}
            </p>
            <RolePill role={member.role} />
            {member.githubStatus === "not_member" && (
              <Pill tone="warn" title={githubAccount ? `No longer belongs to ${githubAccount} on GitHub` : undefined}>
                <AlertIcon size={11} /> Left GitHub org
              </Pill>
            )}
          </div>
          <a
            href={`https://github.com/${user.githubLogin}`}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
          >
            @{user.githubLogin} <ExternalLinkIcon size={10} />
          </a>
          <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <Fact label="Joined" value={formatDateTime(member.joinedAt)} />
            <Fact label="Last active" value={user.lastActiveAt ? timeAgo(user.lastActiveAt) : "Not yet"} />
            {member.invitedEmail && <Fact label="Invited as" value={member.invitedEmail} />}
            {member.invitedBy && <Fact label="Invited by" value={`@${member.invitedBy}`} />}
          </dl>
        </div>
      </div>

      <div className="flex shrink-0 gap-2 md:justify-end">
        {member.role === "MEMBER" ? (
          <Button size="sm" variant="outline" onClick={() => onRole("ADMIN")}>
            Make admin
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onRole("MEMBER")}
            disabled={isLastAdmin}
            title={isLastAdmin ? "An organization needs at least one admin" : undefined}
          >
            Make member
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={onRemove}
          disabled={isLastAdmin}
          title={isLastAdmin ? "An organization needs at least one admin" : undefined}
          className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-300 dark:hover:bg-rose-500/10"
        >
          {isSelf ? "Leave" : "Remove"}
        </Button>
      </div>
    </li>
  );
}

function InvitationRow({
  invitation,
  onResend,
  onRevoke,
}: {
  invitation: PendingInvitation;
  onResend: () => void;
  onRevoke: () => void;
}) {
  const expired = invitation.status === "expired";
  return (
    <li className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{invitation.email}</p>
          <Pill tone={expired ? "muted" : "info"}>{expired ? "Expired" : "Pending"}</Pill>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">
          {invitation.invitedBy ? `Invited by @${invitation.invitedBy} · ` : ""}
          {expired ? `expired ${timeAgo(invitation.expiresAt)}` : `expires ${timeAgo(invitation.expiresAt)}`}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" variant="outline" onClick={onResend}>
          {expired ? "Send new link" : "Resend"}
        </Button>
        {!expired && (
          <Button size="sm" variant="ghost" onClick={onRevoke}>
            Cancel
          </Button>
        )}
      </div>
    </li>
  );
}

function RolePill({ role }: { role: Member["role"] }) {
  return <Pill tone={role === "ADMIN" ? "accent" : "muted"}>{role === "ADMIN" ? "Admin" : "Member"}</Pill>;
}

function Pill({
  tone,
  title,
  children,
}: {
  tone: "accent" | "muted" | "info" | "warn";
  title?: string;
  children: ReactNode;
}) {
  const tones = {
    accent: "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-400/10 ring-emerald-600/20 dark:ring-emerald-400/20",
    muted: "text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-400/10 ring-slate-300 dark:ring-slate-400/20",
    info: "text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-400/10 ring-sky-600/20 dark:ring-sky-400/20",
    warn: "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-400/10 ring-amber-600/20 dark:ring-amber-400/20",
  };
  return (
    <span
      title={title}
      className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", tones[tone])}
    >
      {children}
    </span>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1">
      <dt>{label}</dt>
      <dd className="text-slate-700 dark:text-slate-300">{value}</dd>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3 p-5" role="status">
      {[0, 1, 2].map((i) => (
        <div key={i} className="skeleton h-12 rounded-lg" />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
