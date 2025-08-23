import React, { useState, useEffect } from "react";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import { getCookie } from "../Security/TokensUtils";

export default function LiveSearch({
  isSpotifyAuthenticated,
  isDeezerAuthenticated,
  boxName,
  user,
  onDepositSuccess, // (addedDeposit, successes) => void
  onClose,    
}) {
  const [searchValue, setSearchValue] = useState("");
  const [jsonResults, setJsonResults] = useState([]);
  const [selectedStreamingService, setSelectedStreamingService] = useState(
    user?.preferred_platform || "spotify"
  );

  // Synchro plateforme préférée
  useEffect(() => {
    if (user?.preferred_platform) {
      setSelectedStreamingService(user.preferred_platform);
    }
  }, [user?.preferred_platform]);

  // Recherche / récents
  useEffect(() => {
    const getData = setTimeout(() => {
      if (selectedStreamingService === "spotify") {
        if (searchValue === "") {
          if (isSpotifyAuthenticated) {
            fetch("/spotify/recent-tracks")
              .then((r) => r.json())
              .then(setJsonResults)
              .catch(() => setJsonResults([]));
          } else setJsonResults([]);
        } else {
          const csrftoken = getCookie("csrftoken");
          fetch("/spotify/search", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-CSRFToken": csrftoken },
            body: JSON.stringify({ search_query: searchValue }),
          })
            .then((r) => r.json())
            .then(setJsonResults)
            .catch(() => setJsonResults([]));
        }
      }

      if (selectedStreamingService === "deezer") {
        if (searchValue === "") {
          if (isDeezerAuthenticated) {
            fetch("/deezer/recent-tracks")
              .then((r) => r.json())
              .then(setJsonResults)
              .catch(() => setJsonResults([]));
          } else setJsonResults([]);
        } else {
          const csrftoken = getCookie("csrftoken");
          fetch("/deezer/search", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-CSRFToken": csrftoken },
            body: JSON.stringify({ search_query: searchValue }),
          })
            .then((r) => r.json())
            .then(setJsonResults)
            .catch(() => setJsonResults([]));
        }
      }
    }, 400);

    return () => clearTimeout(getData);
  }, [searchValue, selectedStreamingService, isDeezerAuthenticated, isSpotifyAuthenticated]);

  function handleStreamingServiceChange(service) {
    setSelectedStreamingService(service);
  }

  // Dépôt POST
function handleButtonClick(option, boxName) {
  const data = { option, boxName };
  const csrftoken = getCookie("csrftoken");

  fetch("/box-management/get-box?name=" + boxName, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": csrftoken,
    },
    body: JSON.stringify(data),
  })
    .then((data_resp) => {
      const { added_deposit, successes, points_balance } = data_resp || {};
    
      // 1) Notifie le parent (SongDisplay) pour afficher le my_deposit + achievements
      if (typeof onDepositSuccess === "function") {
        onDepositSuccess(added_deposit, successes);
      }
    
      // 2) Met à jour le solde dans le UserContext pour que le menu réagisse
      if (typeof points_balance === "number") {
        setUser((prev) => ({ ...(prev || {}), points: points_balance }));
      } else {
        // Cas anonyme : on peut garder un compteur local si tu veux
        // (facultatif)
        // const total = (successes || []).find(s => (s.name||"").toLowerCase()==="total")?.points || 0;
        // const key = "anon_points";
        // const cur = parseInt(localStorage.getItem(key) || "0", 10);
        // localStorage.setItem(key, String(cur + total));
      }
    })
}

  return (
    <Stack>
      <div className="search-song">
        <h2>Choisis ta chanson à déposer</h2>

        <div className="search-song__wrapper">
          <div className="d-flex">
            <button
              className="btn-spotify"
              onClick={() => handleStreamingServiceChange("spotify")}
              aria-pressed={selectedStreamingService === "spotify"}
            >
              Spotify
            </button>
            <button
              className="btn-deezer"
              onClick={() => handleStreamingServiceChange("deezer")}
              aria-pressed={selectedStreamingService === "deezer"}
            >
              Deezer
            </button>
          </div>

          <div className="input-wrapper">
            <input
              type="text"
              placeholder="Search for a song"
              onChange={(e) => setSearchValue(e.target.value)}
              value={searchValue}
            />
          </div>
        </div>
      </div>

      <ul className="search-results">
        {jsonResults.map((option) => (
          <Box component="li" key={option.id}>
            <div className="img-container">
              <img src={option.image_url} alt={option.name} />
            </div>

            <div className="song">
              <p className="song-title">{option.name}</p>
              <p className="song-subtitle">{option.artist}</p>
            </div>

            <button className="btn-tertiary" onClick={() => handleButtonClick(option, boxName)}>
              <span>Choisir</span>
            </button>
          </Box>
        ))}
      </ul>
    </Stack>
  );
}



