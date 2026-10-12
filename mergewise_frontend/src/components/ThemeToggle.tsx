import { useTheme } from "../lib/theme";
import { MoonIcon, SunIcon } from "./icons";
import { cx } from "./ui";

export const ICON_BUTTON =
  "inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300 dark:hover:border-white/20 dark:hover:text-white";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const next = theme === "light" ? "dark" : "light";

  return (
    <button
      type="button"
      onClick={toggle}
      className={cx(ICON_BUTTON, className)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      <span key={theme} className="animate-fade-in">
        {theme === "light" ? <MoonIcon size={16} /> : <SunIcon size={16} />}
      </span>
    </button>
  );
}
