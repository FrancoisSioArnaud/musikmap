// frontend/src/applyActiveClientTheme.js

import { getClientTheme } from "./clientThemes";

export function applyActiveClientTheme(clientSlug) {
  if (typeof document === "undefined") return getClientTheme(clientSlug);

  const theme = getClientTheme(clientSlug);
  const root = document.documentElement;

  root.setAttribute("data-client-theme", theme.slug);

  // fonts
  root.style.setProperty("--mm-font-body", theme.fonts.body);
  root.style.setProperty("--mm-font-heading", theme.fonts.heading);

  // radius
  root.style.setProperty("--mm-radius-sm", theme.radius.sm);
  root.style.setProperty("--mm-radius-md", theme.radius.md);
  root.style.setProperty("--mm-radius-lg", theme.radius.lg);
  root.style.setProperty("--mm-radius-xl", theme.radius.xl);
  root.style.setProperty("--mm-radius-button", theme.radius.button);
  root.style.setProperty("--mm-radius-round", theme.radius.round);

  // colors - base
  root.style.setProperty("--mm-color-black", theme.colors.black);
  root.style.setProperty("--mm-color-white", theme.colors.white);

  root.style.setProperty("--mm-color-bg-grey", theme.colors.bgGrey);
  root.style.setProperty("--mm-color-bg-blue", theme.colors.bgBlue);

  root.style.setProperty("--mm-color-neutral-extralightgrey", theme.colors.neutralExtraLightGrey);
  root.style.setProperty("--mm-color-neutral-lightgrey", theme.colors.neutralLightGrey);
  root.style.setProperty("--mm-color-neutral-semilightgrey", theme.colors.neutralSemiLightGrey);
  root.style.setProperty("--mm-color-neutral-grey", theme.colors.neutralGrey);
  root.style.setProperty("--mm-color-neutral-darkgrey", theme.colors.neutralDarkGrey);
  root.style.setProperty("--mm-color-neutral-extradarkgrey", theme.colors.neutralExtraDarkGrey);

  root.style.setProperty("--mm-color-primary-darkgreen", theme.colors.primaryDarkGreen);
  root.style.setProperty("--mm-color-primary-mediumgreen", theme.colors.primaryMediumGreen);
  root.style.setProperty("--mm-color-primary-green", theme.colors.primaryGreen);

  root.style.setProperty("--mm-color-secondary-yellow", theme.colors.secondaryYellow);
  root.style.setProperty("--mm-color-secondary-purple", theme.colors.secondaryPurple);
  root.style.setProperty("--mm-color-secondary-pink", theme.colors.secondaryPink);
  root.style.setProperty("--mm-color-secondary-orange", theme.colors.secondaryOrange);
  root.style.setProperty("--mm-color-secondary-cyan", theme.colors.secondaryCyan);
  root.style.setProperty("--mm-color-secondary-blue", theme.colors.secondaryBlue);

  root.style.setProperty("--mm-color-pastel-green", theme.colors.pastelGreen);
  root.style.setProperty("--mm-color-pastel-yellow", theme.colors.pastelYellow);
  root.style.setProperty("--mm-color-pastel-purple", theme.colors.pastelPurple);
  root.style.setProperty("--mm-color-pastel-orange", theme.colors.pastelOrange);
  root.style.setProperty("--mm-color-pastel-pink", theme.colors.pastelPink);
  root.style.setProperty("--mm-color-pastel-blue", theme.colors.pastelBlue);

  root.style.setProperty("--mm-color-service-red", theme.colors.serviceRed);
  root.style.setProperty("--mm-color-service-orange", theme.colors.serviceOrange);
  root.style.setProperty("--mm-color-service-yellow", theme.colors.serviceYellow);

  root.style.setProperty("--mm-color-spotify", theme.colors.spotify);
  root.style.setProperty("--mm-color-deezer", theme.colors.deezer);
  root.style.setProperty("--mm-color-orange", theme.colors.orange);

  // tokens UI pratiques
  root.style.setProperty("--mm-color-app-bg", theme.colors.appBg);
  root.style.setProperty("--mm-color-surface", theme.colors.surface);
  root.style.setProperty("--mm-color-text-primary", theme.colors.textPrimary);
  root.style.setProperty("--mm-color-text-secondary", theme.colors.textSecondary);
  root.style.setProperty("--mm-color-divider", theme.colors.divider);
  root.style.setProperty("--mm-color-error", theme.colors.error);
  root.style.setProperty("--mm-color-success", theme.colors.success);
  root.style.setProperty("--mm-color-primary-main", theme.colors.primaryMain);
  root.style.setProperty("--mm-color-primary-contrast-text", theme.colors.primaryContrastText);
  root.style.setProperty("--mm-color-appbar-bg", theme.colors.appBarBg);
  root.style.setProperty("--mm-color-appbar-border", theme.colors.appBarBorder);
  root.style.setProperty("--mm-color-avatar-border", theme.colors.avatarBorder);

  return theme;
}
