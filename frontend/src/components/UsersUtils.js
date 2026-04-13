import { getCookie } from "./Security/TokensUtils";

export const logoutUser = async (
  setUser,
  setIsAuthenticated,
  navigate = null,
  setCurrentClient = null
) => {
  try {
    const csrftoken = getCookie("csrftoken");
    await fetch("/users/logout_user", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "X-CSRFToken": csrftoken,
      },
    });
  } catch (error) {
    console.error(error);
  } finally {
    await checkUserStatus(setUser, setIsAuthenticated, setCurrentClient);
    if (navigate) {
      navigate("/");
    }
  }
};

export const checkUserStatus = async (
  setUser,
  setIsAuthenticated,
  setCurrentClient = null,
  setAuthChecked = null
) => {
  try {
    const response = await fetch("/users/check-authentication/", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    const data = await response.json().catch(() => ({}));

    if (response.ok) {
      setUser(data);
      setIsAuthenticated(!data?.is_guest);
    } else {
      setIsAuthenticated(false);
      setUser(null);
    }
  } catch (error) {
    console.error(error);
    setIsAuthenticated(false);
    setUser(null);
  } finally {
    if (setAuthChecked) {
      setAuthChecked(true);
    }
  }
};

export const setLastPlatform = async (nextLastPlatform) => {
  const csrftoken = getCookie("csrftoken");
  const form = JSON.stringify({
    last_platform: nextLastPlatform,
  });

  const requestOptions = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": csrftoken,
    },
    credentials: "same-origin",
    body: form,
  };

  try {
    const response = await fetch("/users/change-last-platform", requestOptions);
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      return data;
    }
    return null;
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const getUserDetails = async (userID) => {
  try {
    const response = await fetch("/users/get-user-info?userID=" + userID, {
      credentials: "same-origin",
    });
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(error);
    return null;
  }
};
