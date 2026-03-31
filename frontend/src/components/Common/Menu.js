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
import MusicNote from "@mui/icons-material/MusicNote";
import LibraryMusicIcon from "@mui/icons-material/LibraryMusic";


export default function MenuAppBar() {
  // States & Variables
  const { user, isAuthenticated } = useContext(UserContext);
  const hasIdentity = Boolean(user?.id);

  return (
    <AppBar
      position="fixed"
    >
      <Toolbar>
        <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column" , pl:"8px", pr:"0"}}>
          <Typography
            variant="h5"
            component="div"
          >
            Boîte à Chanson
          </Typography>
        </Box>

        {hasIdentity ? (
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
                {user?.points ?? 0}
              </Typography>
              <MusicNote/>
            </Box>

                
            <IconButton
              size="large"
              aria-label="account of current user"
              aria-controls="menu-appbar"
              color="inherit"
              component={Link}
              to="/profile"
            >
              <Avatar alt={user?.display_name || user?.username || "Invité"} src={user?.profile_picture_url || undefined} />
            </IconButton>
                
          </>
        ) : (
          <Button
            variant="menu"
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
            Mon compte
          </Button>
        )}
      </Toolbar>
    </AppBar>
  );
}























