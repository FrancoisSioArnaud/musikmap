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
//import { Footer } from "./Common/footer";
import UserPublicProfile from "./UserPublicProfile";

import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

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
      <Router>
        <UserContext.Provider value={providerValue}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route
              path="/register"
              element={ /*
                isMobile ? (*/
                  isAuthenticated ? (
                    <Navigate to="/profile" />
                  ) : (
                    <RegisterPage />
                  ) /*
                ) : (
                  <RedirectToMobile />
                )*/
              }
            />
            <Route
              path="/login"
              element={ /*
                isMobile ? (*/
                  isAuthenticated ? (
                    <Navigate to="/profile" />
                  ) : (
                    <LoginPage />
                  ) /*
                ) : (
                  <RedirectToMobile />
                )*/
              }
            />
               <Route
              path="/profile"
              element={
              /*  isMobile ? (*/ isAuthenticated ? (<UserProfilePage />) : (<SuccessfulLogout />) /*) : (<RedirectToMobile />)*/
              }
            />
              <Route
            path="/library"
            element={/* isMobile ? */ isAuthenticated ? <LibraryPage /> : <SuccessfulLogout />
              /* : <RedirectToMobile /> */}
            />
            <Route
              path="/box/:boxName"
              element= { /*isMobile ? */
                <MusicBox /> 
              /*: <RedirectToMobile />*/}
            />
            <Route
              path="/profile/:userID"
              element=  {/*isMobile ? */ 
                <UserPublicProfile /> 
                /*: <RedirectToMobile /> */ }
            />
          </Routes>
        </UserContext.Provider>
      </Router>
             /* {<Footer sx={{ mt: 8, mb: 4 }} }*/
    </>
  );
}

const appDiv = document.getElementById("app");
createRoot(appDiv).render(<App />);







