import * as React from "react";
import { Link } from "react-router-dom";
import { useContext } from "react";
import { UserContext } from "../UserContext";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Avatar from "@mui/material/Avatar";
import PersonIcon from "@mui/icons-material/Person";
import Button from "@mui/material/Button";
import AlbumIcon from "@mui/icons-material/Album";
import LibraryMusicIcon from "@mui/icons-material/LibraryMusic";


export default function MenuAppBar() {
  // States & Variables
  const { user, setUser, isAuthenticated, setIsAuthenticated } =
    useContext(UserContext);

  return (
    <AppBar
      position="fixed"
    >
      <Toolbar>
        <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column" }}>
          <Typography
            variant="h5"
            component="div"
          >
            MusikMap
          </Typography>
        </Box>

        {isAuthenticated ? (
          <>
            <Box 
              className="points_container"
            >
              <Typography
                variant="body1"
                component="span"
                sx={{
                  color: "text.primary",
                }}
              >
                {user.points}
              </Typography>
              <AlbumIcon/>
            </Box>

                
            <IconButton
              size="large"
              aria-label="account of current user"
              aria-controls="menu-appbar"
              color="inherit"
              component={Link}
              to="/profile"
            >
              <Avatar alt={user.username} src={user.profile_picture_url} />
            </IconButton>
                
          </>
        ) : (
          <Button
            variant="outlined"
            color="primary"
            endIcon={<PersonIcon />}
            component={Link}
            to="/login"
            sx={{
              borderRadius: "20px",
              backgroundColor: "background.paper",
              color: "primary",
              border: "none",
              textTransform: "none",
              "&:hover": {
                border: "none",
              },
            }}
          >
            Login
          </Button>
        )}
      </Toolbar>
    </AppBar>
  );
}















