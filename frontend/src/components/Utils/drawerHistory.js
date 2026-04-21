export function getDrawerParamValue(location, param) {
  const searchParams = new URLSearchParams(location?.search || "");
  return searchParams.get(param);
}

export function matchesDrawerSearch(location, param, value) {
  return getDrawerParamValue(location, param) === String(value);
}

function buildSearchString(searchParams) {
  const nextSearch = searchParams.toString();
  return nextSearch ? `?${nextSearch}` : "";
}

function buildDrawerStateKey(param) {
  return `__drawer_${param}`;
}

function buildNextState(locationState, stateKey, value, removeKey = false) {
  const nextState = { ...(locationState || {}) };

  if (removeKey) {
    delete nextState[stateKey];
  } else {
    nextState[stateKey] = String(value);
  }

  return Object.keys(nextState).length ? nextState : null;
}

export function openDrawerWithHistory({ navigate, location, param, value }) {
  const safeValue = String(value || "");

  if (!safeValue) return false;
  if (matchesDrawerSearch(location, param, safeValue)) return false;

  const nextSearchParams = new URLSearchParams(location?.search || "");
  nextSearchParams.set(param, safeValue);

  navigate(
    {
      pathname: location?.pathname || "",
      search: buildSearchString(nextSearchParams),
    },
    {
      state: buildNextState(location?.state, buildDrawerStateKey(param), safeValue),
      preventScrollReset: true,
    }
  );

  return true;
}

export function closeDrawerWithHistory({
  navigate,
  location,
  param,
  value,
  replace = false,
}) {
  const safeValue = String(value || "");
  const currentValue = getDrawerParamValue(location, param);
  const stateKey = buildDrawerStateKey(param);
  const openedByHistory = location?.state?.[stateKey] === currentValue;

  if (!currentValue) {
    return false;
  }

  if (!replace && openedByHistory && (!safeValue || currentValue === safeValue)) {
    navigate(-1);
    return true;
  }

  const nextSearchParams = new URLSearchParams(location?.search || "");
  nextSearchParams.delete(param);

  navigate(
    {
      pathname: location?.pathname || "",
      search: buildSearchString(nextSearchParams),
    },
    {
      replace: true,
      state: buildNextState(location?.state, stateKey, currentValue, true),
      preventScrollReset: true,
    }
  );

  return true;
}
