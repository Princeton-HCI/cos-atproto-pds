import { useState, useEffect } from "react";
import Panel from "./Panel";
import {
  extractHandleOrDid,
  resolveDidFromHandleOrDid,
} from "../utils/bluesky.ts";

const SourceSelector = ({
  forPreferences = true,
  feedBlueprint,
  setFeedBlueprint,
}) => {
  const [sources, setSources] = useState([]);
  const [profiles, setProfiles] = useState({}); // store fetched profile info keyed by DID

  // Populate sources from feedBlueprint
  useEffect(() => {
    if (!feedBlueprint) return;

    let initialSources = [];
    if (forPreferences) {
      const topics = feedBlueprint.topics?.map((t) => t.name) || [];
      const accounts = feedBlueprint.suggested_accounts || [];
      initialSources = [...topics, ...accounts];
    } else {
      const about = feedBlueprint.filters?.limit_posts_about || [];
      const from = feedBlueprint.filters?.limit_posts_from || [];
      initialSources = [...about, ...from];
    }

    setSources(initialSources);
  }, [feedBlueprint, forPreferences]);

  // Fetch profile info for any DID that doesn't have it yet
  useEffect(() => {
    const dids = sources.filter((src) => src.startsWith("did:"));
    dids.forEach(async (did) => {
      if (!profiles[did]) {
        try {
          const res = await fetch(
            `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${did}`
          );
          if (res.ok) {
            const data = await res.json();
            setProfiles((prev) => ({ ...prev, [did]: data }));
          }
        } catch (err) {
          console.error("Failed to fetch profile for DID", did, err);
        }
      }
    });
  }, [sources, profiles]);

  const updateSuggestions = (data) => {
    setFeedBlueprint((prev) => ({
      ...prev,
      ...data,
      filters: {
        ...(prev?.filters || {}),
        ...(data.filters || {}),
      },
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

      setSources((prev) => [...prev, did]);

      if (forPreferences) {
        updateSuggestions({
          suggested_accounts: [
            ...(feedBlueprint.suggested_accounts || []),
            did,
          ],
        });
      } else {
        updateSuggestions({
          filters: {
            limit_posts_from: [
              ...(feedBlueprint.filters?.limit_posts_from || []),
              did,
            ],
          },
        });
      }

      return;
    }

    // Topic/phrase
    setSources((prev) => [...prev, normalized]);

    if (forPreferences) {
      updateSuggestions({
        topics: [
          ...(feedBlueprint.topics || []),
          { name: normalized, priority: 1.0 },
        ],
      });
    } else {
      updateSuggestions({
        filters: {
          limit_posts_about: [
            ...(feedBlueprint.filters?.limit_posts_about || []),
            normalized,
          ],
        },
      });
    }
  };

  const handleRemove = (index) => {
    const removed = sources[index];
    setSources((prev) => prev.filter((_, i) => i !== index));

    if (forPreferences) {
      updateSuggestions({
        topics: (feedBlueprint.topics || []).filter((t) => t.name !== removed),
        suggested_accounts: (feedBlueprint.suggested_accounts || []).filter(
          (acc) => acc !== removed
        ),
      });
    } else {
      updateSuggestions({
        filters: {
          limit_posts_about: (
            feedBlueprint.filters?.limit_posts_about || []
          ).filter((x) => x !== removed),
          limit_posts_from: (
            feedBlueprint.filters?.limit_posts_from || []
          ).filter((x) => x !== removed),
        },
      });
    }
  };

  const formatSearchUrl = (topic) =>
    `https://bsky.app/search?q=${encodeURIComponent(topic)}`;

  const formatProfileUrl = (profile) =>
    profile.handle
      ? `https://bsky.app/profile/${profile.handle}`
      : `https://bsky.app/profile/${profile.did}`;

  return (
    <Panel title={forPreferences ? "Get posts from" : "Limit posts related to"}>
      <small>
        <i>You can also add accounts by pasting their URLs!</i>
      </small>

      <ul className="item-list">
        {sources.map((src, i) => {
          const profile = profiles[src]; // undefined for non-DID
          const isDid = src.startsWith("did:");
          const link = profile
            ? formatProfileUrl(profile)
            : !isDid
            ? formatSearchUrl(src)
            : null;

          return (
            <li key={i} className="list-item">
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
                    <span>{src}</span>
                  )}
                </a>
              ) : (
                <span>{src}</span>
              )}
              <button className="icon-btn" onClick={() => handleRemove(i)}>
                ✕
              </button>
            </li>
          );
        })}
      </ul>

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
