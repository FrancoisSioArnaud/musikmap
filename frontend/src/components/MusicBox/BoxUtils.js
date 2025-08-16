import { getCookie } from "../Security/TokensUtils";

/**
 * Retrieves the details of a Music Box.
 * @param {string} boxName - The name of the box to retrieve details for.
 * @param {function} navigate - The navigation function used to redirect to a different page.
 * @returns {Promise<Object>} A Promise that resolves to an object containing the box details.
 * The box details object returned has the following structure:
 * {
 *    box: {
 *      id: number,
 *      name: string,
 *      description: string,
 *      url: string,
 *      latitude: string,
 *      longitude: string,
 *      image_url: string,
 *      created_at: string,
 *      updated_at: string,
 *      client_name: string
 *    },
 *    last_deposits: Array<{
 *      id: number,
 *      title: string,
 *      artist: string,
 *      url: string,
 *      image_url: string,
 *      duration: number,
 *      platform_id: number,
 *      n_deposits: number
 *    }>,
 *    deposit_count: number
 * }
 */
export const getBoxDetails = async (boxName, navigate) => {
  try {
    const response = await fetch("/box-management/get-box?name=" + boxName);
    if (!response.ok) {
      navigate("/");
      return [];
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(error);
    return {};
  }
};

/**
 * Retrieves the current geolocation coordinates of the user.
 * @returns {Promise<GeolocationPosition>} A Promise that resolves to a GeolocationPosition object containing the user's coordinates.
 * @throws {string} If geolocation is not supported by the browser, an error message is thrown.
 */
function getLocation() {
  return new Promise((resolve, reject) => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(resolve, reject);
    } else {
      reject("Geolocation is not supported by this browser.");
    }
  });
}

/**
 * Checks if the user's current location matches the location of the Music Box. If not, redirects him to the home page.
 * @param {Object} data - The box information object containing all the box details.
 * @param {function} navigate - The navigation function used to redirect to a different page.
 * @returns {Promise<void>} A Promise that resolves once the location verification is completed.
 * If the user's location does not match the box location or an error occurs, the Promise is rejected.
 */
export const checkLocation = async (data, navigate) => {
  try {
    const position = await getLocation();

    const { latitude, longitude } = position.coords;
    const box = data.box;

    const csrftoken = getCookie("csrftoken");
    const requestOptions = {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrftoken },
      body: JSON.stringify({
        latitude: latitude,
        longitude: longitude,
        box: box,
      }),
    };
    const verificationResponse = await fetch(
      "../box-management/verify-location",
      requestOptions
    );

    if (!verificationResponse.ok) {
      return "Tu es trop loin de la box.";
    }
    return "success";
  } catch (error) {
    return "Nous avons besoin de ta localisation pour vérifier que tu es bien à côté de la boîte. Recharge la page et autorise ta localisation pour continuer.";
  }
};

/**
 * Sets the current box name by making a POST request to update the current box management.
 * @param {string} boxName - The name of the box to set as the current box.
 * @returns {Promise<void>} - A promise that resolves when the current box name is successfully set.
 */
export const setCurrentBoxName = async (boxName) => {
  try {
    const csrftoken = getCookie("csrftoken");
    const requestOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": csrftoken,
      },
      body: JSON.stringify({
        current_box_name: boxName,
      }),
    };
    const response = await fetch(
      "/box-management/current-box-management",
      requestOptions
    );
  } catch (error) {
    console.error(error);
  }
};

/**
 * Navigates to the current box by making a GET request to the server.
 * @param {function} navigate - The function used for navigation to a specific URL.
 * @returns {Promise<void>} - A promise that resolves when the navigation is completed.
 */
export const navigateToCurrentBox = async (navigate) => {
  try {
    const response = await fetch("/box-management/current-box-management");
    if (!response.ok) {
      navigate("/");
    }
    const data = await response.json();
    navigate("/box/" + data.current_box_name);
  } catch (error) {
    console.error(error);
    navigate("/");
  }
};

/**
 * Retrieves the list of all the Music Boxes.
 * @param boxName - The name of the box to retrieve details for.
 */
export const updateVisibleDeposits = async (boxName) => {
  try {
    const csrftoken = getCookie("csrftoken");
    const requestOptions = {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrftoken },
      body: JSON.stringify({
        boxName: boxName,
      }),
    };
    // update the list of visible deposits
    const response = await fetch(
      "../box-management/update-visible-deposits",
      requestOptions
    );
    const data = await response.json();
    if (!response.ok) {
      return [];
    }
  } catch (error) {
    console.log(error);
    return {};
  }
};

/**
 * Sets a note for a deposit by making a POST request to the server.
 * @param {string} depositID - The ID of the deposit to set the note for.
 * @param {string} note - The note content to be added.
 * @returns {Promise<void>} - A promise that resolves when the note is successfully set.
 */
export const setDepositNote = async (depositID, note) => {
  try {
    const csrftoken = getCookie("csrftoken");
    const requestOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": csrftoken,
      },
      body: JSON.stringify({
        deposit_id: depositID,
        note: note,
      }),
    };
    const response = await fetch("/box-management/add-note", requestOptions);
  } catch (error) {
    console.error(error);
  }
};
