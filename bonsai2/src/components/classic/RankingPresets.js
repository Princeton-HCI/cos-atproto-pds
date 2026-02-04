import { useState } from "react";

const RankingPresets = ({ rankingStyle, handleRankingPreset }) => {
  const [hoveredStyle, setHoveredStyle] = useState(null);

  const styles = {
    focused: {
      icon: "👤",
      label: "Focused",
      details: "R:0.7 P:0.15 Re:0.15",
    },
    fresh: {
      icon: "🕐",
      label: "Fresh",
      details: "R:0.15 P:0.15 Re:0.7",
    },
    balanced: {
      icon: "📊",
      label: "Balanced",
      details: "R:0.33 P:0.33 Re:0.34",
    },
    trending: {
      icon: "📈",
      label: "Trending",
      details: "R:0.1 P:0.7 Re:0.2",
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
      <h2 style={{ margin: "0 0 8px 0", fontSize: "20px", fontWeight: "600" }}>
        Feed Ranking Style
      </h2>
      <p style={{ margin: "0 0 20px 0", fontSize: "14px", color: "#9ca3af" }}>
        Hover over each style to see details
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "12px",
        }}
      >
        {Object.entries(styles).map(([key, { icon, label, details }]) => (
          <button
            key={key}
            onClick={() => handleRankingPreset(key)}
            onMouseEnter={() => setHoveredStyle(key)}
            onMouseLeave={() => setHoveredStyle(null)}
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
            title={hoveredStyle === key ? details : ""}
          >
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
            {hoveredStyle === key && (
              <div
                style={{
                  position: "absolute",
                  bottom: "-40px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: "#1f2937",
                  color: "white",
                  padding: "6px 12px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  whiteSpace: "nowrap",
                  zIndex: 10,
                }}
              >
                {details}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default RankingPresets;
