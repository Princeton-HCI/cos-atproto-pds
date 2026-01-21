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
        process.env.REACT_APP_BLUESKY_FEED_RULESET_GENERATOR_API,
        { query },
        {
          headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.REACT_APP_FEED_API_KEY,
          },
        },
      );

      clearInterval(interval);
      setProgress(100);

      if (res.data) {
        // Transform old format to new standardized format
        const oldBlueprint = res.data.ruleset.blueprint;
        const newBlueprint = {};

        // Transform topics -> topic_preferences with weight
        if (oldBlueprint.topics) {
          newBlueprint.topic_preferences = oldBlueprint.topics.map((t) => ({
            name: t.name,
            weight: t.priority || 1.0,
          }));
        }

        // Transform suggested_accounts -> profile_preferences with weight
        if (oldBlueprint.suggested_accounts) {
          newBlueprint.profile_preferences =
            oldBlueprint.suggested_accounts.map((did) => ({
              did,
              weight: 0.5,
            }));
        }

        // Transform filters.limit_posts_about -> topic_filters with weight
        if (oldBlueprint.filters?.limit_posts_about) {
          newBlueprint.topic_filters =
            oldBlueprint.filters.limit_posts_about.map((name) => ({
              name,
              weight: 0.5,
            }));
        }

        // Transform filters.limit_posts_from -> profile_filters with weight
        if (oldBlueprint.filters?.limit_posts_from) {
          newBlueprint.profile_filters =
            oldBlueprint.filters.limit_posts_from.map((did) => ({
              did,
              weight: 0.5,
            }));
        }

        // Copy over ranking_weights (transform old to new format), original_prompt, generated_at
        if (oldBlueprint.ranking_weights) {
          // Transform old weights to new format
          const oldWeights = oldBlueprint.ranking_weights;
          newBlueprint.ranking_weights = {
            relevance: oldWeights.focused || oldWeights.balanced || 0.5,
            popularity: oldWeights.trending || 0.5,
            recency: oldWeights.fresh || 0.5,
          };
        } else {
          // Default weights
          newBlueprint.ranking_weights = {
            relevance: 0.5,
            popularity: 0.3,
            recency: 0.2,
          };
        }
        if (oldBlueprint.original_prompt) {
          newBlueprint.original_prompt = oldBlueprint.original_prompt;
        }
        if (oldBlueprint.generated_at) {
          newBlueprint.generated_at = oldBlueprint.generated_at;
        }

        setFeedBlueprint(newBlueprint);
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
