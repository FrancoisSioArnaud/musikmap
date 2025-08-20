// Révéler (GET /box-management/revealSong) + enregistrer la découverte "revealed"
async function revealSong(idx) {
  const dep = deposits[idx];
  const cost = dep?.song?.cost;
  const songId = dep?.song?.id;
  const depositId = dep?.deposit_id; // <-- fourni par le backend GetBox.post
  if (!songId || !cost) return;

  const csrftoken = getCookie("csrftoken");
  const url = `/box-management/revealSong?song_id=${encodeURIComponent(songId)}&cost=${encodeURIComponent(cost)}`;

  try {
    // 1) Révélation
    const res = await fetch(url, { method: "GET", headers: { "X-CSRFToken": csrftoken } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    // Attendu: { song: { title, artist, spotify_url, deezer_url } }
    const data = await res.json();

    // 2) MAJ locale du dépôt révélé
    const updated = [...deposits];
    const prevSong = updated[idx]?.song || {};
    updated[idx] = {
      ...updated[idx],
      song: {
        ...prevSong,
        title: data?.song?.title ?? prevSong.title,
        artist: data?.song?.artist ?? prevSong.artist,
        spotify_url: data?.song?.spotify_url ?? prevSong.spotify_url,
        deezer_url: data?.song?.deezer_url ?? prevSong.deezer_url,
      },
    };
    setDispDeposits(updated);

    // 3) Enregistrer la découverte "revealed"
    if (depositId) {
      await fetch("/box-management/discovered-songs", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRFToken": csrftoken },
        body: JSON.stringify({ deposit_id: depositId, discovered_type: "revealed" }),
      });
      // Pas d'alerte en cas d'échec : silencieux (la lib lira depuis le back plus tard)
    }
  } catch (e) {
    console.error(e);
    alert("Impossible de révéler ce titre pour le moment.");
  }
}
