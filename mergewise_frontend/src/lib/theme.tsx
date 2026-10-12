import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

/** Light/dark theme for the whole app. The choice is stored per browser and
 * applied as a `dark` class on <html>; index.html applies it before first
 * paint so a dark-mode reload doesn't flash white. */
export type Theme = "light" | "dark";

const STORAGE_KEY = "devpulse:theme";
/** Where the choice lived when only the public pages had a toggle. */
const LEGACY_STORAGE_KEY = "devpulse:public-theme";

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Storage can be blocked (private mode, strict cookie settings).
  }
  return "light";
}

const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "light",
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next = current === "light" ? "dark" : "light";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Not persisting is fine; the toggle still works for this visit.
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
