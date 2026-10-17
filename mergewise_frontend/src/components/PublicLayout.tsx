import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { githubLoginUrl } from "../lib/api";
import { SITE } from "../lib/site";
import { CloseIcon, GithubIcon, LogoMark, MenuIcon, Wordmark } from "./icons";
import { ICON_BUTTON, ThemeToggle } from "./ThemeToggle";
import { buttonClasses, cx } from "./ui";

const LINKS = [
  { to: "/about", label: "About" },
  { to: "/privacy", label: "Privacy" },
  { to: "/terms", label: "Terms" },
];

/** Shared width for every public page, so header, sections and footer line up. */
export const PAGE_CONTAINER = "mx-auto w-full max-w-[88rem] px-5 sm:px-8 lg:px-12";

/** Header + footer shared by the landing page and the public info pages. */
export function PublicLayout({ children, backdrop }: { children: ReactNode; backdrop?: ReactNode }) {
  return (
    // overflow-x-clip (not overflow-hidden) so the sticky header still sticks.
    <div className="relative flex min-h-screen flex-col overflow-x-clip bg-white text-slate-900 dark:bg-canvas dark:text-slate-100">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      {backdrop ?? <SoftBackdrop />}
      <PublicHeader />
      <div id="main" className="relative flex-1">
        {children}
      </div>
      <PublicFooter />
    </div>
  );
}

/** In-page anchors shown in the header on the landing page only. */
const LANDING_SECTIONS = [
  { id: "try", label: "Try it" },
  { id: "signals", label: "Engine" },
  { id: "how-it-works", label: "How it works" },
  { id: "product", label: "Product" },
  { id: "security", label: "Security" },
  { id: "roadmap", label: "Roadmap" },
  { id: "faq", label: "FAQ" },
];

function PublicHeader() {
  const onLanding = useLocation().pathname === "/";
  const [scrolled, setScrolled] = useState(false);
  const [progress, setProgress] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const activeSection = useActiveSection(onLanding ? LANDING_SECTIONS.map((s) => s.id) : []);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 8);
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(scrollable > 0 ? Math.min(1, window.scrollY / scrollable) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <header
      className={cx(
        "sticky top-0 z-30 border-b transition-colors duration-300",
        scrolled || menuOpen
          ? "border-slate-200 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-canvas/75"
          : "border-transparent",
      )}
    >
      <div className={cx(PAGE_CONTAINER, "flex h-16 items-center justify-between gap-4")}>
        <Brand animated={onLanding} />

        {onLanding && (
          <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Page sections">
            {LANDING_SECTIONS.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                aria-current={activeSection === section.id ? "true" : undefined}
                className={cx(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  activeSection === section.id
                    ? "bg-slate-100 text-slate-900 dark:bg-white/[0.08] dark:text-white"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white",
                )}
              >
                {section.label}
              </a>
            ))}
          </nav>
        )}

        <div className="flex items-center gap-1.5 sm:gap-2">
          <nav className="hidden items-center gap-1 sm:flex" aria-label="Site">
            {LINKS.slice(0, 1).map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  cx(
                    "rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
                    isActive
                      ? "text-slate-900 dark:text-white"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white",
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <ThemeToggle />
          <a href={githubLoginUrl()} className={buttonClasses("solid", "sm", "hidden h-9 px-3.5 text-[13px] sm:inline-flex")}>
            <GithubIcon size={14} />
            {onLanding ? "Get started" : "Sign in"}
          </a>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="public-mobile-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className={cx(ICON_BUTTON, "lg:hidden")}
          >
            {menuOpen ? <CloseIcon size={16} /> : <MenuIcon size={16} />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div id="public-mobile-menu" className="animate-fade-in border-t border-slate-200 lg:hidden dark:border-white/10">
          <nav className={cx(PAGE_CONTAINER, "flex flex-col gap-1 py-4")} aria-label="Mobile">
            {onLanding &&
              LANDING_SECTIONS.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-[15px] font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.06]"
                >
                  {section.label}
                </a>
              ))}
            {LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-2.5 text-[15px] font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.06]"
              >
                {link.label}
              </Link>
            ))}
            <a href={githubLoginUrl()} className={buttonClasses("solid", "md", "mt-3 h-11 text-[15px]")}>
              <GithubIcon size={16} />
              Continue with GitHub
            </a>
          </nav>
        </div>
      )}

      {onLanding && (
        <div
          className="absolute inset-x-0 bottom-[-1px] h-px origin-left bg-gradient-to-r from-emerald-500 to-sky-500"
          style={{ transform: `scaleX(${progress})` }}
          aria-hidden="true"
        />
      )}
    </header>
  );
}


/** Which of the given section ids is currently under the header. */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join(",");

  useEffect(() => {
    if (!key || typeof IntersectionObserver === "undefined") return;
    const elements = key
      .split(",")
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    const visible = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) visible.set(entry.target.id, entry.isIntersecting);
        // The first section (in page order) that crosses the band wins.
        setActive(elements.find((el) => visible.get(el.id))?.id ?? null);
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [key]);

  return active;
}

function Brand({ animated = false }: { animated?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <LogoMark size={32} animated={animated} className="shrink-0" />
      <Wordmark className="text-[16px] font-semibold tracking-tight text-slate-900 dark:text-white" />
    </Link>
  );
}

const FOOTER_COLUMNS: { title: string; links: { label: string; to?: string; href?: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Try it live", href: "/#try" },
      { label: "Risk engine", href: "/#signals" },
      { label: "How it works", href: "/#how-it-works" },
      { label: "Security", href: "/#security" },
      { label: "Roadmap", href: "/#roadmap" },
      { label: "Early access", href: "/#early-access" },
      { label: "FAQ", href: "/#faq" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", to: "/about" },
      { label: "Source code", href: SITE.sourceUrl },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", to: "/privacy" },
      { label: "Terms", to: "/terms" },
    ],
  },
];

const FOOTER_LINK = "text-sm text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white";

function PublicFooter() {
  return (
    <footer className="relative z-10 border-t border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-surface">
      <div className={cx(PAGE_CONTAINER, "grid gap-10 py-14 md:grid-cols-[1.5fr_repeat(3,1fr)]")}>
        <div className="max-w-xs">
          <Brand />
          <p className="mt-4 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            Pull request risk scoring for GitHub. Read-only by design — we never store your source code.
          </p>
        </div>

        {FOOTER_COLUMNS.map((column) => (
          <div key={column.title}>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{column.title}</p>
            <ul className="mt-4 space-y-3">
              {column.links.map((link) => (
                <li key={link.label}>
                  {link.to ? (
                    <Link to={link.to} className={FOOTER_LINK}>
                      {link.label}
                    </Link>
                  ) : (
                    <a
                      href={link.href}
                      {...(link.href?.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
                      className={FOOTER_LINK}
                    >
                      {link.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-200 dark:border-white/10">
        <div
          className={cx(
            PAGE_CONTAINER,
            "flex flex-col gap-3 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between",
          )}
        >
          <p>
            © {new Date().getFullYear()} {SITE.name}. All rights reserved.
          </p>
          <a
            href={SITE.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 transition-colors hover:text-slate-900 dark:hover:text-white"
          >
            <GithubIcon size={13} />
            View on GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}

/** Faint grid lines drawn in currentColor, so a text-* class themes them. */
export function GridLines({ className, mask, size = 56 }: { className?: string; mask: string; size?: number }) {
  return (
    <div
      className={cx("absolute inset-0", className)}
      style={{
        backgroundImage:
          "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
        backgroundSize: `${size}px ${size}px`,
        maskImage: mask,
        WebkitMaskImage: mask,
      }}
    />
  );
}

function SoftBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-[40rem] overflow-hidden" aria-hidden="true">
      <div className="absolute left-1/2 top-[-18rem] h-[34rem] w-[60rem] -translate-x-1/2 rounded-full bg-emerald-200/40 blur-[120px] dark:bg-emerald-500/[0.08]" />
      <GridLines
        className="text-slate-200/80 dark:text-white/[0.04]"
        mask="radial-gradient(ellipse 60% 55% at 50% 0%, black 10%, transparent 80%)"
      />
    </div>
  );
}

/** Long-form page wrapper for Privacy / Terms, in the same style as About:
 * a wide intro (with an optional summary card beside it), then a sticky
 * table of contents next to one card per section. */
export function DocumentPage({
  eyebrow,
  title,
  intro,
  aside,
  sections,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: ReactNode;
  /** Summary shown beside the intro on wide screens (e.g. key promises). */
  aside?: ReactNode;
  /** Must match the ids and titles of the DocSections, in order. */
  sections: { id: string; title: string }[];
  children: ReactNode;
}) {
  const active = useActiveSection(sections.map((s) => s.id));

  return (
    <PublicLayout>
      <main>
        <section className={cx(PAGE_CONTAINER, "pb-16 pt-14 sm:pt-20")}>
          <div className={cx("grid items-center gap-12 lg:gap-16", Boolean(aside) && "lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]")}>
            <div className="animate-fade-in-up">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">{eyebrow}</p>
              <h1 className="mt-4 text-5xl font-semibold leading-[1.04] tracking-[-0.04em] text-slate-900 sm:text-6xl dark:text-white">
                {title}
              </h1>
              <div className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-600 dark:text-slate-400">{intro}</div>
              <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs text-slate-500 backdrop-blur dark:border-white/10 dark:bg-white/[0.03]">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                Last updated {SITE.policiesUpdated}
              </p>
            </div>
            {aside && <div className="animate-fade-in-up [animation-delay:120ms]">{aside}</div>}
          </div>
        </section>

        <section className="border-t border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.015]">
          <div className={cx(PAGE_CONTAINER, "grid gap-10 py-16 sm:py-20 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-14")}>
            <nav aria-label="On this page" className="hidden lg:block">
              <div className="sticky top-28">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">On this page</p>
                <ol className="mt-4 space-y-0.5 border-l border-slate-200 dark:border-white/10">
                  {sections.map((s) => (
                    <li key={s.id}>
                      <a
                        href={`#${s.id}`}
                        aria-current={active === s.id ? "true" : undefined}
                        className={cx(
                          "-ml-px block border-l-2 py-1.5 pl-4 text-sm transition-colors",
                          active === s.id
                            ? "border-emerald-500 font-medium text-slate-900 dark:text-white"
                            : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900 dark:hover:border-white/20 dark:hover:text-white",
                        )}
                      >
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ol>
              </div>
            </nav>
            <div className="min-w-0 max-w-3xl space-y-5">{children}</div>
          </div>
        </section>

        <section className={cx(PAGE_CONTAINER, "py-16 sm:py-20")}>
          <div className="flex flex-col items-start justify-between gap-6 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:flex-row sm:items-center sm:p-10 dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Still have a question?</h2>
              <p className="mt-2 text-slate-600 dark:text-slate-400">
                We're happy to explain anything on this page. To get in touch, <ContactLine />.
              </p>
            </div>
            <Link to="/about" className={buttonClasses("outline", "md", "h-11 shrink-0 px-5")}>
              Meet the team
            </Link>
          </div>
        </section>
      </main>
    </PublicLayout>
  );
}

export function DocSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none"
    >
      <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
        <a href={`#${id}`} className="group inline-flex items-center gap-2">
          {title}
          <span className="text-slate-400 opacity-0 transition-opacity group-hover:opacity-100 dark:text-slate-600" aria-hidden="true">
            #
          </span>
        </a>
      </h2>
      <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-slate-600 dark:text-slate-400 [&_strong]:font-medium [&_strong]:text-slate-900 dark:[&_strong]:text-slate-200 [&_ul]:space-y-2.5 [&_ul]:pl-1 [&_li]:flex [&_li]:gap-2.5 [&_li]:before:mt-[0.6em] [&_li]:before:size-1.5 [&_li]:before:shrink-0 [&_li]:before:rounded-full [&_li]:before:bg-emerald-500 [&_li]:before:content-['']">
        {children}
      </div>
    </section>
  );
}

/** "At a glance" card for DocumentPage's aside: a titled 2×2 grid of points. */
export function GlanceCard({ title, items }: { title: string; items: { icon: ReactNode; title: string; text: string }[] }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-2 shadow-[0_30px_80px_-30px_rgb(15_23_42/0.25)] dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none">
      <p className="px-5 pb-2 pt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.title} className="rounded-2xl bg-slate-50 p-5 dark:bg-white/[0.03]">
            <span className="flex size-9 items-center justify-center rounded-lg bg-slate-900 text-emerald-400 dark:bg-emerald-400/10 dark:text-emerald-300">
              {item.icon}
            </span>
            <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">{item.title}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">{item.text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ContactLine() {
  return SITE.contactEmail ? (
    <>
      email{" "}
      <a href={`mailto:${SITE.contactEmail}`} className="font-medium text-emerald-700 hover:underline dark:text-emerald-300">
        {SITE.contactEmail}
      </a>
    </>
  ) : (
    <>
      reach the creators through the links on the{" "}
      <Link to="/about" className="font-medium text-emerald-700 hover:underline dark:text-emerald-300">
        About page
      </Link>
    </>
  );
}
