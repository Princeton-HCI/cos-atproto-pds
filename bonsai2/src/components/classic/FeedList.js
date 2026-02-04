const FeedList = ({
  feeds,
  activeFeedId,
  credentials,
  onSelectFeed,
  onNewFeed,
  onActivate,
  onCopy,
  onDelete,
}) => {
  // Construct feed URL for active feed
  const getFeedUrl = () => {
    if (!credentials?.handle) return null;
    const username = credentials.handle.split(".")[0];
    // URI format: at://did:plc:xxx/app.bsky.feed.generator/USERNAME-bonsai-feed
    // We need to get the DID from handle, but for now we'll construct the URL using handle
    // The feed URL pattern is: https://bsky.app/profile/{handle}/feed/{record_name}
    return `https://bsky.app/profile/${credentials.handle}/feed/${username}-bonsai-feed`;
  };

  const feedUrl = getFeedUrl();
  return (
    <div style={{ padding: "20px 0" }}>
      <div style={{ marginBottom: "32px" }}>
        <h1
          style={{
            fontSize: "48px",
            fontWeight: "700",
            margin: "0 0 16px 0",
            color: "#1a1a1a",
            textAlign: "center",
          }}
        >
          Manage Feeds
        </h1>
        <p
          style={{
            fontSize: "18px",
            color: "#6b7280",
            margin: "0 0 40px 0",
            textAlign: "center",
          }}
        >
          Create, organize, and switch between your content feeds
        </p>
        <button
          onClick={onNewFeed}
          style={{
            width: "100%",
            padding: "16px 32px",
            background: "white",
            border: "2px solid #e5e7eb",
            borderRadius: "12px",
            cursor: "pointer",
            fontSize: "18px",
            fontWeight: "600",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            color: "#1a1a1a",
          }}
        >
          <span style={{ fontSize: "24px" }}>+</span> New feed
        </button>
      </div>

      {feeds.length > 0 && (
        <div>
          <h2
            style={{
              fontSize: "28px",
              fontWeight: "700",
              margin: "0 0 24px 0",
              color: "#1a1a1a",
            }}
          >
            Your feeds
          </h2>

          <div
            style={{ display: "flex", flexDirection: "column", gap: "16px" }}
          >
            {feeds.map((feed) => {
              const isActive = feed.isActive || false;
              return (
                <div
                  key={feed.id}
                  style={{
                    background: "white",
                    border: isActive
                      ? "2px solid #0ea5e9"
                      : "2px solid #e5e7eb",
                    borderRadius: "12px",
                    padding: "24px",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      marginBottom: "16px",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          marginBottom: "8px",
                        }}
                      >
                        <h3
                          style={{
                            margin: "0",
                            fontSize: "24px",
                            fontWeight: "600",
                            color: "#1a1a1a",
                          }}
                        >
                          {feed.name}
                        </h3>
                        {isActive && (
                          <span
                            style={{
                              color: "#10b981",
                              fontSize: "16px",
                              fontWeight: "600",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            Active ✓
                          </span>
                        )}
                      </div>
                      {isActive && feedUrl && (
                        <a
                          href={feedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: "#0ea5e9",
                            fontSize: "16px",
                            textDecoration: "none",
                          }}
                        >
                          View on Bluesky
                        </a>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: "12px" }}>
                      <button
                        onClick={() => onCopy(feed.id)}
                        style={{
                          width: "48px",
                          height: "48px",
                          background: "white",
                          border: "2px solid #e5e7eb",
                          borderRadius: "8px",
                          cursor: "pointer",
                          fontSize: "20px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#9ca3af",
                        }}
                      >
                        📋
                      </button>
                      <button
                        onClick={() => onDelete(feed.id)}
                        style={{
                          width: "48px",
                          height: "48px",
                          background: "white",
                          border: "2px solid #e5e7eb",
                          borderRadius: "8px",
                          cursor: "pointer",
                          fontSize: "20px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#9ca3af",
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "12px" }}>
                    <button
                      onClick={() => onSelectFeed(feed.id)}
                      style={{
                        flex: 1,
                        padding: "12px 32px",
                        background: "white",
                        border: "2px solid #0ea5e9",
                        borderRadius: "8px",
                        cursor: "pointer",
                        fontSize: "16px",
                        fontWeight: "600",
                        color: "#0ea5e9",
                      }}
                    >
                      Edit
                    </button>
                    {!isActive && (
                      <button
                        onClick={() => onActivate(feed.id)}
                        style={{
                          flex: 1,
                          padding: "12px 32px",
                          background: "white",
                          border: "2px solid #e5e7eb",
                          borderRadius: "8px",
                          cursor: "pointer",
                          fontSize: "16px",
                          fontWeight: "600",
                          color: "#0ea5e9",
                        }}
                      >
                        Activate
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default FeedList;
