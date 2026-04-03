// frontend/src/Utils/time.js

import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/fr";

// Configuration globale de dayjs
dayjs.extend(relativeTime);
dayjs.locale("fr");

/**
 * Transforme une date ISO (UTC ou autre) en texte "naturel"
 * ex: "il y a 2 heures", "il y a 3 jours"
 */
export function formatRelativeTime(dateString) {
  if (!dateString) return "";
  // dayjs va convertir en timezone du navigateur
  return dayjs(dateString).fromNow();
}
