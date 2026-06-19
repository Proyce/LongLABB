import { useState, useEffect } from "react";
import { bp } from "./tokens.js";

/**
 * useBreakpoint — returns current breakpoint label.
 * xs < 560 | sm 560–900 | md 900–1280 | lg ≥ 1280
 */
export function useBreakpoint() {
  const [width, setWidth] = useState(() => window.innerWidth);

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: 1px)`);
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handler, { passive: true });
    return () => window.removeEventListener("resize", handler);
  }, []);

  if (width < bp.xs) return "xs";
  if (width < bp.sm) return "sm";
  if (width < bp.md) return "md";
  return "lg";
}

/**
 * useMediaQuery — returns true while the query matches.
 * @param {string} query  CSS media query string
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}
