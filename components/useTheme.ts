"use client";

// Light / dark theme: html[data-theme], first set by the script in app/layout.tsx (saved choice,
// otherwise the system setting). Toggling saves the choice in the browser; without a saved
// choice the page follows the system setting when it changes.
import { useEffect, useState } from "react";

export type Theme = "light" | "dark";
const KEY = "miners.theme";

const current = (): Theme => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

function apply(t: Theme) {
  document.documentElement.dataset.theme = t;
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme | null>(null); // null until mounted (server render)

  useEffect(() => {
    setTheme(current());
    const mq = matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(KEY);
      } catch {}
      if (saved === "light" || saved === "dark") return;
      const t: Theme = mq.matches ? "light" : "dark";
      apply(t);
      setTheme(t);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function toggle() {
    const next: Theme = current() === "light" ? "dark" : "light";
    apply(next);
    setTheme(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {}
  }

  return { theme, toggle };
}
