import { getCookie } from "./Security/TokensUtils";

export const logoutUser = async (
  setUser,
  setIsAuthenticated,
  setCurrentClient = null
) => {
  try {
    const response = await fetch("/users/logout_user");
    if (response.ok) {
      setIsAuthenticated(false);
      setUser(null);
    } else {
      console.error("Can't disconnect because not connected");
    }
  } catch (error) {
    console.error(error);
  }
};

export const checkUserStatus = async (
  setUser,
  setIsAuthenticated,
  setCurrentClient = null,
  setAuthChecked = null
) => {
  try {
    const response = await fetch("/users/check-authentication");
    const data = await response.json().catch(() => ({}));

    if (response.ok) {
      setUser(data);
      setIsAuthenticated(true);
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

export const setPreferredPlatform = async (new_preferred_platform) => {
  const csrftoken = getCookie("csrftoken");
  const form = JSON.stringify({
    preferred_platform: new_preferred_platform,
  });

  const requestOptions = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": csrftoken,
    },
    body: form,
  };

  try {
    const response = await fetch(
      "/users/change-preferred-platform",
      requestOptions
    );
    const data = await response.json();
    if (response.ok) {
      return true;
    } else {
      console.log(data);
      return false;
    }
  } catch (error) {
    console.error(error);
    return false;
  }
};

export const getUserDetails = async (userID) => {
  try {
    const response = await fetch("/users/get-user-info?userID=" + userID);
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
