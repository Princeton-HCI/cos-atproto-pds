import { useState, useEffect } from "react";
import LoginScreen from "./components/LoginScreen";
import FeedBuilderUI from "./components/FeedBuilderUI";
import { getCredentials } from "./utils/auth";
import "./App.css";

const App = () => {
  const [credentials, setCredentials] = useState(null);

  useEffect(() => {
    getCredentials(setCredentials);
  }, []);

  if (!credentials) {
    return <LoginScreen onLoginSuccess={setCredentials} />;
  }

  return <FeedBuilderUI credentials={credentials} />;
};

export default App;
