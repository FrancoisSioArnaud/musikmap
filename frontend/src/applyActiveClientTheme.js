// frontend/src/applyActiveClientTheme.js

import { getClientTheme } from "./clientThemes";

export function applyActiveClientTheme(clientSlug) {
  if (typeof document === "undefined") return getClientTheme(clientSlug);

  const theme = getClientTheme(clientSlug);
  const root = document.documentElement;

  root.setAttribute("data-client-theme", theme.slug);

  // fonts
  root.style.setProperty("--mm-font-h1", theme.fonts.h1);
  root.style.setProperty("--mm-font-h3", theme.fonts.h3);
  root.style.setProperty("--mm-font-h4", theme.fonts.h4);
  root.style.setProperty("--mm-font-h5", theme.fonts.h5);
  root.style.setProperty("--mm-font-subtitle1", theme.fonts.subtitle1);
  root.style.setProperty("--mm-font-bodY1", theme.fonts.body1);
  root.style.setProperty("--mm-font-body2", theme.fonts.body2);

  // radius
  root.style.setProperty("--mm-radius-sm", theme.radius.sm);
  root.style.setProperty("--mm-radius-md", theme.radius.md);
  root.style.setProperty("--mm-radius-lg", theme.radius.lg);
  root.style.setProperty("--mm-radius-xl", theme.radius.xl);
  root.style.setProperty("--mm-radius-button", theme.radius.button);
  root.style.setProperty("--mm-radius-round", theme.radius.round);

  // colors
  root.style.setProperty("--mm-color-black", theme.colors.black);
  root.style.setProperty("--mm-color-white", theme.colors.white);

  root.style.setProperty("--mm-color-primary", theme.colors.primary);
  root.style.setProperty("--mm-color-primary-light", theme.colors.primaryLight);
  root.style.setProperty("--mm-color-primary-dark", theme.colors.primaryDark);
 
  root.style.setProperty("--mm-color-secondary", theme.colors.secondary);
  root.style.setProperty("--mm-color-secondary-light", theme.colors.secondaryLight);

  root.style.setProperty("--mm-color-bg-gradient", theme.colors.bgGradient);

  root.style.setProperty("--mm-color-spotify", theme.colors.spotify);
  root.style.setProperty("--mm-color-deezer", theme.colors.deezer);

  // tokens UI pratiques
  root.style.setProperty("--mm-color-app-bg", theme.colors.appBg);
  root.style.setProperty("--mm-color-surface", theme.colors.surface);
  
  root.style.setProperty("--mm-color-text", theme.colors.text);
  root.style.setProperty("--mm-color-primary-contrast-text", theme.colors.primaryContrastText);
  
  root.style.setProperty("--mm-color-success", theme.colors.success);
  root.style.setProperty("--mm-color-error", theme.colors.error);
  root.style.setProperty("--mm-color-divider", theme.colors.divider);
 
  root.style.setProperty("--mm-color-appbar-bg", theme.colors.appBarBg);
  root.style.setProperty("--mm-color-appbar-border", theme.colors.appBarBorder);
  root.style.setProperty("--mm-color-avatar-border", theme.colors.avatarBorder);

  root.style.setProperty("--mm-border-default", theme.border.default);
  return theme;
}
