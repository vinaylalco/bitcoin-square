import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./App";
import "./index.css";
import "./i18n";

import Home from "./routes/Home";
import Education from "./routes/Education";
import Profile from "./routes/Profile";
import Login from "./routes/Login";
import Settings from "./routes/Settings";

import CMSLayout from "./routes/cms/CMSLayout";
import CMSDashboard from "./routes/cms/CMSDashboard";
import LessonsEditor from "./routes/cms/LessonsEditor";
import LessonsUpload from "./routes/cms/LessonsUpload";
import HomeEditor from "./routes/cms/HomeEditor";
import RequireAdmin from "./routes/RequireAdmin";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Home /> },
      { path: "/education", element: <Education /> },
      { path: "/profile", element: <Profile /> },
      { path: "/login", element: <Login /> },
      { path: "/settings", element: <Settings /> },

      {
        path: "/cms",
        element: <RequireAdmin />,
        children: [
          {
            element: <CMSLayout />,
            children: [
              { index: true, element: <CMSDashboard /> },
              { path: "lessons", element: <LessonsEditor /> },
              { path: "lessons/upload", element: <LessonsUpload /> },
              { path: "home", element: <HomeEditor /> },
            ],
          },
        ],
      },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
