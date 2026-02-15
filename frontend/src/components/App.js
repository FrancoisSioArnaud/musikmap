// frontend/src/components/App.js

import React, { useState, useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { CssBaseline } from "@mui/material";
import { StyledEngineProvider, ThemeProvider } from "@mui/material/styles";
import theme from "../theme";
import HomePage from "./HomePage";
import RegisterPage from "./RegisterPage";
import LoginPage from "./LoginPage";
import UserProfilePage from "./UserProfilePage";
import { UserContext } from "./UserContext";
import { checkUserStatus } from "./UsersUtils";
import UserSettings from "./UserProfile/UserSettings";
import UserProfileEdit from "./UserProfile/UserProfileEdit";
import MenuAppBar from "./Common/Menu";
import FlowboxLayout from "./Flowbox/FlowboxLayout";
import Onboarding from "./Flowbox/Onboarding";
import LiveSearch from "./Flowbox/LiveSearch";
import Discover from "./Flowbox/Discover";

import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Outlet,
} from "react-router-dom";

function LayoutWithHeader() {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <MenuAppBar />
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
    <StyledEngineProvider injectFirst>
      <ThemeProvider theme={theme}>
        <Router>
          <UserContext.Provider value={providerValue}>
            <Routes>
              <Route element={<LayoutWithHeader />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/profile/settings" element={<UserSettings />} />
                <Route path="/profile/edit" element={<UserProfileEdit />} />
                <Route path="/profile" element={<UserProfilePage />} />
                <Route path="/profile/:username" element={<UserProfilePage />} />

                <Route path="/flowbox/:boxSlug" element={<FlowboxLayout />}>
                  <Route index element={<Onboarding />} />
                  <Route path="search" element={<LiveSearch />} />
                  <Route path="discover" element={<Discover />} />
                </Route>
              </Route>

              <Route
                path="/register"
                element={isAuthenticated ? <Navigate to="/profile" /> : <RegisterPage />}
              />
              <Route
                path="/login"
                element={isAuthenticated ? <Navigate to="/profile" /> : <LoginPage />}
              />
            </Routes>
          </UserContext.Provider>
        </Router>
      </ThemeProvider>
    </StyledEngineProvider>
  );
}

const appDiv = document.getElementById("app");
createRoot(appDiv).render(<App />);
