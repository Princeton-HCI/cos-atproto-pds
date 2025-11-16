import Panel from "./Panel";

const OPTIONS = [
  { key: "focused", label: "Focused" },
  { key: "fresh", label: "Fresh" },
  { key: "balanced", label: "Balanced" },
  { key: "trending", label: "Trending" },
];

const RankingSelector = ({ feedBlueprint, setFeedBlueprint }) => {
  const weights = feedBlueprint?.ranking_weights || {};

  const updateWeight = (key, value) => {
    setFeedBlueprint((prev) => ({
      ...prev,
      ranking_weights: {
        ...prev.ranking_weights,
        [key]: value,
      },
    }));
  };

  return (
    <Panel title="Feed Ranking Style">
      <div className="ranking-sliders">
        {OPTIONS.map(({ key, label }) => (
          <div key={key} className="ranking-row">
            <div className="ranking-label">
              <small>{label}</small>
            </div>

            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={weights[key] ?? 0}
              onChange={(e) => updateWeight(key, Number(e.target.value))}
              className="ranking-slider"
            />

            <div className="ranking-value">
              {(weights[key] ?? 0).toFixed(2)}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
};

export default RankingSelector;
