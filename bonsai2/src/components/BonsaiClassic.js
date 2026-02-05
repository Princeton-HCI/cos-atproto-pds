import { useState, useEffect } from "react";
import axios from "axios";
import {
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../utils/firebase";
import { H, P } from "./Typography";
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

const FIRESTORE_COLLECTION = "bonsai-classic-user-feeds";

const BonsaiClassic = ({ credentials, setCredentials, onToggleUI }) => {
  const username = credentials?.handle?.split(".")[0] || "user";
  const userDid = credentials?.session?.did;

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
  const [deploySuccess, setDeploySuccess] = useState(false);
  const [deployedFeedUrl, setDeployedFeedUrl] = useState("");

  // Load feeds from Firestore on mount
  useEffect(() => {
    const loadFeeds = async () => {
      if (!userDid) return;

      try {
        // Create user document if it doesn't exist
        const userDocRef = doc(db, FIRESTORE_COLLECTION, userDid);
        await setDoc(userDocRef, { created: true }, { merge: true });

        const feedsCollectionRef = collection(
          db,
          FIRESTORE_COLLECTION,
          userDid,
          "feeds",
        );
        const querySnapshot = await getDocs(feedsCollectionRef);
        const loadedFeeds = [];
        let activeId = null;

        querySnapshot.forEach((doc) => {
          const data = doc.data();
          loadedFeeds.push({
            id: doc.id,
            ...data,
          });
          if (data.isActive) {
            activeId = doc.id;
          }
        });

        setFeeds(loadedFeeds);
        if (activeId) {
          setActiveFeedId(activeId);
        }
      } catch (err) {
        console.error("Failed to load feeds from Firestore:", err);
      }
    };

    loadFeeds();
  }, [userDid]);

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

  const handleSaveFeed = async () => {
    if (!userDid) {
      console.error("User DID is not available");
      alert("Unable to save feed. Please log in again.");
      return;
    }

    const feedId = currentFeedId || Date.now().toString();
    const feedData = {
      name: feedName || "Untitled Feed",
      blueprint: feedBlueprint,
      rankingStyle,
      username,
      createdAt: currentFeedId
        ? feeds.find((f) => f.id === currentFeedId)?.createdAt
        : Date.now(),
      updatedAt: Date.now(),
      isActive: feeds.find((f) => f.id === currentFeedId)?.isActive || false,
    };

    try {
      await setDoc(
        doc(db, FIRESTORE_COLLECTION, userDid, "feeds", feedId),
        feedData,
      );

      let updatedFeeds;
      if (currentFeedId) {
        // Update existing feed
        updatedFeeds = feeds.map((f) =>
          f.id === currentFeedId ? { id: feedId, ...feedData } : f,
        );
      } else {
        // Create new feed
        updatedFeeds = [...feeds, { id: feedId, ...feedData }];
        setCurrentFeedId(feedId);
      }

      setFeeds(updatedFeeds);
    } catch (err) {
      console.error("Failed to save feed to Firestore:", err);
      alert("Failed to save feed. Please try again.");
    }
  };

  const handleActivateFeedFromList = async (feedId) => {
    if (!userDid) {
      console.error("User DID is not available");
      alert("Unable to activate feed. Please log in again.");
      return;
    }

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

      const feedUri = response.data.uri;
      const feedUrl = `https://bsky.app/profile/${feedUri.split("/")[2]}/feed/${
        feedUri.split("/")[4]
      }`;
      setDeployedFeedUrl(feedUrl);

      // Update feeds to set isActive property in Firestore
      const updatedFeeds = feeds.map((f) => ({
        ...f,
        isActive: f.id === feedId,
      }));
      setFeeds(updatedFeeds);

      // Update all feeds in Firestore
      for (const feed of updatedFeeds) {
        await setDoc(doc(db, FIRESTORE_COLLECTION, userDid, "feeds", feed.id), {
          name: feed.name,
          blueprint: feed.blueprint,
          rankingStyle: feed.rankingStyle,
          username: feed.username,
          createdAt: feed.createdAt,
          updatedAt: feed.updatedAt,
          isActive: feed.isActive,
        });
      }

      setActiveFeedId(feedId);
      setDeploySuccess(true);
    } catch (err) {
      console.error("Failed to deploy feed:", err);
      setIsDeploying(false);
      alert("Failed to deploy feed. Please try again.");
    }
  };

  const handleActivateCurrentFeed = async () => {
    if (!userDid) {
      console.error("User DID is not available");
      alert("Unable to activate feed. Please log in again.");
      return;
    }

    // Save first if there are unsaved changes
    if (hasUnsavedChanges()) {
      await handleSaveFeed();
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

      const feedUri = response.data.uri;
      const feedUrl = `https://bsky.app/profile/${feedUri.split("/")[2]}/feed/${
        feedUri.split("/")[4]
      }`;
      setDeployedFeedUrl(feedUrl);

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
          username,
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

      // Update all feeds in Firestore
      for (const feed of updatedFeeds) {
        await setDoc(doc(db, FIRESTORE_COLLECTION, userDid, "feeds", feed.id), {
          name: feed.name,
          blueprint: feed.blueprint,
          rankingStyle: feed.rankingStyle,
          username: feed.username,
          createdAt: feed.createdAt,
          updatedAt: feed.updatedAt,
          isActive: feed.isActive,
        });
      }

      setActiveFeedId(feedId);
      setCurrentFeedId(feedId);
      setDeploySuccess(true);
    } catch (err) {
      console.error("Failed to deploy feed:", err);
      setIsDeploying(false);
      alert("Failed to deploy feed. Please try again.");
    }
  };

  const handleCopyFeed = async (feedId) => {
    if (!userDid) {
      console.error("User DID is not available");
      alert("Unable to copy feed. Please log in again.");
      return;
    }

    const feed = feeds.find((f) => f.id === feedId);
    if (!feed) return;

    const newFeedId = Date.now().toString();
    const newFeed = {
      name: `${feed.name} (Copy)`,
      blueprint: feed.blueprint,
      rankingStyle: feed.rankingStyle,
      username,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isActive: false,
    };

    try {
      await setDoc(
        doc(db, FIRESTORE_COLLECTION, userDid, "feeds", newFeedId),
        newFeed,
      );

      const updatedFeeds = [...feeds, { id: newFeedId, ...newFeed }];
      setFeeds(updatedFeeds);
      alert("Feed copied!");
    } catch (err) {
      console.error("Failed to copy feed:", err);
      alert("Failed to copy feed. Please try again.");
    }
  };

  const handleDeleteFeed = async (feedId) => {
    if (!userDid) {
      console.error("User DID is not available");
      alert("Unable to delete feed. Please log in again.");
      return;
    }

    if (!window.confirm("Are you sure you want to delete this feed?")) return;

    try {
      await deleteDoc(doc(db, FIRESTORE_COLLECTION, userDid, "feeds", feedId));

      const updatedFeeds = feeds.filter((f) => f.id !== feedId);
      setFeeds(updatedFeeds);

      if (activeFeedId === feedId) {
        setActiveFeedId(null);
      }

      alert("Feed deleted!");
    } catch (err) {
      console.error("Failed to delete feed:", err);
      alert("Failed to delete feed. Please try again.");
    }
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
              padding: "20px 0",
              textAlign: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                marginBottom: "16px",
              }}
            >
              <button
                onClick={handleBackToList}
                style={{
                  position: "absolute",
                  left: 0,
                  background: "none",
                  border: "none",
                  fontSize: "32px",
                  cursor: "pointer",
                  padding: "0",
                  color: "#6b7280",
                }}
              >
                ←
              </button>
              <H
                style={{
                  fontSize: "32px",
                  fontWeight: "700",
                  margin: "0",
                  color: "#1a1a1a",
                }}
              >
                Create your feed
              </H>
            </div>
            <P
              style={{
                fontSize: "18px",
                color: "#6b7280",
                margin: "0 0 40px 0",
              }}
            >
              Customize your feed sources and content preferences
            </P>
            <div>
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
                  padding: "6px 32px",
                  background:
                    !feedIntent.trim() || isGenerating ? "#f3f4f6" : "white",
                  color:
                    !feedIntent.trim() || isGenerating ? "#9ca3af" : "#1a1a1a",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  cursor:
                    !feedIntent.trim() || isGenerating
                      ? "not-allowed"
                      : "pointer",
                  fontSize: "14px",
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
                  background: "rgba(0, 0, 0, 0.6)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 1000,
                }}
              >
                <div
                  style={{
                    background: "white",
                    borderRadius: "8px",
                    padding: "2rem",
                    maxWidth: "400px",
                    width: "90%",
                    textAlign: "center",
                  }}
                >
                  <P
                    style={{
                      fontSize: "20px",
                      fontWeight: "600",
                      margin: "0 0 1rem 0",
                      color: "#1f2937",
                    }}
                  >
                    🌳 Generating your feed ruleset!
                  </P>
                  <P
                    style={{
                      fontSize: "14px",
                      color: "#6b7280",
                      margin: "0 0 1rem 0",
                    }}
                  >
                    This process usually takes around a minute or less...
                  </P>
                  <div
                    style={{
                      width: "100%",
                      height: "10px",
                      background: "#eee",
                      borderRadius: "5px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${progress}%`,
                        height: "100%",
                        background: "#4caf50",
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
              <P
                style={{
                  fontSize: "20px",
                  fontWeight: "600",
                  margin: "0 0 12px 0",
                  color: "#1f2937",
                }}
              >
                🚀 Deploying your feed!
              </P>
              <P
                style={{
                  fontSize: "14px",
                  color: "#6b7280",
                  margin: "0 0 24px 0",
                }}
              >
                This process usually takes around a minute or less...
              </P>
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

        {/* Deployment Success Modal */}
        {deploySuccess && !isDeploying && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.6)",
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
                position: "relative",
              }}
            >
              <button
                onClick={() => {
                  setDeploySuccess(false);
                  setView("list");
                }}
                style={{
                  position: "absolute",
                  top: "16px",
                  right: "16px",
                  background: "none",
                  border: "none",
                  fontSize: "24px",
                  cursor: "pointer",
                  color: "#9ca3af",
                  padding: "0",
                  width: "32px",
                  height: "32px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                aria-label="Close"
              >
                ✕
              </button>

              <P
                style={{
                  fontSize: "20px",
                  fontWeight: "600",
                  margin: "0 0 12px 0",
                  color: "#1f2937",
                }}
              >
                🦋 Feed deployed successfully!
              </P>
              <P
                style={{
                  fontSize: "14px",
                  color: "#6b7280",
                  margin: "0 0 16px 0",
                }}
              >
                Your active ruleset for your custom feed has been successfully
                deployed.
              </P>
              {deployedFeedUrl && (
                <a
                  href={deployedFeedUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: "inline-block",
                    padding: "12px 24px",
                    background: "#3b82f6",
                    color: "white",
                    textDecoration: "none",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontWeight: "600",
                  }}
                >
                  View on Bluesky
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BonsaiClassic;
