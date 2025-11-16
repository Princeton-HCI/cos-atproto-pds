import { useState } from "react";
import { encrypt } from "../utils/crypto";
import { verifyBlueskyLogin } from "../utils/auth";

const LoginScreen = ({ onLoginSuccess }) => {
  const [handle, setHandle] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const session = await verifyBlueskyLogin(handle, password);

      if (!session) {
        setError("Invalid handle or password.");
        return;
      }

      const encryptedPw = await encrypt(password);

      const stored = {
        handle,
        encryptedPw,
        session,
      };

      localStorage.setItem("bonsai2-credentials", JSON.stringify(stored));

      onLoginSuccess({
        handle,
        password,
        session,
      });
    } catch (err) {
      console.error(err);
      setError("An error occurred during login.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <div className="login-container">
        <h1 className="login-title">
          🌳 Bonsai2 - Create custom Bluesky feeds!
        </h1>
        <p className="login-sub">
          Build personalized feeds by choosing sources, setting content
          preferences, and controlling what you see. Powered by AI.
        </p>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="textarea-label">Bluesky Handle</div>
          <div className="subtext">
            Your Bluesky username, used to authenticate your account.
          </div>
          <input
            type="text"
            placeholder="username.bsky.social"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            required
          />

          <div className="textarea-label">App Password</div>
          <div className="subtext">
            Your Bluesky app-specific password. Create one in Settings → Privacy
            and Security → App Passwords.
          </div>
          <input
            type="password"
            placeholder="a1b2-c3d4-e5f6-g7h8"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error && <div className="error">{error}</div>}

          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? "Verifying..." : "Build your Bluesky feed!"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginScreen;
