import { useState, useEffect } from "react";
import LoginScreen from "./components/LoginScreen";
import FeedBuilderUI from "./components/v2/FeedBuilderUI";
import BonsaiClassic from "./components/BonsaiClassic";
import { getCredentials } from "./utils/auth";
import "./App.css";

const App = () => {
  const [credentials, setCredentials] = useState(null);
  const [uiMode, setUiMode] = useState("bonsai2"); // "bonsai2" or "classic"

  useEffect(() => {
    getCredentials(setCredentials);
    // Restore UI mode from localStorage
    const savedMode = localStorage.getItem("bonsai-ui-mode");
    if (savedMode) {
      setUiMode(savedMode);
    }
  }, []);

  // Update document title based on UI mode
  useEffect(() => {
    document.title = uiMode === "classic" ? "Bonsai Classic" : "Bonsai v2";
  }, [uiMode]);

  const handleToggleUI = () => {
    const newMode = uiMode === "bonsai2" ? "classic" : "bonsai2";
    setUiMode(newMode);
    localStorage.setItem("bonsai-ui-mode", newMode);
  };

  if (!credentials) {
    return <LoginScreen onLoginSuccess={setCredentials} />;
  }

  if (uiMode === "classic") {
    return (
      <BonsaiClassic
        credentials={credentials}
        setCredentials={setCredentials}
        onToggleUI={handleToggleUI}
      />
    );
  }

  return (
    <FeedBuilderUI
      credentials={credentials}
      setCredentials={setCredentials}
      onToggleUI={handleToggleUI}
    />
  );
};

export default App;
