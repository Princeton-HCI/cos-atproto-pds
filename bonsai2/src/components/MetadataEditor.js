import { useState, useEffect } from "react";
import Panel from "./Panel";

const MetadataEditor = ({ feedMetadata, setFeedMetadata }) => {
  const [localData, setLocalData] = useState({
    record_name: "",
    display_name: "",
    description: "",
    id: "",
    prefilled: false,
  });

  useEffect(() => {
    if (feedMetadata) {
      setLocalData(feedMetadata);
    }
  }, [feedMetadata]);

  const handleChange = (field, value) => {
    setLocalData((prev) => ({ ...prev, [field]: value }));
    setFeedMetadata((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Panel title="Feed Metadata">
      <div className="couple">
        <div className="single">
          <div className="textarea-label">Display Name</div>
          <div className="subtext" style={{ height: "32px" }}>
            The friendly name for your feed that users will see in Bluesky.
          </div>
          <div className="textarea-container">
            <input
              className="input"
              type="text"
              value={localData.display_name}
              onChange={(e) => handleChange("display_name", e.target.value)}
              placeholder="e.g., Adorable Pets"
            />
          </div>
        </div>
        <div className="wedge" />
        <div className="single">
          <div className="textarea-label">Record Name</div>
          <div className="subtext" style={{ height: "32px" }}>
            The unique identifier for your feed, used in URLs and API calls.
            Alphanumeric with hyphens only. IMMUTABLE UPON DEPLOYMENT.
          </div>
          <div className="textarea-container">
            <input
              className="input"
              type="text"
              value={localData.record_name}
              onChange={(e) => handleChange("record_name", e.target.value)}
              placeholder="e.g., adorable-pets"
              disabled={localData.prefilled}
            />
          </div>
        </div>
      </div>

      <div className="textarea-label">Description</div>
      <div className="subtext">
        A brief explanation of the feed's content and focus. Helps users know
        what to expect.
      </div>
      <br />
      <div className="textarea-container">
        <textarea
          className="textarea"
          rows={3}
          value={localData.description}
          onChange={(e) => handleChange("description", e.target.value)}
          placeholder="Describe your feed..."
        />
      </div>

      <div className="subtext">
        {localData.prefilled && (
          <small>
            <code>ID: {localData.id}</code> (auto-generated, read-only)
          </small>
        )}
      </div>
    </Panel>
  );
};

export default MetadataEditor;
