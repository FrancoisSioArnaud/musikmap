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
// import { Footer } from "./Common/footer";
import UserPublicProfile from "./UserPublicProfile";

// 👇 IMPORTANT : Outlet pour le layout, MenuAppBar pour le header
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Outlet,
} from "react-router-dom";
import MenuAppBar from "./Menu"; // ← ton composant menu fixe

function LayoutWithHeader() {
  return (
    <>
      {/* Header fixe */}
      <MenuAppBar />
      {/* Spacer exactement 64px pour ne pas "manger" le contenu sous l'AppBar */}
      <div style={{ height: 64 }} />
      {/* Les pages enfants s’affichent ici */}
      <Outlet />
    </>
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
    <>
      <Router>
        <UserContext.Provider value={providerValue}>
          <Routes>
            {/* ====== Routes avec header ====== */}
            <Route element={<LayoutWithHeader />}>
              <Route path="/" element={<HomePage />} />
              <Route
                path="/profile"
                element={/* isMobile ? */ isAuthenticated ? <UserProfilePage /> : <SuccessfulLogout /> /* : <RedirectToMobile /> */}
              />
              <Route
                path="/library"
                element={/* isMobile ? */ isAuthenticated ? <LibraryPage /> : <SuccessfulLogout /> /* : <RedirectToMobile /> */}
              />
              <Route
                path="/box/:boxName"
                element={/* isMobile ? */ <MusicBox /> /* : <RedirectToMobile /> */}
              />
              <Route
                path="/profile/:userID"
                element={/* isMobile ? */ <UserPublicProfile /> /* : <RedirectToMobile /> */}
              />
            </Route>

            {/* ====== Routes SANS header (auth) ====== */}
            <Route
              path="/register"
              element={
                /* isMobile ? */
                isAuthenticated ? <Navigate to="/profile" /> : <RegisterPage />
                /* : <RedirectToMobile /> */
              }
            />
            <Route
              path="/login"
              element={
                /* isMobile ? */
                isAuthenticated ? <Navigate to="/profile" /> : <LoginPage />
                /* : <RedirectToMobile /> */
              }
            />
          </Routes>
        </UserContext.Provider>
      </Router>
      {/* <Footer sx={{ mt: 8, mb: 4 }} /> */}
    </>
  );
}

const appDiv = document.getElementById("app");
createRoot(appDiv).render(<App />);



