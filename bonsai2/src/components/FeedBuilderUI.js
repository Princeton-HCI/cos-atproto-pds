import { useState } from "react";
import axios from "axios";
import { getAgent } from "../utils/bluesky";
import IntentInput from "./IntentInput";
import SourceSelector from "./SourceSelector";
import RankingSelector from "./RankingSelector";
import MetadataEditor from "./MetadataEditor";
import Header from "./Header";

const FeedBuilderUI = ({ credentials, setCredentials }) => {
  const [feedBlueprint, setFeedBlueprint] = useState({});
  const [feedMetadata, setFeedMetadata] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [deployedFeedUri, setDeployedFeedUri] = useState("");
  const [deployedFeedUrl, setDeployedFeedUrl] = useState("");
  const [deploySuccess, setDeploySuccess] = useState(false);

  const handleDeploy = async () => {
    if (!feedMetadata || !feedBlueprint) return;
    setLoading(true);
    setProgress(0);
    setError("");
    setDeploySuccess(false);
    setDeployedFeedUrl("");

    try {
      const interval = setInterval(() => {
        setProgress((prev) => (prev < 95 ? prev + 5 : prev));
      }, 2000);

      const postBody = {
        handle: credentials.handle,
        password: credentials.password,
        hostname: "feeds.princetonhci.social",
        record_name: feedMetadata.record_name,
        display_name: feedMetadata.display_name,
        description: feedMetadata.description,
        blueprint: feedBlueprint,
      };

      const res = await axios.post(
        "https://feeds.princetonhci.social/api/manage-feed",
        postBody,
        {
          headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.REACT_APP_FEED_API_KEY,
          },
        }
      );

      clearInterval(interval);
      setProgress(100);

      const feedUri = res.data.uri;
      const feedUrl = `https://bsky.app/profile/${feedUri.split("/")[2]}/feed/${
        feedUri.split("/")[4]
      }`;
      console.log(feedUri);
      console.log(feedUrl);

      const agent = await getAgent();
      const { data: feedInfo } = await agent.app.bsky.feed.getFeedGenerator({
        feed: feedUri,
      });
      if (!feedInfo.view.viewer?.like) {
        await agent.like(feedUri, feedInfo.view.cid);
      }

      setDeployedFeedUri(feedUri);
      setDeployedFeedUrl(feedUrl);

      setDeploySuccess(true);
    } catch (err) {
      console.error("Failed to deploy feed:", err);
      setError("Failed to deploy feed. Please try again.");
    } finally {
      setTimeout(() => setLoading(false), 500);
    }
  };

  return (
    <div className="app-container">
      <div className="ui-col">
        <Header
          setCredentials={setCredentials}
          handle={credentials?.handle}
          setFeedBlueprint={setFeedBlueprint}
          setFeedMetadata={setFeedMetadata}
        />
        <IntentInput
          setFeedBlueprint={setFeedBlueprint}
          setFeedMetadata={setFeedMetadata}
        />

        {!!feedBlueprint && !!feedMetadata && (
          <div>
            <MetadataEditor
              feedMetadata={feedMetadata}
              setFeedMetadata={setFeedMetadata}
            />
            <SourceSelector
              feedBlueprint={feedBlueprint}
              setFeedBlueprint={setFeedBlueprint}
            />
            <SourceSelector
              forPreferences={false}
              feedBlueprint={feedBlueprint}
              setFeedBlueprint={setFeedBlueprint}
            />
            <RankingSelector
              feedBlueprint={feedBlueprint}
              setFeedBlueprint={setFeedBlueprint}
            />

            <div className="textarea-container">
              <button
                className="deploy-btn"
                onClick={handleDeploy}
                disabled={loading}
              >
                {loading ? "Deploying..." : "Deploy!"}
              </button>
            </div>

            {error && <div className="error">{error}</div>}

            {loading && (
              <div className="loading-overlay">
                <div className="loading-content">
                  <p className="loading-text">🚀 Deploying your feed!</p>
                  <p className="loading-text">
                    This usually takes a few seconds...
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
            {deploySuccess && deployedFeedUrl && (
              <div className="loading-overlay">
                <div
                  className="loading-content"
                  style={{ position: "relative" }}
                >
                  <button
                    onClick={() => setDeploySuccess(false)}
                    className="close-icon"
                    aria-label="Close"
                  >
                    ✕
                  </button>

                  <p className="loading-text">🦋 Feed deployed successfully!</p>
                  <p className="loading-text">
                    You can check out your new feed here:
                  </p>

                  <small className="success-message">
                    <a
                      href={deployedFeedUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        width: "75%",
                        display: "inline-block",
                        overflowWrap: "anywhere",
                        color: "#1255ad",
                        marginBottom: "10px",
                      }}
                    >
                      {deployedFeedUrl}
                    </a>
                  </small>

                  <div className="subtext">
                    <small>
                      <code>ID: {feedMetadata.id}</code> (auto-generated,
                      read-only)
                    </small>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default FeedBuilderUI;
