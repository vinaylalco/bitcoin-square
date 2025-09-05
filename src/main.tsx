import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import App from "./App";
import "./index.css";
import "./i18n";

import Home from "./routes/Home";
import Education from "./routes/Education";
import Profile from "./routes/Profile";
import Login from "./routes/Login";
import Settings from "./routes/Settings";
import Blog from "./routes/Blog";
import Contact from "./routes/Contact";
import Lessons from './routes/Lessons';
import LessonDetail from './routes/LessonDetail';
import Languages from './routes/Languages';

import RequireAdmin from "./routes/RequireAdmin";
import CMSLayout from "./routes/cms/CMSLayout";
import CMSGate from "./routes/cms/CMSGate";
import LessonsEditor from "./routes/cms/LessonsEditor";
import { loadHomeBoth, loadLessonsBoth } from "./routes/cms/loaders";
import RouteError from "./routes/RouteError";
import { ThemeProvider } from "./context/ThemeContext";
import LessonsUpload from "./routes/cms/LessonsUpload"; // ✅ NEW
import HomeEditor from "./routes/cms/HomeEditor";
import NewsletterAdmin from "./routes/cms/NewsletterAdmin";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    errorElement: <RouteError />,              // ✅ friendly error UI
    children: [
      { index: true, element: <Home /> },
      { path: "education", element: <Education /> },
      { path: "profile", element: <Profile /> },
      { path: "login", element: <Login /> },
      { path: "settings", element: <Settings /> },
      { path: "blog", element: <Blog /> },
      { path: "contact", element: <Contact /> },
      { path: "lessons", element: <Lessons /> },
      { path: "lessons/:slug", element: <LessonDetail /> },
      { path: "languages", element: <Languages /> },

      {
        element: <RequireAdmin />,
        errorElement: <RouteError />,          // ✅ errors under /cms/*
        children: [
          {
            path: "cms",
            element: <CMSLayout />,
            errorElement: <RouteError />,      // ✅ per-layout boundary
            children: [
              {
                index: true,
                element: (
                  <CMSGate loader={loadHomeBoth} render={(initial) => <HomeEditor initial={initial} />} />
                ),
              },
              {
                path: "home",
                element: (
                  <CMSGate loader={loadHomeBoth} render={(initial) => <HomeEditor initial={initial} />} />
                ),
              },
              {
                path: "lessons",
                element: (
                  <CMSGate loader={loadLessonsBoth} render={(initial) => <LessonsEditor initial={initial} />} />
                ),
              },
              {
                path: "lessons/upload",
                element: <LessonsUpload />,
              },
              { path: "newsletter", element: <NewsletterAdmin /> },
            ],
          },
        ],
      },
    ],
  },
]);

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
