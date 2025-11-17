import { useState } from "react";
import axios from "axios";
import Panel from "./Panel";

const IntentInput = ({ setFeedBlueprint, setFeedMetadata }) => {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  const getFeedBlueprint = async (query) => {
    if (!query) return;
    setLoading(true);
    setError("");
    setProgress(0);

    try {
      const interval = setInterval(() => {
        setProgress((prev) => (prev < 95 ? prev + 5 : prev));
      }, 1500);

      const res = await axios.post(
        "https://bluesky-feed-ruleset-generator-653645331318.us-central1.run.app/api/generate-feed-ruleset",
        { query },
        {
          headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.REACT_APP_FEED_API_KEY,
          },
        }
      );

      clearInterval(interval);
      setProgress(100);

      if (res.data) {
        setFeedBlueprint(res.data.ruleset.blueprint);
        const feedMetadata = { ...res.data.ruleset };
        delete feedMetadata.blueprint;
        setFeedMetadata(feedMetadata);
      }
    } catch (err) {
      console.error("Failed to fetch feed ruleset:", err);
      setError("Failed to get feed suggestions. Try again.");
    } finally {
      setTimeout(() => setLoading(false), 500);
    }
  };

  return (
    <Panel title="Describe your ideal feed">
      <div className="textarea-container">
        <textarea
          className="textarea"
          placeholder="I want to see adorable pictures of pets..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
        />
      </div>
      <div className="textarea-container">
        <button
          className="primary-btn"
          onClick={() => getFeedBlueprint(text)}
          disabled={loading}
        >
          {loading ? "Generating..." : "Generate feed ruleset"}
        </button>
        <div className="char-count">{text.length}/1000</div>
      </div>
      {error && <div className="error">{error}</div>}

      {loading && (
        <div className="loading-overlay">
          <div className="loading-content">
            <p className="loading-text">🌳 Generating your feed ruleset!</p>
            <p className="loading-text">
              This process usually takes around a minute or less...
            </p>

            <div className="progress-container">
              <div
                className="progress-bar"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
};

export default IntentInput;
