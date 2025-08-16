import { getCookie } from "./Security/TokensUtils";

/**
 * Logs out the current user by sending a request to the "/users/logout_user" endpoint.
 * If the logout is successful, it sets the user to null and sets the isAuthenticated flag to false.
 * @param {Function} setUser - The function to set the user value.
 * @param {Function} setIsAuthenticated - The function to set the isAuthenticated flag.
 * @returns {Promise<void>} - A promise that resolves when the logout process is completed.
 * @throws {Error} - If an error occurs during the logout process.
 */
export const logoutUser = async (setUser, setIsAuthenticated) => {
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

/**
 * Checks the status of the user's authentication by sending a request to the "/users/check-authentication" endpoint.
 * If the user is authenticated, it sets the user data, and the isAuthenticated flag to true.
 * @param {Function} setUser - The function to set the user value.
 * @param {Function} setIsAuthenticated - The function to set the isAuthenticated flag.
 * @returns {Promise<void>} - A promise that resolves when the user status is checked.
 * @throws {Error} - If an error occurs during the status check.
 */
export const checkUserStatus = async (setUser, setIsAuthenticated) => {
  try {
    const response = await fetch("/users/check-authentication");
    const data = await response.json();
    if (response.ok) {
      setUser(data);
      setIsAuthenticated(true);
    } else {
      console.log("Not authenticated");
    }
  } catch (error) {
    console.error(error);
  }
};

/**
 * Sets the preferred platform for a user on the server.
 * @param {string} new_preferred_platform - The new preferred platform value to be set. Valid values are 'spotify' or 'deezer'.
 * @returns {Promise<boolean>} A Promise that resolves to true if the preferred platform was set successfully, or false if there was an error.
 */
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

/**
 * Retrieves user details from the server using the provided userID.
 * @param {string} userID - The ID of the user to fetch details for.
 * @returns {Promise<Object|null>} - A Promise that resolves to the user details object if successful, or null if there was an error.
 */
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
