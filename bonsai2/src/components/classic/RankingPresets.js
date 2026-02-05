import { useState, useEffect } from "react";
import { H, P } from "../Typography";

const RankingPresets = ({ rankingStyle, handleRankingPreset }) => {
  const [hoveredStyle, setHoveredStyle] = useState(null);
  const [clickedStyle, setClickedStyle] = useState(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.matchMedia("(max-width: 768px)").matches);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (clickedStyle !== null) {
        // Check if click is outside the tooltip
        const tooltips = document.querySelectorAll('[data-tooltip="true"]');
        const infoButtons = document.querySelectorAll(
          '[data-info-button="true"]',
        );
        let isOutside = true;

        tooltips.forEach((tooltip) => {
          if (tooltip.contains(event.target)) {
            isOutside = false;
          }
        });

        infoButtons.forEach((button) => {
          if (button.contains(event.target)) {
            isOutside = false;
          }
        });

        if (isOutside) {
          setClickedStyle(null);
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [clickedStyle]);

  const handleInfoClick = (e, key) => {
    e.stopPropagation();
    setClickedStyle(clickedStyle === key ? null : key);
  };

  const styles = {
    focused: {
      icon: "👤",
      label: "Focused",
      relevance: 60,
      popularity: 25,
      recency: 15,
      description: "Prioritizes content perfectly matched to your interests",
    },
    fresh: {
      icon: "🕐",
      label: "Fresh",
      relevance: 20,
      popularity: 20,
      recency: 60,
      description: "Emphasizes recent posts about your interests",
    },
    balanced: {
      icon: "📊",
      label: "Balanced",
      relevance: 40,
      popularity: 30,
      recency: 30,
      description: "Even mix of relevant, popular, and recent content",
    },
    trending: {
      icon: "📈",
      label: "Trending",
      relevance: 20,
      popularity: 60,
      recency: 20,
      description: "Highlights popular content that relates to your interests",
    },
  };

  return (
    <div
      style={{
        background: "white",
        borderRadius: "12px",
        padding: "24px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        marginBottom: "20px",
      }}
    >
      <H style={{ margin: "0 0 8px 0", fontSize: "20px", fontWeight: "600" }}>
        Feed Ranking Style
      </H>
      <P style={{ margin: "0 0 20px 0", fontSize: "14px", color: "#9ca3af" }}>
        {isMobile
          ? "Tap the ⓘ icon to see details"
          : "Hover over each style to see details"}
      </P>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "12px",
        }}
      >
        {Object.entries(styles).map(
          ([
            key,
            { icon, label, relevance, popularity, recency, description },
          ]) => (
            <button
              key={key}
              onClick={() => handleRankingPreset(key)}
              onMouseEnter={() => !isMobile && setHoveredStyle(key)}
              onMouseLeave={() => !isMobile && setHoveredStyle(null)}
              style={{
                padding: "20px 12px",
                background: "white",
                border:
                  rankingStyle === key ? "2px solid #000" : "1px solid #e5e7eb",
                borderRadius: "12px",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "8px",
                transition: "all 0.2s",
                position: "relative",
              }}
            >
              {isMobile && (
                <div
                  onClick={(e) => handleInfoClick(e, key)}
                  data-info-button="true"
                  style={{
                    position: "absolute",
                    top: "8px",
                    right: "8px",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "16px",
                    color: "#9ca3af",
                    padding: "0",
                    width: "20px",
                    height: "20px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  ⓘ
                </div>
              )}
              <div style={{ fontSize: "28px" }}>{icon}</div>
              <div
                style={{
                  fontSize: "16px",
                  fontWeight: rankingStyle === key ? "600" : "500",
                  color: "#1f2937",
                }}
              >
                {label}
              </div>
              {(hoveredStyle === key || clickedStyle === key) && (
                <div
                  data-tooltip="true"
                  style={{
                    position: "absolute",
                    bottom: "100%",
                    left: "50%",
                    transform: "translateX(-50%)",
                    marginBottom: "12px",
                    background: "white",
                    border: "1px solid #e5e7eb",
                    borderRadius: "12px",
                    padding: "16px",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                    zIndex: 1000,
                    minWidth: "280px",
                    textAlign: "left",
                  }}
                >
                  <div
                    style={{
                      fontWeight: "600",
                      marginBottom: "12px",
                      fontSize: "16px",
                    }}
                  >
                    {label} Feed
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                      marginBottom: "12px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <span style={{ fontSize: "14px" }}>👤 Relevance</span>
                      <div
                        style={{
                          flex: 1,
                          height: "6px",
                          background: "#e5e7eb",
                          borderRadius: "3px",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${relevance}%`,
                            height: "100%",
                            background: "#3b82f6",
                            borderRadius: "3px",
                          }}
                        ></div>
                      </div>
                      <span style={{ fontSize: "14px", color: "#6b7280" }}>
                        {relevance}pts
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <span style={{ fontSize: "14px" }}>📈 Popularity</span>
                      <div
                        style={{
                          flex: 1,
                          height: "6px",
                          background: "#e5e7eb",
                          borderRadius: "3px",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${popularity}%`,
                            height: "100%",
                            background: "#10b981",
                            borderRadius: "3px",
                          }}
                        ></div>
                      </div>
                      <span style={{ fontSize: "14px", color: "#6b7280" }}>
                        {popularity}pts
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <span style={{ fontSize: "14px" }}>🕐 Recency</span>
                      <div
                        style={{
                          flex: 1,
                          height: "6px",
                          background: "#e5e7eb",
                          borderRadius: "3px",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${recency}%`,
                            height: "100%",
                            background: "#f97316",
                            borderRadius: "3px",
                          }}
                        ></div>
                      </div>
                      <span style={{ fontSize: "14px", color: "#6b7280" }}>
                        {recency}pts
                      </span>
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: "14px",
                      color: "#6b7280",
                      lineHeight: "1.4",
                    }}
                  >
                    {description}
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#9ca3af",
                      marginTop: "8px",
                      fontStyle: "italic",
                    }}
                  >
                    pts = points (ranking weight out of 100)
                  </div>
                </div>
              )}
            </button>
          ),
        )}
      </div>
    </div>
  );
};

export default RankingPresets;
