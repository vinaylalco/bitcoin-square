import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Mount the React application using the standard Vite entry point.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
