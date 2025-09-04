import React, { useState, useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider, CssBaseline } from "@mui/material";
import theme from "../theme";
import HomePage from "./HomePage";
import RegisterPage from "./RegisterPage";
import LoginPage from "./LoginPage";
import MusicBox from "./MusicBox/MusicBox";
import UserProfilePage from "./UserProfilePage";
import RedirectToMobile from "./RedirectToMobile";
import { UserContext } from "./UserContext";
import { checkUserStatus } from "./UsersUtils";
import { isMobile } from "react-device-detect";
import SuccessfulLogout from "./SuccessfulLogout";
// import { Footer } from "./Common/footer";
//import UserPublicProfile from "./UserPublicProfile";
import UserSettings from "./UserProfile/UserSettings";
import UserProfileEdit from "./UserProfile/UserProfileEdit";
import MenuAppBar from "./Common/Menu"; // <-- ton menu fixed (64px)

import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Outlet,
} from "react-router-dom";


function LayoutWithHeader() {
  return (
    // wrapper full-height pour permettre au main de s’étirer
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      {/* Header fixe */}
      <MenuAppBar />
      {/* Spacer 64px pour compenser l’AppBar fixed */}
      {/*<div style={{ height: 64 }} />*/}
      {/* Zone scrollable qui remplit le viewport restant */}
      <main
        style={{
          flex: 1,
          Height: "calc(100vh - 64px)",
          Width: "100vw",
          padding: "58px 0 0 0",
        }}
      >
        <Outlet />
      </main>
    </div>
  );
}

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
    [user, isAuthenticated, currentBoxName]
  );

  useEffect(() => {
    checkUserStatus(setUser, setIsAuthenticated);
  }, []);

  return (
      <Router>
        <UserContext.Provider value={providerValue}>
          <Routes>
            {/* ====== Routes AVEC header (layout global) ====== */}
            <Route element={<LayoutWithHeader />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/profile/settings" element={<UserSettings />} />
              <Route path="/profile/edit" element={<UserProfileEdit />} />
              <Route path="/box/:boxName" element={<MusicBox />} />
              <Route path="/profile" element={<UserProfilePage />} />
              <Route path="/profile/:username" element={<UserProfilePage />} />
            </Route>

            {/* ====== Routes SANS header (auth) ====== */}
            <Route path="/register" element={isAuthenticated ? <Navigate to="/profile" /> : <RegisterPage />}/>
            <Route path="/login" element={isAuthenticated ? <Navigate to="/profile" /> : <LoginPage />}/>
          </Routes>
        </UserContext.Provider>
      </Router>
  );
}

const appDiv = document.getElementById("app");
createRoot(appDiv).render(<App />);



















