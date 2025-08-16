import React, { useState, useEffect, useContext } from "react";
import Box from "@mui/material/Box";
import MenuAppBar from "./Menu";
import { useParams } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { getUserDetails } from "./UsersUtils";
import { Typography } from "@mui/material";
import Avatar from "@mui/material/Avatar";
import Button from "@mui/material/Button";
import { UserContext } from "./UserContext";
import { getCookie } from "./Security/TokensUtils";
import { checkUserStatus } from "./UsersUtils";


export default function UserPublicProfile() {
  const styles = {
    basicButton: {
      borderRadius: "20px",
      backgroundImage: "linear-gradient(to right, #fa9500, #fa4000)",
      color: "white",
      border: "none",
      textTransform: "none",
      "&:hover": {
        border: "none",
      },
    }
  }
  // States & Variables
  const navigate = useNavigate();

  // Gets userID from URL
  const { userID } = useParams();

  // Stores all the information about the user
  const [userInfo, setUserInfo] = useState({});

  const { user, setUser, isAuthenticated, setIsAuthenticated } = useContext(UserContext)
  useEffect(() => {
    getUserDetails(userID)
      .then((data) => {
        if (data) {
          setUserInfo(data);
        } else {
          navigate("/");
        }
      })
      .catch((error) => {
        console.error(error);
        navigate("/");
      });
  }, []);

  const handleDiscoverFavoriteSong = () => {
    if (!isAuthenticated) {
      console.log("User needs to log in to discover favorite song.");
      return;
    }

    const csrftoken = getCookie('csrftoken');
    fetch('/users/discover-favorite-song/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken,
      },
      body: JSON.stringify({ user_id: userID }),
    })
      .then(response => {
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      })
      .then(data => {
        setUserInfo(prevState => ({
          ...prevState,
          is_discovered: true,
          favorite_song: data.favorite_song,
        }));
        checkUserStatus(setUser, setIsAuthenticated);
      })
      .catch(error => {
        console.error("Error discovering favorite song:", error);
      });
  };

  return (
    <>
      <MenuAppBar />
      <div className="author-profil-wrapper">
        {userInfo ? (
          <>
          
          

              <div className="author-profil">
                <div className="author d-flex">
                  <Avatar
                    src={userInfo.profile_picture}
                    alt={userInfo.username}
                    sx={{
                      width: "68px",
                      height: "68px",
                    }}
                  />
                  <div className="author__informations">
                    <p className="author__informations__name">{userInfo.username}</p>
                    <p className="deposit-number">{userInfo.total_deposits + "ème dépôt"}</p>
                  </div>
                
                </div>
              </div>

              <div className="favorite-song">
                <Typography variant="h5">Favorite Song</Typography>
                {userInfo.has_favorite_song ? (
                  <>
                    {userInfo.is_discovered || user.id === userInfo.id ? (
                      <Typography variant="body1">
                        Favorite Song: {userInfo.favorite_song.title}
                      </Typography>
                    ) : (
                      <>
                        <Typography variant="body1">
                          This user has a favorite song.
                        </Typography>
                        {isAuthenticated && (
                          <Button
                            variant="contained"
                            color="primary"
                            style={styles.basicButton}
                            onClick={handleDiscoverFavoriteSong}
                          >
                            Discover Favorite Song
                          </Button>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <Typography variant="body1">
                    This user has no favorite song.
                  </Typography>
                )}
              </div>


              
      
          </>
        ) : (
          <Typography variant="h1">Loading...</Typography>
        )}
      </div>
    </>
  );
}
