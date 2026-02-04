import { useState, useEffect } from "react";
import axios from "axios";
import Header from "./Header";
import FeedList from "./classic/FeedList";
import FeedHeader from "./classic/FeedHeader";
import SectionOne from "./classic/SectionOne";
import SectionTwo from "./classic/SectionTwo";
import SectionThree from "./classic/SectionThree";
import RankingPresets from "./classic/RankingPresets";

const RANKING_PRESETS = {
  focused: { relevance: 0.7, popularity: 0.15, recency: 0.15 },
  fresh: { relevance: 0.15, popularity: 0.15, recency: 0.7 },
  balanced: { relevance: 0.33, popularity: 0.33, recency: 0.34 },
  trending: { relevance: 0.1, popularity: 0.7, recency: 0.2 },
};

const STORAGE_KEY = "bonsai_classic_feeds";
const ACTIVE_FEED_KEY = "bonsai_classic_active_feed";

const BonsaiClassic = ({ credentials, setCredentials, onToggleUI }) => {
  const username = credentials?.handle?.split(".")[0] || "user";

  // View states: 'list' | 'create' | 'edit'
  const [view, setView] = useState("list");
  const [currentFeedId, setCurrentFeedId] = useState(null);
  const [feeds, setFeeds] = useState([]);
  const [activeFeedId, setActiveFeedId] = useState(null);

  const [feedName, setFeedName] = useState("");
  const [feedBlueprint, setFeedBlueprint] = useState({
    topic_preferences: [],
    profile_preferences: [],
    topic_filters: [],
    profile_filters: [],
    ranking_weights: RANKING_PRESETS.balanced,
  });

  const [feedIntent, setFeedIntent] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [rankingStyle, setRankingStyle] = useState("balanced");
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployProgress, setDeployProgress] = useState(0);

  // Load feeds from localStorage on mount
  useEffect(() => {
    const storedFeeds = localStorage.getItem(STORAGE_KEY);
    const storedActiveId = localStorage.getItem(ACTIVE_FEED_KEY);

    if (storedFeeds) {
      const parsedFeeds = JSON.parse(storedFeeds);
      setFeeds(parsedFeeds);
    }

    if (storedActiveId) {
      setActiveFeedId(storedActiveId);
    }
  }, []);

  const feedMetadata = {
    display_name: feedName,
    description: `${username}'s custom feed`,
    record_name: `${username}-bonsai-feed`,
  };

  // Check if current state has unsaved changes
  const hasUnsavedChanges = () => {
    if (!currentFeedId) return true; // New feed, not saved yet

    const storedFeed = feeds.find((f) => f.id === currentFeedId);
    if (!storedFeed) return true;

    // Compare current state with stored state
    return (
      feedName !== storedFeed.name ||
      JSON.stringify(feedBlueprint) !== JSON.stringify(storedFeed.blueprint) ||
      rankingStyle !== storedFeed.rankingStyle
    );
  };

  const handleNewFeed = () => {
    setView("create");
    setCurrentFeedId(null);
    setFeedName("");
    setFeedIntent("");
    setFeedBlueprint({
      topic_preferences: [],
      profile_preferences: [],
      topic_filters: [],
      profile_filters: [],
      ranking_weights: RANKING_PRESETS.balanced,
    });
    setHasGenerated(false);
    setRankingStyle("balanced");
  };

  const handleSelectFeed = (feedId) => {
    const feed = feeds.find((f) => f.id === feedId);
    if (feed) {
      setCurrentFeedId(feedId);
      setFeedName(feed.name);
      setFeedBlueprint(feed.blueprint);
      setRankingStyle(feed.rankingStyle || "balanced");
      setHasGenerated(true);
      setView("edit");
    }
  };

  const handleBackToList = () => {
    setView("list");
    setCurrentFeedId(null);
    setHasGenerated(false);
  };

  const handleSaveFeed = () => {
    const feedId = currentFeedId || Date.now().toString();
    const feedData = {
      id: feedId,
      name: feedName || "Untitled Feed",
      blueprint: feedBlueprint,
      rankingStyle,
      createdAt: currentFeedId
        ? feeds.find((f) => f.id === currentFeedId)?.createdAt
        : Date.now(),
      updatedAt: Date.now(),
    };

    let updatedFeeds;
    if (currentFeedId) {
      // Update existing feed
      updatedFeeds = feeds.map((f) => (f.id === currentFeedId ? feedData : f));
    } else {
      // Create new feed
      updatedFeeds = [...feeds, feedData];
      setCurrentFeedId(feedId);
    }

    setFeeds(updatedFeeds);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedFeeds));
  };

  const handleActivateFeedFromList = async (feedId) => {
    const feed = feeds.find((f) => f.id === feedId);
    if (!feed) return;

    setIsDeploying(true);
    setDeployProgress(0);

    // Set up smooth 20-second progress animation
    const totalTime = 20000; // 20 seconds
    const startTime = Date.now();
    let apiComplete = false;

    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = (elapsed / totalTime) * 100;

      if (elapsed >= totalTime && apiComplete) {
        clearInterval(progressInterval);
        setDeployProgress(100);
        setTimeout(() => {
          setIsDeploying(false);
        }, 500);
      } else {
        setDeployProgress(Math.min(progress, 99));
      }
    }, 100);

    try {
      // Convert classic blueprint back to standard format for API
      const standardBlueprint = {
        topic_preferences: (feed.blueprint.topic_preferences || []).map(
          (topic) => {
            let weight = topic.weight;
            if (weight === 0.3) {
              weight = 0.5;
            }
            return { name: topic.name, weight };
          },
        ),
        profile_preferences: feed.blueprint.profile_preferences || [],
        topic_filters: (feed.blueprint.topic_filters || []).map((topic) => {
          let weight = topic.weight;
          if (weight === 0.75) {
            weight = 0.5;
          } else if (weight === 1.0) {
            weight = 1.0;
          }
          return { name: topic.name, weight };
        }),
        profile_filters: feed.blueprint.profile_filters || [],
        ranking_weights:
          feed.blueprint.ranking_weights || RANKING_PRESETS.balanced,
        original_prompt: feed.blueprint.original_prompt,
        generated_at: feed.blueprint.generated_at,
      };

      // Deploy to feed manager API
      const postBody = {
        handle: credentials.handle,
        password: credentials.password,
        hostname:
          process.env.REACT_APP_BLUESKY_FEED_MANAGER_API.split(
            "https://",
          )[1].split("/api")[0],
        record_name: `${username}-bonsai-feed`,
        display_name: feed.name,
        description: `${username}'s custom feed`,
        blueprint: standardBlueprint,
      };

      const response = await axios.post(
        process.env.REACT_APP_BLUESKY_FEED_MANAGER_API,
        postBody,
        {
          headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.REACT_APP_FEED_API_KEY,
          },
        },
      );

      apiComplete = true;
      console.log("Feed deployed:", response.data);

      // Update feeds to set isActive property
      const updatedFeeds = feeds.map((f) => ({
        ...f,
        isActive: f.id === feedId,
      }));
      setFeeds(updatedFeeds);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedFeeds));

      setActiveFeedId(feedId);
      localStorage.setItem(ACTIVE_FEED_KEY, feedId);
    } catch (err) {
      console.error("Failed to deploy feed:", err);
      setIsDeploying(false);
      alert("Failed to deploy feed. Please try again.");
    }
  };

  const handleActivateCurrentFeed = async () => {
    // Save first if there are unsaved changes
    if (hasUnsavedChanges()) {
      handleSaveFeed();
    }

    const feedId = currentFeedId || Date.now().toString();

    setIsDeploying(true);
    setDeployProgress(0);

    // Set up smooth 20-second progress animation
    const totalTime = 20000; // 20 seconds
    const startTime = Date.now();
    let apiComplete = false;

    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = (elapsed / totalTime) * 100;

      if (elapsed >= totalTime && apiComplete) {
        clearInterval(progressInterval);
        setDeployProgress(100);
        setTimeout(() => {
          setIsDeploying(false);
        }, 500);
      } else {
        setDeployProgress(Math.min(progress, 99));
      }
    }, 100);

    try {
      // Convert classic blueprint back to standard format for API
      const standardBlueprint = {
        topic_preferences: (feedBlueprint.topic_preferences || []).map(
          (topic) => {
            // Convert back to original weight ranges
            let weight = topic.weight;
            if (weight === 0.3) {
              // Section 1 items - use a moderate weight
              weight = 0.5;
            }
            // Section 2 keeps 0.65 or 1.0 as is
            return { name: topic.name, weight };
          },
        ),
        profile_preferences: feedBlueprint.profile_preferences || [],
        topic_filters: (feedBlueprint.topic_filters || []).map((topic) => {
          // Convert back to original weight ranges
          let weight = topic.weight;
          if (weight === 0.75) {
            // "Show less often" - use lower filter weight
            weight = 0.5;
          } else if (weight === 1.0) {
            // "Never show" - keep at 1.0
            weight = 1.0;
          }
          return { name: topic.name, weight };
        }),
        profile_filters: feedBlueprint.profile_filters || [],
        ranking_weights:
          feedBlueprint.ranking_weights || RANKING_PRESETS.balanced,
        original_prompt: feedBlueprint.original_prompt,
        generated_at: feedBlueprint.generated_at,
      };

      // Deploy to feed manager API using current state
      const postBody = {
        handle: credentials.handle,
        password: credentials.password,
        hostname:
          process.env.REACT_APP_BLUESKY_FEED_MANAGER_API.split(
            "https://",
          )[1].split("/api")[0],
        record_name: `${username}-bonsai-feed`,
        display_name: feedName || "Untitled Feed",
        description: `${username}'s custom feed`,
        blueprint: standardBlueprint,
      };

      const response = await axios.post(
        process.env.REACT_APP_BLUESKY_FEED_MANAGER_API,
        postBody,
        {
          headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.REACT_APP_FEED_API_KEY,
          },
        },
      );

      apiComplete = true;
      console.log("Feed deployed:", response.data);

      // Update feeds to set isActive property
      let updatedFeeds = feeds.map((f) => ({
        ...f,
        isActive: f.id === feedId,
      }));

      // If this is a new feed (not in feeds array yet), add it
      if (!feeds.find((f) => f.id === feedId)) {
        const newFeed = {
          id: feedId,
          name: feedName || "Untitled Feed",
          blueprint: feedBlueprint,
          rankingStyle,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isActive: true,
        };
        updatedFeeds = [
          ...updatedFeeds.map((f) => ({ ...f, isActive: false })),
          newFeed,
        ];
      }

      setFeeds(updatedFeeds);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedFeeds));

      setActiveFeedId(feedId);
      localStorage.setItem(ACTIVE_FEED_KEY, feedId);
    } catch (err) {
      console.error("Failed to deploy feed:", err);
      setIsDeploying(false);
      alert("Failed to deploy feed. Please try again.");
    }
  };

  const handleCopyFeed = (feedId) => {
    const feed = feeds.find((f) => f.id === feedId);
    if (!feed) return;

    const newFeed = {
      ...feed,
      id: Date.now().toString(),
      name: `${feed.name} (Copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const updatedFeeds = [...feeds, newFeed];
    setFeeds(updatedFeeds);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedFeeds));
    alert("Feed copied!");
  };

  const handleDeleteFeed = (feedId) => {
    if (!window.confirm("Are you sure you want to delete this feed?")) return;

    const updatedFeeds = feeds.filter((f) => f.id !== feedId);
    setFeeds(updatedFeeds);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedFeeds));

    if (activeFeedId === feedId) {
      setActiveFeedId(null);
      localStorage.removeItem(ACTIVE_FEED_KEY);
    }

    alert("Feed deleted!");
  };

  const handleGenerateFeed = async () => {
    if (!feedIntent.trim()) return;

    setIsGenerating(true);
    setError("");
    setProgress(0);

    try {
      const interval = setInterval(() => {
        setProgress((prev) => (prev < 95 ? prev + 5 : prev));
      }, 1500);

      const response = await axios.post(
        process.env.REACT_APP_BLUESKY_FEED_RULESET_GENERATOR_API,
        { query: feedIntent },
        {
          headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.REACT_APP_FEED_API_KEY,
          },
        },
      );

      clearInterval(interval);
      setProgress(100);

      const ruleset = response.data.ruleset;
      console.log("Ruleset response:", ruleset);
      const blueprint = ruleset.blueprint;

      // Convert API response to classic UI structure
      const convertedTopicPreferences = [];

      // Process topic_preferences from API
      (blueprint.topic_preferences || []).forEach((topic) => {
        const wordCount = topic.name.trim().split(/\s+/).length;

        if (wordCount === 1) {
          // Single word -> Section 1 (weight 0.3)
          convertedTopicPreferences.push({
            name: topic.name,
            weight: 0.3,
          });
        } else {
          // Multiple words -> Section 2
          // If weight > 0.5: "Strongly prefer" (weight 1.0)
          // If weight <= 0.5: "Prefer" (weight 0.65)
          convertedTopicPreferences.push({
            name: topic.name,
            weight: topic.weight > 0.5 ? 1.0 : 0.65,
          });
        }
      });

      // Process topic_filters from API
      const convertedTopicFilters = (blueprint.topic_filters || []).map(
        (topic) => {
          // If weight > 0.7: "Never show" (weight 1.0)
          // Otherwise: "Show less often" (weight 0.75)
          return {
            name: topic.name,
            weight: topic.weight > 0.7 ? 1.0 : 0.75,
          };
        },
      );

      const newBlueprint = {
        topic_preferences: convertedTopicPreferences,
        profile_preferences: blueprint.profile_preferences || [],
        topic_filters: convertedTopicFilters,
        profile_filters: blueprint.profile_filters || [],
        ranking_weights: blueprint.ranking_weights || RANKING_PRESETS.balanced,
        original_prompt: blueprint.original_prompt,
        generated_at: blueprint.generated_at,
      };

      console.log("Classic converted blueprint:", newBlueprint);
      setFeedBlueprint(newBlueprint);
      setHasGenerated(true);

      // Use display_name from ruleset or extract from intent
      if (ruleset.display_name) {
        setFeedName(ruleset.display_name);
      } else {
        const intentWords = feedIntent.trim().split(" ");
        const generatedName = intentWords.slice(0, 3).join(" ");
        setFeedName(generatedName);
      }
    } catch (err) {
      console.error("Failed to generate feed:", err);
      setError("Failed to get feed suggestions. Try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRankingPreset = (preset) => {
    setRankingStyle(preset);
    setFeedBlueprint((prev) => ({
      ...prev,
      ranking_weights: RANKING_PRESETS[preset],
    }));
  };

  return (
    <div className="app-container">
      <div className="ui-col">
        <Header
          setCredentials={setCredentials}
          handle={credentials?.handle}
          setFeedBlueprint={setFeedBlueprint}
          setFeedMetadata={() => {}}
          onToggleUI={onToggleUI}
          uiMode="classic"
        />

        {view === "list" && (
          <FeedList
            feeds={feeds}
            activeFeedId={activeFeedId}
            credentials={credentials}
            onSelectFeed={handleSelectFeed}
            onNewFeed={handleNewFeed}
            onActivate={handleActivateFeedFromList}
            onCopy={handleCopyFeed}
            onDelete={handleDeleteFeed}
          />
        )}

        {(view === "create" || view === "edit") && !hasGenerated && (
          // Initial intent input screen
          <div
            style={{
              padding: "60px 20px",
              textAlign: "center",
            }}
          >
            <h1
              style={{
                fontSize: "36px",
                fontWeight: "700",
                margin: "0 0 16px 0",
                color: "#1a1a1a",
              }}
            >
              Create your feed
            </h1>
            <p
              style={{
                fontSize: "18px",
                color: "#6b7280",
                margin: "0 0 40px 0",
              }}
            >
              Customize your feed sources and content preferences
            </p>
            <div
              style={{
                maxWidth: "600px",
                margin: "0 auto",
              }}
            >
              <textarea
                value={feedIntent}
                onChange={(e) => setFeedIntent(e.target.value)}
                placeholder="Describe your ideal feed... (e.g., 'I want a feed about cute pets and nature photography')"
                disabled={isGenerating}
                style={{
                  width: "100%",
                  minHeight: "120px",
                  padding: "16px",
                  fontSize: "16px",
                  borderRadius: "12px",
                  border: "1px solid #e5e7eb",
                  resize: "none",
                  fontFamily: "inherit",
                  marginBottom: "20px",
                  boxSizing: "border-box",
                }}
                onKeyPress={(e) => {
                  if (e.key === "Enter" && e.metaKey && !isGenerating) {
                    handleGenerateFeed();
                  }
                }}
              />
              <button
                onClick={handleGenerateFeed}
                disabled={!feedIntent.trim() || isGenerating}
                style={{
                  width: "100%",
                  padding: "16px",
                  background:
                    !feedIntent.trim() || isGenerating ? "#ccc" : "#3b82f6",
                  color: "white",
                  border: "none",
                  borderRadius: "12px",
                  cursor:
                    !feedIntent.trim() || isGenerating
                      ? "not-allowed"
                      : "pointer",
                  fontSize: "18px",
                  fontWeight: "600",
                  boxSizing: "border-box",
                }}
              >
                {isGenerating ? "Generating..." : "Generate Feed"}
              </button>
              {error && (
                <div
                  style={{
                    color: "#d62828",
                    fontSize: "14px",
                    marginTop: "12px",
                    textAlign: "center",
                  }}
                >
                  {error}
                </div>
              )}
            </div>

            {isGenerating && (
              <div
                style={{
                  position: "fixed",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: "rgba(0, 0, 0, 0.5)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 1000,
                }}
              >
                <div
                  style={{
                    background: "white",
                    borderRadius: "16px",
                    padding: "40px",
                    maxWidth: "500px",
                    width: "90%",
                    textAlign: "center",
                  }}
                >
                  <p
                    style={{
                      fontSize: "20px",
                      fontWeight: "600",
                      margin: "0 0 12px 0",
                      color: "#1f2937",
                    }}
                  >
                    🌳 Generating your feed ruleset!
                  </p>
                  <p
                    style={{
                      fontSize: "14px",
                      color: "#6b7280",
                      margin: "0 0 24px 0",
                    }}
                  >
                    This process usually takes around a minute or less...
                  </p>
                  <div
                    style={{
                      width: "100%",
                      height: "8px",
                      background: "#e5e7eb",
                      borderRadius: "4px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${progress}%`,
                        height: "100%",
                        background: "#3b82f6",
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {(view === "create" || view === "edit") && hasGenerated && (
          // Show sections after generation
          <>
            <FeedHeader
              feedName={feedName}
              setFeedName={setFeedName}
              onBack={handleBackToList}
              onSave={handleSaveFeed}
              hasUnsavedChanges={hasUnsavedChanges()}
            />

            <SectionOne
              feedBlueprint={feedBlueprint}
              setFeedBlueprint={setFeedBlueprint}
            />

            <SectionTwo
              feedBlueprint={feedBlueprint}
              setFeedBlueprint={setFeedBlueprint}
            />

            <SectionThree
              feedBlueprint={feedBlueprint}
              setFeedBlueprint={setFeedBlueprint}
            />

            <RankingPresets
              rankingStyle={rankingStyle}
              handleRankingPreset={handleRankingPreset}
            />

            {/* Activate Button */}
            <div style={{ marginTop: "20px" }}>
              <button
                onClick={handleActivateCurrentFeed}
                disabled={!feedName.trim()}
                style={{
                  width: "100%",
                  padding: "14px",
                  background: !feedName.trim() ? "#ccc" : "#3b82f6",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: !feedName.trim() ? "not-allowed" : "pointer",
                  fontSize: "16px",
                  fontWeight: "600",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                }}
              >
                <span style={{ fontSize: "20px" }}>▶</span>
                Activate Feed
              </button>
            </div>
          </>
        )}

        {/* Deployment Progress Modal */}
        {isDeploying && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
            }}
          >
            <div
              style={{
                background: "white",
                borderRadius: "16px",
                padding: "40px",
                maxWidth: "500px",
                width: "90%",
                textAlign: "center",
              }}
            >
              <p
                style={{
                  fontSize: "20px",
                  fontWeight: "600",
                  margin: "0 0 12px 0",
                  color: "#1f2937",
                }}
              >
                🚀 Deploying your feed!
              </p>
              <p
                style={{
                  fontSize: "14px",
                  color: "#6b7280",
                  margin: "0 0 24px 0",
                }}
              >
                This process usually takes around a minute or less...
              </p>
              <div
                style={{
                  width: "100%",
                  height: "8px",
                  background: "#e5e7eb",
                  borderRadius: "4px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${deployProgress}%`,
                    height: "100%",
                    background: "#3b82f6",
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BonsaiClassic;
