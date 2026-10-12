import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { AlertIcon, RefreshIcon } from "./icons";

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "solid" | "outline" | "subtle";
type ButtonSize = "sm" | "md";

const BUTTON_BASE =
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-all duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-emerald-400 text-emerald-950 hover:bg-emerald-300 shadow-[0_0_0_1px_rgb(52_211_153/0.4),0_6px_20px_-6px_rgb(52_211_153/0.5)]",
  secondary: "border border-slate-300 dark:border-line-strong bg-slate-50 dark:bg-white/[0.03] text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.07] hover:text-slate-900 dark:hover:text-white",
  ghost: "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.05] hover:text-slate-900 dark:hover:text-slate-100",
  // Variants for white surfaces (the public site).
  // Variants for the public site, which can be light or dark (.dark wrapper).
  solid:
    "bg-slate-900 text-white hover:bg-slate-800 shadow-[0_1px_2px_rgb(15_23_42/0.2),0_8px_20px_-8px_rgb(15_23_42/0.45)] dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 dark:shadow-[0_8px_24px_-8px_rgb(255_255_255/0.25)]",
  outline:
    "border border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50 dark:border-white/15 dark:bg-white/[0.03] dark:text-slate-100 dark:hover:border-white/25 dark:hover:bg-white/[0.07]",
  subtle: "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-white",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-3.5 text-sm",
};

export function buttonClasses(variant: ButtonVariant = "outline", size: ButtonSize = "md", extra?: string) {
  return cx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], extra);
}

export function Button({
  variant,
  size,
  className,
  ...props
}: ComponentPropsWithoutRef<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type="button" className={buttonClasses(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: LinkProps & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClasses(variant, size, className)} {...props} />;
}

export function ButtonAnchor({
  variant,
  size,
  className,
  ...props
}: ComponentPropsWithoutRef<"a"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <a className={buttonClasses(variant, size, className)} {...props} />;
}

export function Card({ className, ...props }: ComponentPropsWithoutRef<"section">) {
  return (
    <section
      className={cx("overflow-hidden rounded-xl border border-slate-200 dark:border-line bg-white dark:bg-surface shadow-sm dark:shadow-card", className)}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  icon,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-200 dark:border-line px-5 py-3.5">
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && <span className="text-slate-500">{icon}</span>}
        <div className="min-w-0">
          <h2 className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{title}</h2>
          {description && <p className="mt-0.5 truncate text-xs text-slate-500">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  inlineActions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Keep compact actions beside the title on small screens too. */
  inlineActions?: boolean;
}) {
  return (
    <div
      className={cx(
        "flex animate-fade-in-up gap-4",
        inlineActions ? "items-start justify-between sm:items-end" : "flex-col sm:flex-row sm:items-end sm:justify-between",
      )}
    >
      <div className="min-w-0">
        {eyebrow && <div className="mb-2 text-xs font-medium text-slate-500">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-slate-300 dark:border-line-strong bg-slate-100 dark:bg-white/[0.04] px-1 font-mono text-[10px] text-slate-600 dark:text-slate-400">
      {children}
    </kbd>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact,
}: {
  icon: ReactNode;
  title: string;
  description: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cx("flex flex-col items-center justify-center px-6 text-center", compact ? "py-8" : "py-16")}>
      <span className="relative flex size-11 items-center justify-center rounded-xl border border-slate-300 dark:border-line-strong bg-slate-50 dark:bg-white/[0.03] text-slate-600 dark:text-slate-400">
        <span className="absolute inset-0 rounded-xl bg-emerald-50 dark:bg-emerald-400/5 blur-md" />
        <span className="relative">{icon}</span>
      </span>
      <p className="mt-4 text-sm font-medium text-slate-800 dark:text-slate-200">{title}</p>
      <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-slate-500">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
  compact,
}: {
  title?: string;
  description: string;
  onRetry?: () => void;
  compact?: boolean;
}) {
  return (
    <div className={cx("flex flex-col items-center justify-center px-6 text-center", compact ? "py-8" : "py-16")}>
      <span className="flex size-11 items-center justify-center rounded-xl border border-rose-200 dark:border-rose-400/20 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-300">
        <AlertIcon size={18} />
      </span>
      <p className="mt-4 text-sm font-medium text-slate-800 dark:text-slate-200">{title}</p>
      <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-slate-500">{description}</p>
      {onRetry && (
        <Button size="sm" className="mt-5" onClick={onRetry}>
          <RefreshIcon size={13} />
          Try again
        </Button>
      )}
    </div>
  );
}

export function Banner({ tone, children }: { tone: "success" | "error"; children: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx(
        "flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm",
        tone === "success"
          ? "animate-fade-in-up border-emerald-200 dark:border-emerald-400/20 bg-emerald-50 dark:bg-emerald-500/[0.08] text-emerald-800 dark:text-emerald-200"
          : "animate-shake border-rose-200 dark:border-rose-400/20 bg-rose-50 dark:bg-rose-500/[0.08] text-rose-700 dark:text-rose-200",
      )}
    >
      {children}
    </div>
  );
}

export function Avatar({ src, name, size = 28 }: { src?: string | null; name: string; size?: number }) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full ring-1 ring-slate-300 dark:ring-line-strong"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400/30 to-indigo-400/30 font-medium uppercase text-slate-900 dark:text-slate-100 ring-1 ring-slate-300 dark:ring-line-strong"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden="true"
    >
      {name.slice(0, 1)}
    </span>
  );
}

export function StatusPill({ state, mergedAt }: { state: string; mergedAt: string | null }) {
  const status = mergedAt ? "merged" : state === "closed" ? "closed" : "open";
  const styles = {
    open: "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-400/10 ring-emerald-600/20 dark:ring-emerald-400/20",
    merged: "text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-400/10 ring-violet-600/20 dark:ring-violet-400/20",
    closed: "text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-400/10 ring-slate-300 dark:ring-slate-400/20",
  }[status];
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ring-1 ring-inset", styles)}>
      {status}
    </span>
  );
}
