const FLOWBOX_INDEX_KEY = "mm_flowbox_index";
const FLOWBOX_BOX_KEY_PREFIX = "mm_flowbox_box::";

function safeParse(raw) {
  if (!raw) {return null;}
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeIndex(index) {
  return {
    currentFlowboxSlug: index?.currentFlowboxSlug || null,
    lastVisitedFlowboxSlug: index?.lastVisitedFlowboxSlug || null,
    knownBoxSlugs: Array.isArray(index?.knownBoxSlugs) ? index.knownBoxSlugs.filter(Boolean) : [],
  };
}

export function getFlowboxIndex() {
  try {
    return normalizeIndex(safeParse(localStorage.getItem(FLOWBOX_INDEX_KEY)) || {});
  } catch {
    return normalizeIndex({});
  }
}

export function saveFlowboxIndex(nextIndex) {
  const normalized = normalizeIndex(nextIndex);
  try {
    localStorage.setItem(FLOWBOX_INDEX_KEY, JSON.stringify(normalized));
  } catch {}
  return normalized;
}

export function getFlowboxBoxStorageKey(boxSlug) {
  return `${FLOWBOX_BOX_KEY_PREFIX}${boxSlug}`;
}

export function getStoredFlowboxBox(boxSlug) {
  if (!boxSlug) {return null;}
  try {
    return safeParse(localStorage.getItem(getFlowboxBoxStorageKey(boxSlug)));
  } catch {
    return null;
  }
}

export function saveStoredFlowboxBox(boxSlug, payload) {
  if (!boxSlug) {return null;}
  try {
    localStorage.setItem(getFlowboxBoxStorageKey(boxSlug), JSON.stringify(payload));
  } catch {}

  const currentIndex = getFlowboxIndex();
  saveFlowboxIndex({
    ...currentIndex,
    knownBoxSlugs: Array.from(new Set([...(currentIndex.knownBoxSlugs || []), boxSlug])).filter(Boolean),
  });

  return payload;
}

export function patchStoredFlowboxBox(boxSlug, patch) {
  const current = getStoredFlowboxBox(boxSlug) || {};
  const next = {
    ...current,
    ...patch,
  };
  return saveStoredFlowboxBox(boxSlug, next);
}

export function getAllStoredFlowboxBoxes() {
  const index = getFlowboxIndex();
  return (index.knownBoxSlugs || []).reduce((acc, slug) => {
    const boxState = getStoredFlowboxBox(slug);
    if (boxState) {acc[slug] = boxState;}
    return acc;
  }, {});
}
