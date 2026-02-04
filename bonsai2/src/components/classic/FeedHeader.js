import { useState } from "react";

const FeedHeader = ({
  feedName,
  setFeedName,
  onBack,
  onSave,
  hasUnsavedChanges,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editingValue, setEditingValue] = useState("");

  const handleEdit = () => {
    setIsEditing(true);
    setEditingValue(feedName);
  };

  const handleSave = () => {
    if (editingValue.trim()) {
      setFeedName(editingValue.trim());
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditingValue("");
  };

  return (
    <div
      style={{
        padding: "40px 0 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      }}
    >
      <button
        onClick={onBack}
        style={{
          position: "absolute",
          left: 0,
          background: "none",
          border: "none",
          fontSize: "32px",
          cursor: "pointer",
          padding: "0",
          color: "#6b7280",
        }}
      >
        ←
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        {isEditing ? (
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <input
              type="text"
              value={editingValue}
              onChange={(e) => setEditingValue(e.target.value)}
              placeholder="Feed Name"
              autoFocus
              onKeyPress={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") handleCancel();
              }}
              style={{
                fontSize: "32px",
                fontWeight: "700",
                border: "2px solid #0ea5e9",
                outline: "none",
                background: "#f0f9ff",
                color: "#1a1a1a",
                padding: "8px 16px",
                borderRadius: "8px",
                minWidth: "300px",
              }}
            />
            <button
              onClick={handleSave}
              style={{
                padding: "8px 16px",
                background: "#0ea5e9",
                border: "none",
                borderRadius: "8px",
                fontSize: "16px",
                fontWeight: "600",
                cursor: "pointer",
                color: "white",
              }}
            >
              Save
            </button>
            <button
              onClick={handleCancel}
              style={{
                padding: "8px 16px",
                background: "transparent",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                fontSize: "16px",
                fontWeight: "600",
                cursor: "pointer",
                color: "#6b7280",
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <h1
              style={{
                margin: "0",
                fontSize: "32px",
                fontWeight: "700",
                color: "#1a1a1a",
              }}
            >
              {feedName || "Untitled Feed"}
            </h1>
            <button
              onClick={handleEdit}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: "24px",
                padding: "0",
                color: "#9ca3af",
              }}
            >
              ✏️
            </button>
          </div>
        )}
      </div>

      <button
        onClick={onSave}
        disabled={!hasUnsavedChanges}
        style={{
          position: "absolute",
          right: 0,
          padding: "12px 32px",
          background: "white",
          border: "2px solid #e5e7eb",
          borderRadius: "8px",
          fontSize: "18px",
          fontWeight: "600",
          cursor: hasUnsavedChanges ? "pointer" : "default",
          color: "#6b7280",
          opacity: hasUnsavedChanges ? 1 : 0.6,
          visibility: isEditing ? "hidden" : "visible",
        }}
      >
        {hasUnsavedChanges ? "Save" : "Saved"}
      </button>
    </div>
  );
};

export default FeedHeader;
