import { useEffect, useState } from "react";
import { fetchUserFeeds, getProfile } from "../utils/bluesky";
import { collection, doc, getDoc } from "firebase/firestore";
import { db } from "../utils/firebase";

const Header = ({
  setCredentials,
  handle,
  setFeedBlueprint,
  setFeedMetadata,
  onToggleUI,
  uiMode = "bonsai2",
}) => {
  const [profile, setProfile] = useState(null);
  const [feeds, setFeeds] = useState([]);
  const [showFeedsOverlay, setShowFeedsOverlay] = useState(false);

  useEffect(() => {
    if (handle) {
      getProfile(handle).then((profile) => setProfile(profile));
    }
  }, [handle]);

  const handleSignOut = () => {
    localStorage.removeItem("bonsai2-credentials");
    setCredentials(null);
  };

  const handleManageOtherFeeds = async () => {
    // Fetch feeds from Bluesky
    try {
      const fetchedFeeds = await fetchUserFeeds(profile?.did);
      setFeeds(fetchedFeeds || []);
      setShowFeedsOverlay(true);
    } catch (err) {
      console.error("Failed to fetch feeds:", err);
    }
  };

  const handleSelectFeed = async (feed) => {
    // Fetch blueprint from Firestore using id derived from feed.uri
    const feedId = `${feed.uri.split("/")[2]}~${feed.uri.split("/")[4]}`;
    try {
      const docRef = doc(
        db,
        process.env.REACT_APP_FIREBASE_FIRESTORE_COLLECTION,
        feedId,
      );
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setFeedBlueprint(docSnap.data());
      } else {
        console.warn("No blueprint found for feed", feedId);
        setFeedBlueprint(null);
      }

      // Update feed metadata
      setFeedMetadata({
        record_name: feed.uri.split("/").pop(),
        display_name: feed.displayName,
        description: feed.description,
        id: feedId,
        prefilled: true,
      });

      setShowFeedsOverlay(false); // close overlay
    } catch (err) {
      console.error("Failed to fetch blueprint:", err);
    }
  };

  return (
    <div className="header-container">
      <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
        <h1 className="header-title">
          {uiMode === "classic" ? "🌳 Bonsai Classic" : "🌳 Bonsai2"}
        </h1>
        {onToggleUI && (
          <button
            className="toggle-ui-btn"
            onClick={onToggleUI}
            style={{
              padding: "8px 16px",
              background: "#e0e0e0",
              border: "none",
              borderRadius: "20px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "500",
              transition: "all 0.2s ease",
            }}
            onMouseOver={(e) => (e.target.style.background = "#d0d0d0")}
            onMouseOut={(e) => (e.target.style.background = "#e0e0e0")}
          >
            Switch to {uiMode === "classic" ? "Bonsai2" : "Bonsai Classic"}
          </button>
        )}
      </div>
      <div className="header-user-section">
        <div className="did-chip">
          <img
            src={
              profile?.avatar ||
              "https://upload.wikimedia.org/wikipedia/commons/0/03/Twitter_default_profile_400x400.png"
            }
            alt="avatar"
            className="did-avatar"
          />
          <span>{handle}</span>
        </div>
        <div className="header-buttons">
          {uiMode === "bonsai2" && (
            <button
              className="manage-btn"
              onClick={() => handleManageOtherFeeds()}
            >
              Manage feeds
            </button>
          )}
          <button className="signout-btn" onClick={() => handleSignOut()}>
            Sign out
          </button>
        </div>
      </div>

      {showFeedsOverlay && !!feeds && (
        <div className="loading-overlay">
          <div className="loading-content" style={{ position: "relative" }}>
            <button
              onClick={() => setShowFeedsOverlay(false)}
              className="close-icon"
              aria-label="Close"
            >
              ✕
            </button>

            <p className="loading-text">
              🦋 Press a Bonsai2 managed feed to manage it
            </p>

            <div className="item-list">
              {feeds.map((feed) => (
                <div
                  key={feed.uri}
                  onClick={() => handleSelectFeed(feed)}
                  className="wrapped-list-item"
                >
                  {feed.displayName}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Header;
