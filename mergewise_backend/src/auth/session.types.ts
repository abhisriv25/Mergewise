import "express-session";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    oauthState?: string;
    githubInstallState?: string;
    githubInstallOrgId?: string;
    /** Set when sign-in started from an invite link; consumed by the OAuth
     * callback, which accepts the invitation once GitHub confirms who this is. */
    pendingInvitationToken?: string;
  }
}
