import Panel from "./Panel";

const OPTIONS = [
  {
    key: "relevance",
    label: "Relevance",
    tooltip: "How well posts match your feed's topics and preferences",
    info: "Relevance prioritizes posts that match your feed's topics and come from preferred profiles. Higher values mean posts closely related to your interests will rank higher.",
    default: 0.5,
  },
  {
    key: "popularity",
    label: "Popularity",
    tooltip: "Posts with more engagement (likes, reposts, replies)",
    info: "Popularity prioritizes posts with high engagement (likes, reposts, replies). Higher values mean viral or popular posts will rank higher regardless of topic match.",
    default: 0.3,
  },
  {
    key: "recency",
    label: "Recency",
    tooltip: "How recently posts were created",
    info: "Recency prioritizes newer posts over older ones. Higher values mean your feed will show the freshest content, even if less relevant or popular.",
    default: 0.2,
  },
];

const DEFAULT_WEIGHTS = {
  relevance: 0.5,
  popularity: 0.3,
  recency: 0.2,
};

const RankingSelector = ({ feedBlueprint, setFeedBlueprint }) => {
  const weights = feedBlueprint?.ranking_weights || DEFAULT_WEIGHTS;

  const updateWeight = (key, rawValue) => {
    const value = Number(rawValue);
    const otherKeys = OPTIONS.filter((opt) => opt.key !== key).map(
      (opt) => opt.key,
    );

    // Get current other values
    const otherValues = otherKeys.map((k) => weights[k] || DEFAULT_WEIGHTS[k]);
    const otherSum = otherValues.reduce((sum, v) => sum + v, 0);

    // Ensure value doesn't exceed what would make total > 1
    const maxValue = Math.min(1.0, 1.0 - 0.01 * otherKeys.length); // Leave at least 0.01 for each other
    const constrainedValue = Math.max(0, Math.min(value, maxValue));

    // Calculate remaining to distribute
    const remaining = 1.0 - constrainedValue;

    // Distribute remaining proportionally among other keys
    const newWeights = { [key]: constrainedValue };

    if (otherSum > 0) {
      // Distribute proportionally
      otherKeys.forEach((k) => {
        const currentVal = weights[k] || DEFAULT_WEIGHTS[k];
        newWeights[k] = (currentVal / otherSum) * remaining;
      });
    } else {
      // Equal distribution if all others are 0
      otherKeys.forEach((k) => {
        newWeights[k] = remaining / otherKeys.length;
      });
    }

    setFeedBlueprint((prev) => ({
      ...prev,
      ranking_weights: newWeights,
    }));
  };

  const showInfo = (info) => {
    alert(info);
  };

  // Calculate sum for display
  const totalWeight = OPTIONS.reduce(
    (sum, opt) => sum + (weights[opt.key] || DEFAULT_WEIGHTS[opt.key]),
    0,
  );

  return (
    <Panel title="Feed Ranking Style">
      <small style={{ display: "block", marginBottom: "12px", color: "#666" }}>
        💡 <strong>Tip:</strong> Adjust how posts are ranked. The three weights
        must sum to 1.0 (currently: {totalWeight.toFixed(2)}).
      </small>
      <div className="ranking-sliders">
        {OPTIONS.map(({ key, label, tooltip, info }) => (
          <div key={key} className="ranking-row">
            <div
              className="ranking-label"
              title={tooltip}
              style={{ display: "flex", alignItems: "center", gap: "4px" }}
            >
              <small>{label}</small>
              <span
                className="infolink"
                onClick={(e) => {
                  e.preventDefault();
                  showInfo(info);
                }}
                style={{
                  cursor: "pointer",
                  userSelect: "none",
                  textDecoration: "none",
                }}
                title="Click for more info"
              ></span>
            </div>

            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={weights[key] ?? DEFAULT_WEIGHTS[key]}
              onChange={(e) => updateWeight(key, e.target.value)}
              className="ranking-slider"
              title={tooltip}
            />

            <div className="ranking-value">
              {(weights[key] ?? DEFAULT_WEIGHTS[key]).toFixed(2)}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
};

export default RankingSelector;
