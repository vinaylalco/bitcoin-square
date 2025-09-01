import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./App";
import "./index.css";
import "./i18n";
import { Navigate } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";

import Education from "./routes/Education";
import Profile from "./routes/Profile";
import Login from "./routes/Login";
import Settings from "./routes/Settings";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Navigate to="/education" replace /> }, // ✅ redirect
      { path: "/education", element: <Education /> },
      { path: "/profile", element: <Profile /> },
      { path: "/login", element: <Login /> },
      { path: "/settings", element: <Settings /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  </React.StrictMode>
);
