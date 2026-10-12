import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../env.js", () => ({
  env: { RESEND_API_KEY: "re_test_key", EMAIL_FROM: "Mergewise <invites@example.com>" },
}));

const { sendInvitationEmail } = await import("./email.service.js");

const INPUT = {
  to: "dev@acme.com",
  organizationName: "<b>Acme</b> & Co",
  inviterLogin: "octocat",
  url: "https://devpulse.example/invite/abc",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sendInvitationEmail", () => {
  it("sends through Resend with the invite link, escaping names in the HTML", async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve({ ok: true, status: 200 } as Response));
    vi.stubGlobal("fetch", fetchMock);

    expect(await sendInvitationEmail(INPUT)).toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer re_test_key");
    const body = JSON.parse(String(init?.body));
    expect(body.from).toBe("Mergewise <invites@example.com>");
    expect(body.to).toEqual(["dev@acme.com"]);
    expect(body.text).toContain(INPUT.url);
    expect(body.html).toContain("&lt;b&gt;Acme&lt;/b&gt; &amp; Co");
    expect(body.html).not.toContain("<b>Acme</b>");
  });

  it("reports failure instead of throwing when Resend refuses or is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 422 } as Response)));
    expect(await sendInvitationEmail(INPUT)).toBe(false);

    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network down"))));
    expect(await sendInvitationEmail(INPUT)).toBe(false);
  });
});
