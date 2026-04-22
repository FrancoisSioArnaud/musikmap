# Spotipy configuration
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials

from spotify.credentials import CLIENT_ID, CLIENT_SECRET

# Initialize the Spotipy client with Spotify credentials using Client Credentials Flow for higher rate limit and no access token
auth_manager = SpotifyClientCredentials(client_id=CLIENT_ID, client_secret=CLIENT_SECRET)

sp = spotipy.Spotify(auth_manager=auth_manager)
