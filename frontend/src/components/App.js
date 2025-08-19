import React, { useState, useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import HomePage from "./HomePage";
import RegisterPage from "./RegisterPage";
import LoginPage from "./LoginPage";
import MusicBox from "./MusicBox/MusicBox";
import UserProfilePage from "./UserProfilePage";
import LibraryPage from "./LibraryPage";
import RedirectToMobile from "./RedirectToMobile";
import { UserContext } from "./UserContext";
import { checkUserStatus } from "./UsersUtils";
import { isMobile } from "react-device-detect";
import SuccessfulLogout from "./SuccessfulLogout";
import UserPublicProfile from "./UserPublicProfile";

import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

// ⬇️ MUI layout
import Box from "@mui/material/Box";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import CssBaseline from "@mui/material/CssBaseline";
import GlobalStyles from "@mui/material/GlobalStyles";

export default function App() {
  const [user, setUser] = useState({});
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentBoxName, setCurrentBoxName] = useState("");

  const providerValue = useMemo(
    () => ({
      user,
      setUser,
      isAuthenticated,
      setIsAuthenticated,
      currentBoxName,
      setCurrentBoxName,
    }),
    [
      user,
      setUser,
      isAuthenticated,
      setIsAuthenticated,
      currentBoxName,
      setCurrentBoxName,
    ]
  );

  useEffect(() => {
    checkUserStatus(setUser, setIsAuthenticated);
  }, []);

  return (
    <>
      {/* Normalise le rendu et retire les marges par défaut */}
      <CssBaseline />

      {/* Force la hauteur plein écran et désactive le scroll global */}
      <GlobalStyles
        styles={{
          "html, body, #app": { height: "100%", margin: 0 },
          body: { overflow: "hidden" }, // ⬅️ pas de scroll sur la page
        }}
      />

      {/* Shell d’application en colonne sur 100vh */}
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          overflow: "hidden", // sécurité
          bgcolor: "background.default",
        }}
      >
        {/* ===== Header / Menu ===== */}
        <AppBar position="fixed" elevation={1} color="default">
          <Toolbar>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Musik Map
            </Typography>
            {/* tu peux ajouter ici tes boutons/menu/icônes */}
          </Toolbar>
        </AppBar>

        {/* Espaceur pour la hauteur de la Toolbar (évite que le contenu passe sous le header) */}
        <Toolbar />

        {/* ===== Contenu défilant (scroll interne) ===== */}
        <Box
          component="main"
          sx={{
            flex: 1,        // occupe tout l’espace restant
            minHeight: 0,   // indispensable pour que overflow fonctionne
            overflow: "auto", // ⬅️ le scroll se fait ici
            px: { xs: 1.5, sm: 2 },
            pb: 2,
          }}
        >
          <Router>
            <UserContext.Provider value={providerValue}>
              <Routes>
                <Route path="/" element={<HomePage />} />

                <Route
                  path="/register"
                  element={
                    isAuthenticated ? <Navigate to="/profile" /> : <RegisterPage />
                  }
                />

                <Route
                  path="/login"
                  element={
                    isAuthenticated ? <Navigate to="/profile" /> : <LoginPage />
                  }
                />

                <Route
                  path="/profile"
                  element={
                    isAuthenticated ? <UserProfilePage /> : <SuccessfulLogout />
                  }
                />

                <Route
                  path="/library"
                  element={
                    isAuthenticated ? <LibraryPage /> : <SuccessfulLogout />
                  }
                />

                <Route path="/box/:boxName" element={<MusicBox />} />

                <Route path="/profile/:userID" element={<UserPublicProfile />} />
              </Routes>
            </UserContext.Provider>
          </Router>
        </Box>
      </Box>
    </>
  );
}

const appDiv = document.getElementById("app");
createRoot(appDiv).render(<App />);
