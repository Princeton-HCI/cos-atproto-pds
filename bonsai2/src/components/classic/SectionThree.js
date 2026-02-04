import { useState, useEffect } from "react";

const SectionThree = ({ feedBlueprint, setFeedBlueprint }) => {
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingValue, setEditingValue] = useState("");
  const [editingWeight, setEditingWeight] = useState(0.75);
  const [showAll, setShowAll] = useState(false);
  const [expandedTexts, setExpandedTexts] = useState({});
  const [truncatedTexts, setTruncatedTexts] = useState({});

  const handleAddNew = () => {
    const newFilters = [...(feedBlueprint.topic_filters || [])];
    newFilters.push({ name: "", weight: 0.75, isNew: true });
    setFeedBlueprint((prev) => ({
      ...prev,
      topic_filters: newFilters,
    }));
    setEditingIndex(newFilters.length - 1);
    setEditingValue("");
    setEditingWeight(0.75);
  };

  const handleSave = (idx) => {
    if (!editingValue.trim()) return;

    const newFilters = [...(feedBlueprint.topic_filters || [])];
    newFilters[idx] = { name: editingValue.trim(), weight: editingWeight };
    setFeedBlueprint((prev) => ({
      ...prev,
      topic_filters: newFilters,
    }));
    setEditingIndex(null);
    setEditingValue("");
    setEditingWeight(0.75);
  };

  const handleCancel = (idx) => {
    const filter = feedBlueprint.topic_filters[idx];
    if (filter.isNew || !filter.name) {
      const newFilters = feedBlueprint.topic_filters.filter(
        (_, i) => i !== idx,
      );
      setFeedBlueprint((prev) => ({
        ...prev,
        topic_filters: newFilters,
      }));
    }
    setEditingIndex(null);
    setEditingValue("");
    setEditingWeight(0.75);
  };

  const handleEdit = (idx) => {
    const filter = feedBlueprint.topic_filters[idx];
    setEditingIndex(idx);
    setEditingValue(filter.name);
    setEditingWeight(filter.weight);
  };

  const handleRemove = (idx) => {
    const newFilters = feedBlueprint.topic_filters.filter((_, i) => i !== idx);
    setFeedBlueprint((prev) => ({
      ...prev,
      topic_filters: newFilters,
    }));
  };

  // Filter for Section 3 items (weights 0.75 or 1.0)
  const allFilters = (feedBlueprint.topic_filters || []).filter(
    (t) => t.weight === 0.75 || t.weight === 1.0,
  );
  const recentFilters = showAll ? allFilters : allFilters.slice(-4);
  const displayedFilters = [...recentFilters].reverse();
  const hasEmptyEditing = editingIndex !== null && !editingValue.trim();

  useEffect(() => {
    // Check for text truncation after render
    displayedFilters.forEach((filter) => {
      const actualIdx = feedBlueprint.topic_filters.indexOf(filter);
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
    displayedFilters,
    editingIndex,
    expandedTexts,
    feedBlueprint.topic_filters,
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
              background: "#ef4444",
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
            3
          </div>
          <h2 style={{ margin: "0", fontSize: "24px", fontWeight: "600" }}>
            Limit posts about
          </h2>
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
              color: "#ef4444",
              fontSize: "16px",
              fontWeight: "500",
            }}
          >
            👁️ {showAll ? `Minimize` : `View all (${allFilters.length})`}
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
        {displayedFilters.map((filter, displayIdx) => {
          const idx = allFilters.indexOf(filter);
          const actualIdx = feedBlueprint.topic_filters.indexOf(filter);
          const isEditing = editingIndex === actualIdx;
          const currentValue = isEditing ? editingValue : filter.name;
          const currentWeight = isEditing ? editingWeight : filter.weight;
          const isEmpty = !currentValue || currentValue.trim() === "";

          return (
            <div
              key={actualIdx}
              style={{
                padding: "16px 20px",
                background: "#fee2e2",
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
                            color: "#ef4444",
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
                      const newFilters = [...feedBlueprint.topic_filters];
                      newFilters[actualIdx] = { ...filter, weight: 1.0 };
                      setFeedBlueprint((prev) => ({
                        ...prev,
                        topic_filters: newFilters,
                      }));
                    }
                  }}
                  style={{
                    padding: "8px 20px",
                    background: currentWeight === 1.0 ? "#ef4444" : "#fecaca",
                    color: currentWeight === 1.0 ? "white" : "#ef4444",
                    border: "none",
                    borderRadius: "20px",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: "500",
                  }}
                >
                  Never show
                </button>
                <button
                  onClick={() => {
                    if (isEditing) {
                      setEditingWeight(0.75);
                    } else {
                      const newFilters = [...feedBlueprint.topic_filters];
                      newFilters[actualIdx] = { ...filter, weight: 0.75 };
                      setFeedBlueprint((prev) => ({
                        ...prev,
                        topic_filters: newFilters,
                      }));
                    }
                  }}
                  style={{
                    padding: "8px 20px",
                    background: currentWeight === 0.75 ? "#ef4444" : "#fecaca",
                    color: currentWeight === 0.75 ? "white" : "#ef4444",
                    border: "none",
                    borderRadius: "20px",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: "500",
                  }}
                >
                  Show less often
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SectionThree;
