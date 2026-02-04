import { useState, useEffect } from "react";
import Panel from "../Panel";
import {
  extractHandleOrDid,
  resolveDidFromHandleOrDid,
  getProfile,
} from "../../utils/bluesky";

const SourceSelector = ({
  forPreferences = true,
  feedBlueprint,
  setFeedBlueprint,
}) => {
  const [sources, setSources] = useState([]); // stores {id, weight}
  const [profiles, setProfiles] = useState({}); // store fetched profile info keyed by DID

  // Populate sources from feedBlueprint
  useEffect(() => {
    if (!feedBlueprint) return;

    let initialSources = [];
    if (forPreferences) {
      const topics = (feedBlueprint.topic_preferences || []).map((t) => ({
        id: t.name,
        weight: t.weight ?? 0.5,
      }));
      const accounts = (feedBlueprint.profile_preferences || []).map((p) => ({
        id: p.did,
        weight: p.weight ?? 0.5,
      }));
      initialSources = [...topics, ...accounts];
    } else {
      const topics = (feedBlueprint.topic_filters || []).map((t) => ({
        id: t.name,
        weight: t.weight ?? 0.5,
      }));
      const profiles = (feedBlueprint.profile_filters || []).map((p) => ({
        id: p.did,
        weight: p.weight ?? 0.5,
      }));
      initialSources = [...topics, ...profiles];
    }

    setSources(initialSources);
  }, [feedBlueprint, forPreferences]);

  // Fetch profile info for any DID that doesn't have it yet
  useEffect(() => {
    const fetchProfiles = async () => {
      const dids = sources
        .filter((src) => src.id.startsWith("did:"))
        .map((src) => src.id);
      for (const did of dids) {
        if (!profiles[did]) {
          const profile = await getProfile(did);
          if (profile) setProfiles((prev) => ({ ...prev, [did]: profile }));
        }
      }
    };

    fetchProfiles();
  }, [sources, profiles]);

  const updateSuggestions = (data) => {
    setFeedBlueprint((prev) => ({
      ...prev,
      ...data,
    }));
  };

  const handleAdd = async (input) => {
    if (!input.trim()) return;

    const normalized = input.trim();
    const extracted = extractHandleOrDid(normalized);

    if (extracted) {
      const did = await resolveDidFromHandleOrDid(extracted);
      if (!did) {
        alert("Could not resolve Bluesky account");
        return;
      }

      setSources((prev) => [...prev, { id: did, weight: 0.5 }]);

      if (forPreferences) {
        updateSuggestions({
          profile_preferences: [
            ...(feedBlueprint.profile_preferences || []),
            { did, weight: 0.5 },
          ],
        });
      } else {
        updateSuggestions({
          profile_filters: [
            ...(feedBlueprint.profile_filters || []),
            { did, weight: 0.5 },
          ],
        });
      }

      return;
    }

    // Topic/phrase
    setSources((prev) => [...prev, { id: normalized, weight: 0.5 }]);

    if (forPreferences) {
      updateSuggestions({
        topic_preferences: [
          ...(feedBlueprint.topic_preferences || []),
          { name: normalized, weight: 0.5 },
        ],
      });
    } else {
      updateSuggestions({
        topic_filters: [
          ...(feedBlueprint.topic_filters || []),
          { name: normalized, weight: 0.5 },
        ],
      });
    }
  };

  const handleRemove = (index) => {
    const removed = sources[index];
    setSources((prev) => prev.filter((_, i) => i !== index));

    if (forPreferences) {
      updateSuggestions({
        topic_preferences: (feedBlueprint.topic_preferences || []).filter(
          (t) => t.name !== removed.id,
        ),
        profile_preferences: (feedBlueprint.profile_preferences || []).filter(
          (p) => p.did !== removed.id,
        ),
      });
    } else {
      updateSuggestions({
        topic_filters: (feedBlueprint.topic_filters || []).filter(
          (t) => t.name !== removed.id,
        ),
        profile_filters: (feedBlueprint.profile_filters || []).filter(
          (p) => p.did !== removed.id,
        ),
      });
    }
  };

  const handleWeightChange = (index, newWeight) => {
    const updatedSources = [...sources];
    updatedSources[index] = { ...updatedSources[index], weight: newWeight };
    setSources(updatedSources);

    const source = updatedSources[index];
    const isDid = source.id.startsWith("did:");

    if (forPreferences) {
      if (isDid) {
        updateSuggestions({
          profile_preferences: (feedBlueprint.profile_preferences || []).map(
            (p) => (p.did === source.id ? { ...p, weight: newWeight } : p),
          ),
        });
      } else {
        updateSuggestions({
          topic_preferences: (feedBlueprint.topic_preferences || []).map((t) =>
            t.name === source.id ? { ...t, weight: newWeight } : t,
          ),
        });
      }
    } else {
      if (isDid) {
        updateSuggestions({
          profile_filters: (feedBlueprint.profile_filters || []).map((p) =>
            p.did === source.id ? { ...p, weight: newWeight } : p,
          ),
        });
      } else {
        updateSuggestions({
          topic_filters: (feedBlueprint.topic_filters || []).map((t) =>
            t.name === source.id ? { ...t, weight: newWeight } : t,
          ),
        });
      }
    }
  };

  const formatSearchUrl = (topic) =>
    `https://bsky.app/search?q=${encodeURIComponent(topic)}`;

  const formatProfileUrl = (profile) =>
    profile.handle
      ? `https://bsky.app/profile/${profile.handle}`
      : `https://bsky.app/profile/${profile.did}`;

  return (
    <Panel title={forPreferences ? "Get posts from" : "Limit posts about"}>
      <small>
        <i>You can also add accounts by pasting their URLs!</i>
      </small>
      <small style={{ display: "block", marginTop: "4px", color: "#666" }}>
        💡 <strong>Tip:</strong> Use the sliders to adjust{" "}
        {forPreferences
          ? "how much each source influences your feed"
          : "how strongly each filter is applied"}
        . Higher values ={" "}
        {forPreferences ? "more priority" : "stronger filtering"}.
      </small>

      {sources.length > 0 && (
        <ul className="item-list">
          {sources.map((src, i) => {
            const profile = profiles[src.id]; // undefined for non-DID
            const isDid = src.id.startsWith("did:");
            const link = profile
              ? formatProfileUrl(profile)
              : !isDid
                ? formatSearchUrl(src.id)
                : null;

            return (
              <li key={i} className="list-item">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    flex: 1,
                    flexDirection: "column",
                    width: "100%",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      width: "100%",
                      justifyContent: "space-between",
                    }}
                  >
                    {link ? (
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="did-chip"
                      >
                        {profile ? (
                          <>
                            <img
                              src={profile.avatar}
                              alt={profile.handle}
                              className="did-avatar"
                            />
                            <span>{profile.handle}</span>
                          </>
                        ) : (
                          <span>{src.id}</span>
                        )}
                      </a>
                    ) : (
                      <span
                        style={{
                          wordBreak: "break-word",
                          overflowWrap: "anywhere",
                        }}
                      >
                        {src.id}
                      </span>
                    )}
                    <button
                      className="icon-btn"
                      onClick={() => handleRemove(i)}
                    >
                      ✕
                    </button>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      width: "100%",
                    }}
                    title={
                      forPreferences
                        ? "Higher weight = more influence on feed. 0 = ignore, 1 = maximum priority"
                        : "Higher weight = stronger filter. 0 = allow, 1 = maximum filtering"
                    }
                  >
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={src.weight}
                      onChange={(e) =>
                        handleWeightChange(i, parseFloat(e.target.value))
                      }
                      style={{
                        flex: 1,
                      }}
                    />
                    <span style={{ minWidth: "35px", fontSize: "12px" }}>
                      {src.weight.toFixed(2)}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="textarea-container">
        <input
          className="input"
          placeholder="Add a topic or account link..."
          onKeyDown={async (e) => {
            if (e.key === "Enter") {
              await handleAdd(e.target.value);
              e.target.value = "";
            }
          }}
        />
      </div>
    </Panel>
  );
};

export default SourceSelector;
