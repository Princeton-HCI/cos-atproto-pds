import { useState, useEffect } from "react";
import { H } from "../Typography";

const SectionTwo = ({ feedBlueprint, setFeedBlueprint }) => {
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingValue, setEditingValue] = useState("");
  const [editingWeight, setEditingWeight] = useState(0.65);
  const [showAll, setShowAll] = useState(false);
  const [expandedTexts, setExpandedTexts] = useState({});
  const [truncatedTexts, setTruncatedTexts] = useState({});

  const handleAddNew = () => {
    const newTopics = [...(feedBlueprint.topic_preferences || [])];
    newTopics.push({ name: "", weight: 0.65, isNew: true });
    setFeedBlueprint((prev) => ({
      ...prev,
      topic_preferences: newTopics,
    }));
    setEditingIndex(newTopics.length - 1);
    setEditingValue("");
    setEditingWeight(0.65);
  };

  const handleSave = (idx) => {
    if (!editingValue.trim()) return;

    const newTopics = [...(feedBlueprint.topic_preferences || [])];
    newTopics[idx] = { name: editingValue.trim(), weight: editingWeight };
    setFeedBlueprint((prev) => ({
      ...prev,
      topic_preferences: newTopics,
    }));
    setEditingIndex(null);
    setEditingValue("");
    setEditingWeight(0.65);
  };

  const handleCancel = (idx) => {
    const topic = feedBlueprint.topic_preferences[idx];
    if (topic.isNew || !topic.name) {
      const newTopics = feedBlueprint.topic_preferences.filter(
        (_, i) => i !== idx,
      );
      setFeedBlueprint((prev) => ({
        ...prev,
        topic_preferences: newTopics,
      }));
    }
    setEditingIndex(null);
    setEditingValue("");
    setEditingWeight(0.65);
  };

  const handleEdit = (idx) => {
    const topic = feedBlueprint.topic_preferences[idx];
    setEditingIndex(idx);
    setEditingValue(topic.name);
    setEditingWeight(topic.weight);
  };

  const handleRemove = (idx) => {
    const newTopics = feedBlueprint.topic_preferences.filter(
      (_, i) => i !== idx,
    );
    setFeedBlueprint((prev) => ({
      ...prev,
      topic_preferences: newTopics,
    }));
  };

  // Filter for Section 2 items (weights 0.65 or 1.0)
  const allTopics = (feedBlueprint.topic_preferences || []).filter(
    (t) => t.weight === 0.65 || t.weight === 1.0,
  );
  const recentTopics = showAll ? allTopics : allTopics.slice(-4);
  const displayedTopics = [...recentTopics].reverse();
  const hasEmptyEditing = editingIndex !== null && !editingValue.trim();

  useEffect(() => {
    // Check for text truncation after render
    displayedTopics.forEach((topic) => {
      const actualIdx = feedBlueprint.topic_preferences.indexOf(topic);
      const el = document.querySelector(`[data-text-container="${actualIdx}"]`);
      if (el && editingIndex !== actualIdx && !expandedTexts[actualIdx]) {
        const isTruncated = el.scrollWidth > el.clientWidth;
        if (truncatedTexts[actualIdx] !== isTruncated) {
          setTruncatedTexts((prev) => ({
            ...prev,
            [actualIdx]: isTruncated,
          }));
        }
      }
    });
  }, [
    displayedTopics,
    editingIndex,
    expandedTexts,
    feedBlueprint.topic_preferences,
    truncatedTexts,
  ]);

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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "20px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              background: "#6366f1",
              color: "white",
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "20px",
              fontWeight: "700",
            }}
          >
            2
          </div>
          <H style={{ margin: "0", fontSize: "24px", fontWeight: "600" }}>
            Include posts about
          </H>
        </div>

        <div style={{ display: "flex", gap: "12px" }}>
          <button
            onClick={() => setShowAll(!showAll)}
            style={{
              padding: "8px 16px",
              background: "white",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: "#6366f1",
              fontSize: "16px",
              fontWeight: "500",
            }}
          >
            👁️ {showAll ? `Minimize` : `View all (${allTopics.length})`}
          </button>
          <button
            onClick={handleAddNew}
            disabled={hasEmptyEditing}
            style={{
              width: "40px",
              height: "40px",
              background: "white",
              border: "2px dashed #e5e7eb",
              borderRadius: "8px",
              cursor: hasEmptyEditing ? "not-allowed" : "pointer",
              fontSize: "24px",
              color: hasEmptyEditing ? "#d1d5db" : "#9ca3af",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: hasEmptyEditing ? 0.5 : 1,
            }}
          >
            +
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {displayedTopics.map((topic, displayIdx) => {
          const idx = allTopics.indexOf(topic);
          const actualIdx = feedBlueprint.topic_preferences.indexOf(topic);
          const isEditing = editingIndex === actualIdx;
          const currentValue = isEditing ? editingValue : topic.name;
          const currentWeight = isEditing ? editingWeight : topic.weight;
          const isEmpty = !currentValue || currentValue.trim() === "";

          return (
            <div
              key={actualIdx}
              style={{
                padding: "16px 20px",
                background: "#eef2ff",
                borderRadius: "8px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {isEditing ? (
                    <input
                      type="text"
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      placeholder="Enter topic name"
                      autoFocus
                      onKeyPress={(e) => {
                        if (e.key === "Enter" && editingValue.trim()) {
                          handleSave(actualIdx);
                        }
                      }}
                      style={{
                        flex: 1,
                        padding: "8px 12px",
                        border: "none",
                        borderRadius: "6px",
                        fontSize: "16px",
                        color: isEmpty ? "#9ca3af" : "#1f2937",
                        background: "transparent",
                        outline: "none",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        gap: "4px",
                        minWidth: 0,
                      }}
                    >
                      <div
                        data-text-container={actualIdx}
                        onClick={() => handleEdit(actualIdx)}
                        style={{
                          fontSize: "16px",
                          color: "#1f2937",
                          cursor: "text",
                          padding: "8px 12px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: expandedTexts[actualIdx]
                            ? "normal"
                            : "nowrap",
                          wordBreak: "break-word",
                        }}
                      >
                        {currentValue}
                      </div>
                      {truncatedTexts[actualIdx] && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedTexts((prev) => ({
                              ...prev,
                              [actualIdx]: !prev[actualIdx],
                            }));
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#6366f1",
                            fontSize: "14px",
                            cursor: "pointer",
                            padding: "4px 12px",
                            textAlign: "left",
                            fontWeight: "500",
                          }}
                        >
                          {expandedTexts[actualIdx] ? "Show less" : "Show more"}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
                  {isEditing ? (
                    <>
                      <button
                        onClick={() => handleSave(actualIdx)}
                        disabled={!editingValue.trim()}
                        style={{
                          background: "transparent",
                          border: "none",
                          cursor: editingValue.trim()
                            ? "pointer"
                            : "not-allowed",
                          fontSize: "20px",
                          padding: "4px",
                          opacity: editingValue.trim() ? 1 : 0.5,
                        }}
                      >
                        ✓
                      </button>
                      <button
                        onClick={() => handleCancel(actualIdx)}
                        style={{
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          fontSize: "20px",
                          padding: "4px",
                        }}
                      >
                        ✕
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleEdit(actualIdx)}
                        style={{
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          fontSize: "18px",
                          padding: "4px",
                        }}
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleRemove(actualIdx)}
                        style={{
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          fontSize: "20px",
                          padding: "4px",
                        }}
                      >
                        ✕
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", gap: "12px" }}>
                <button
                  onClick={() => {
                    if (isEditing) {
                      setEditingWeight(1.0);
                    } else {
                      const newTopics = [...feedBlueprint.topic_preferences];
                      newTopics[actualIdx] = { ...topic, weight: 1.0 };
                      setFeedBlueprint((prev) => ({
                        ...prev,
                        topic_preferences: newTopics,
                      }));
                    }
                  }}
                  style={{
                    padding: "8px 20px",
                    background: currentWeight === 1.0 ? "#6366f1" : "#e0e7ff",
                    color: currentWeight === 1.0 ? "white" : "#6366f1",
                    border: "none",
                    borderRadius: "20px",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: "500",
                  }}
                >
                  Strongly prefer
                </button>
                <button
                  onClick={() => {
                    if (isEditing) {
                      setEditingWeight(0.65);
                    } else {
                      const newTopics = [...feedBlueprint.topic_preferences];
                      newTopics[actualIdx] = { ...topic, weight: 0.65 };
                      setFeedBlueprint((prev) => ({
                        ...prev,
                        topic_preferences: newTopics,
                      }));
                    }
                  }}
                  style={{
                    padding: "8px 20px",
                    background: currentWeight === 0.65 ? "#6366f1" : "#e0e7ff",
                    color: currentWeight === 0.65 ? "white" : "#6366f1",
                    border: "none",
                    borderRadius: "20px",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: "500",
                  }}
                >
                  Prefer
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SectionTwo;
