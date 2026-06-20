"use client";

import React, { createContext, useContext, useMemo } from "react";
import { THEMES, type ThemeId } from "./tokens";
import { tokensToCssVars } from "./applyTheme";

const ThemeContext = createContext<ThemeId>("millennial");

export function useThemeId(): ThemeId {
  return useContext(ThemeContext);
}

/**
 * Wraps content in a themed scope: sets the --ml-* CSS custom properties from
 * the selected design direction and applies base font/size/line-height. Used
 * by both the Next app shell and the Storybook decorator.
 */
export function ThemeProvider({
  themeId,
  children,
}: {
  themeId: ThemeId;
  children: React.ReactNode;
}) {
  const style = useMemo(() => {
    // Defensive: if an unknown/empty theme id ever arrives, fall back to the
    // reference direction rather than crash on undefined tokens.
    const tokens = THEMES[themeId] ?? THEMES.millennial;
    const vars = tokensToCssVars(tokens);
    return {
      ...vars,
      fontFamily: "var(--ml-font-sans)",
      fontSize: "var(--ml-font-size-base)",
      lineHeight: "var(--ml-line-height)",
    } as React.CSSProperties;
  }, [themeId]);

  return (
    <ThemeContext.Provider value={themeId}>
      <div data-theme={themeId} style={style}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}
