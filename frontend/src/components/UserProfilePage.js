// ...imports identiques

// --- API helpers ---
async function fetchPublicUserInfoByUsername(username) {
  const res = await fetch(`/users/get-user-info?username=${encodeURIComponent(username)}`, {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  if (res.status === 404) return null; // username inconnu → profil introuvable
  if (!res.ok) throw new Error(`get-user-info HTTP ${res.status}`);
  return res.json();
}

async function fetchUserDepositsFor({ userId, username } = {}) {
  const qs = new URLSearchParams();
  if (userId !== undefined && userId !== null && String(userId).trim() !== "") {
    qs.set("user_id", String(userId));
  }
  if (username && String(username).trim() !== "") {
    qs.set("username", String(username).trim());
  }
  const url = `/box-management/user-deposits${qs.toString() ? `?${qs.toString()}` : ""}`;

  const res = await fetch(url, { headers: { Accept: "application/json" }, credentials: "same-origin" });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    console.error("user-deposits HTTP", res.status, data);
    return [];
  }
  return Array.isArray(data) ? data : [];
}

export default function UserProfilePage() {
  // ...hooks identiques

  useEffect(() => {
    let cancelled = false;

    async function loadHeader() {
      if (isOwner) {
        setHeaderLoading(false);
        setHeaderUser({
          id: user?.id,
          username: user?.username,
          profile_picture_url: user?.profile_picture_url,
        });
        return;
      }
      if (!urlUsername) return;
      setHeaderLoading(true);
      try {
        const info = await fetchPublicUserInfoByUsername(urlUsername); // ← peut être null si 404
        if (!cancelled) {
          setHeaderUser(info ? {
            id: info?.id,
            username: info?.username,
            profile_picture_url: info?.profile_picture_url,
          } : null);
        }
      } catch {
        if (!cancelled) setHeaderUser(null);
      } finally {
        if (!cancelled) setHeaderLoading(false);
      }
    }

    loadHeader();
    return () => { cancelled = true; };
  }, [isOwner, urlUsername, user?.id, user?.username, user?.profile_picture_url]);

  // Dépôts
  const [deposits, setDeposits] = useState([]);
  const [depositsLoading, setDepositsLoading] = useState(false);

  useEffect(() => { setDeposits([]); }, [urlUsername, isOwner]);

  const loadDeposits = useCallback(async ({ userId, username } = {}) => {
    try {
      setDepositsLoading(true);
      const data = await fetchUserDepositsFor({ userId, username });
      setDeposits(data);
    } catch (e) {
      console.error(e);
      setDeposits([]);
    } finally {
      setDepositsLoading(false);
    }
  }, []);

  // 🔁 Ne charge qu’avec un identifiant fiable :
  useEffect(() => {
    if (isOwner) {
      loadDeposits({});
    } else if (headerUser?.id) {
      // On envoie id + username (si dispo) pour couvrir les deux cas côté backend
      loadDeposits({ userId: headerUser.id, username: headerUser.username });
    }
  }, [isOwner, headerUser?.id, headerUser?.username, loadDeposits]);

  // ...render identique (avec <Deposit showUser={false} showDate={false} fitContainer />)
}
