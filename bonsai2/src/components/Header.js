import { useEffect, useState } from "react";
import { getProfile } from "../utils/bluesky";

const Header = ({ setCredentials, handle }) => {
  const [avatar, setAvatar] = useState(null);

  useEffect(() => {
    if (handle) {
      getProfile(handle).then((profile) => {
        setAvatar(profile?.avatar || null);
      });
    }
  }, [handle]);

  const handleSignOut = () => {
    localStorage.removeItem("bonsai2-credentials");
    setCredentials(null);
  };

  return (
    <div className="textarea-container">
      <h1>🌳 Bonsai2</h1>
      <div className="did-chip">
        {avatar && (
          <img
            src={
              avatar ||
              "https://upload.wikimedia.org/wikipedia/commons/0/03/Twitter_default_profile_400x400.png"
            }
            alt="avatar"
            className="did-avatar"
          />
        )}
        <span>{handle}</span>
        <button className="signout-btn" onClick={() => handleSignOut()}>
          Sign out
        </button>
      </div>
    </div>
  );
};

export default Header;
