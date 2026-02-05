import { useState } from "react";
import { H } from "../Typography";

const SectionOne = ({ feedBlueprint, setFeedBlueprint }) => {
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingValue, setEditingValue] = useState("");
  const [showAll, setShowAll] = useState(false);

  const handleAddNew = () => {
    const newTopics = [...(feedBlueprint.topic_preferences || [])];
    newTopics.push({ name: "", weight: 0.3, isNew: true });
    setFeedBlueprint((prev) => ({
      ...prev,
      topic_preferences: newTopics,
    }));
    setEditingIndex(newTopics.length - 1);
    setEditingValue("");
  };

  const handleSave = (idx) => {
    if (!editingValue.trim()) return;

    const newTopics = [...(feedBlueprint.topic_preferences || [])];
    newTopics[idx] = { name: editingValue.trim(), weight: 0.3 };
    setFeedBlueprint((prev) => ({
      ...prev,
      topic_preferences: newTopics,
    }));
    setEditingIndex(null);
    setEditingValue("");
  };

  const handleCancel = (idx) => {
    const topic = feedBlueprint.topic_preferences[idx];
    if (topic.isNew || !topic.name) {
      // Remove the item if it was newly added or has no name
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
  };

  const handleEdit = (idx) => {
    setEditingIndex(idx);
    setEditingValue(feedBlueprint.topic_preferences[idx].name);
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

  // Filter for Section 1 items (weight 0.3)
  const allTopics = (feedBlueprint.topic_preferences || []).filter(
    (t) => t.weight === 0.3,
  );
  const recentTopics = showAll ? allTopics : allTopics.slice(-4);
  const displayedTopics = [...recentTopics].reverse();
  const hasEmptyEditing = editingIndex !== null && !editingValue.trim();

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
              background: "#0ea5e9",
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
            1
          </div>
          <H style={{ margin: "0", fontSize: "24px", fontWeight: "600" }}>
            Get posts from
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
              color: "#0ea5e9",
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
          // Find the actual index in the full topics array
          const actualIdx = feedBlueprint.topic_preferences.indexOf(topic);
          const isEditing = editingIndex === actualIdx;
          const currentValue = isEditing ? editingValue : topic.name;
          const isEmpty = !currentValue || currentValue.trim() === "";

          return (
            <div
              key={actualIdx}
              style={{
                padding: "16px 20px",
                background: "#f0f9ff",
                borderRadius: "8px",
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
                }}
              >
                {isEditing ? (
                  <input
                    type="text"
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    placeholder="Enter topic name"
                    autoFocus
                    style={{
                      fontSize: "16px",
                      color: editingValue ? "#374151" : "#9ca3af",
                      border: "none",
                      background: "transparent",
                      outline: "none",
                      flex: 1,
                    }}
                    onKeyPress={(e) => {
                      if (e.key === "Enter" && editingValue.trim()) {
                        handleSave(actualIdx);
                      }
                    }}
                  />
                ) : (
                  <>
                    <span
                      style={{
                        fontSize: "16px",
                        color: isEmpty ? "#9ca3af" : "#374151",
                      }}
                    >
                      {isEmpty ? "Enter topic name" : `Search "${topic.name}"`}
                    </span>
                    {/* {!isEmpty && (
                      <span
                        style={{
                          color: "#9ca3af",
                          fontSize: "18px",
                          cursor: "pointer",
                        }}
                        title="Info"
                      >
                        ⓘ
                      </span>
                    )} */}
                  </>
                )}
              </div>
              <div style={{ display: "flex", gap: "12px" }}>
                {isEditing ? (
                  <>
                    {editingValue.trim() && (
                      <button
                        onClick={() => handleSave(actualIdx)}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          fontSize: "20px",
                          padding: "0",
                        }}
                        title="Save"
                      >
                        ✓
                      </button>
                    )}
                    <button
                      onClick={() => handleCancel(actualIdx)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontSize: "20px",
                        color: "#9ca3af",
                        padding: "0",
                      }}
                      title="Cancel"
                    >
                      ✕
                    </button>
                  </>
                ) : (
                  <>
                    {!isEmpty && (
                      <button
                        onClick={() => handleEdit(actualIdx)}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          fontSize: "20px",
                          color: "#9ca3af",
                          padding: "0",
                        }}
                        title="Edit"
                      >
                        ✏️
                      </button>
                    )}
                    <button
                      onClick={() => handleRemove(actualIdx)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontSize: "20px",
                        color: "#9ca3af",
                        padding: "0",
                      }}
                      title="Remove"
                    >
                      ✕
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SectionOne;
