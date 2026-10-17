import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../env.js", () => ({
  env: {
    RESEND_API_KEY: "re_test_key",
    EMAIL_FROM: "Mergewise <invites@example.com>",
    WEB_BASE_URL: "https://mergewise.example",
  },
}));

const { renderInvitationEmail, sendInvitationEmail } = await import("./email.service.js");

const INPUT = {
  to: "dev@acme.com",
  organizationName: "<b>Acme</b> & Co",
  inviterLogin: "octocat",
  url: "https://mergewise.example/invite/abc",
  expiresAt: new Date("2026-10-18T07:35:00Z"),
  githubAccount: { login: "acme", type: "Organization" },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("renderInvitationEmail", () => {
  it("escapes names in the HTML", () => {
    const { html } = renderInvitationEmail(INPUT);

    expect(html).toContain("&lt;b&gt;Acme&lt;/b&gt; &amp; Co");
    expect(html).not.toContain("<b>Acme</b>");
  });

  it("has a button, the full link as a fallback, and the exact expiry in UTC", () => {
    const { html, text } = renderInvitationEmail(INPUT);

    expect(html.match(/href="https:\/\/mergewise\.example\/invite\/abc"/g)).toHaveLength(2);
    expect(html).toContain(">Accept invitation</a>");
    expect(html).toContain("Sun 18 Oct 2026, 07:35 UTC");
    expect(text).toContain("Accept the invitation: https://mergewise.example/invite/abc");
    expect(text).toContain("Sun 18 Oct 2026, 07:35 UTC");
  });

  it("shows the inviter's GitHub avatar and the Mergewise logo from the site", () => {
    const { html } = renderInvitationEmail(INPUT);

    expect(html).toContain('src="https://github.com/octocat.png?size=96"');
    expect(html).toContain('src="https://mergewise.example/logo-full.png"');
  });

  it("states who can join in the terms the server checks", () => {
    expect(renderInvitationEmail(INPUT).text).toContain("member of the acme organization on GitHub");

    const personal = renderInvitationEmail({ ...INPUT, githubAccount: { login: "octocat", type: "User" } });
    expect(personal.text).toContain("access to at least one of octocat's repositories");
    expect(personal.text).not.toContain("organization on GitHub");

    const unlinked = renderInvitationEmail({ ...INPUT, githubAccount: null });
    expect(unlinked.text).toContain("You'll sign in with your GitHub account.");
  });
});

describe("sendInvitationEmail", () => {
  it("sends the rendered email through Resend", async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve({ ok: true, status: 200 } as Response));
    vi.stubGlobal("fetch", fetchMock);

    expect(await sendInvitationEmail(INPUT)).toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer re_test_key");
    const body = JSON.parse(String(init?.body));
    const rendered = renderInvitationEmail(INPUT);
    expect(body).toEqual({
      from: "Mergewise <invites@example.com>",
      to: ["dev@acme.com"],
      subject: "octocat invited you to join <b>Acme</b> & Co on Mergewise",
      text: rendered.text,
      html: rendered.html,
    });
  });

  it("reports failure instead of throwing when Resend refuses or is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 422 } as Response)));
    expect(await sendInvitationEmail(INPUT)).toBe(false);

    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network down"))));
    expect(await sendInvitationEmail(INPUT)).toBe(false);
  });
});
