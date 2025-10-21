import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import App from "./App";
import "./index.css";
import "./i18n";

import Home from "./routes/Home";
import CourseDirectory from "./routes/CourseDirectory";
import CourseDetail from "./routes/CourseDetail";
import Settings from "./routes/Settings";
import Blog from "./routes/Blog";
import Contact from "./routes/Contact";
import Lessons from "./routes/Lessons";
import LessonDetail from "./routes/LessonDetail";
import Languages from "./routes/Languages";
import RouteError from "./routes/RouteError";
import { ThemeProvider } from "./context/ThemeContext";
import { PreferencesProvider } from "./context/PreferencesContext";
import Shop from "./routes/Shop";
import ProductDetail from "./routes/ProductDetail";
import Login from "./routes/Login";
import Register from "./routes/Register";
import ForgotPassword from "./routes/ForgotPassword";
import ResetPassword from "./routes/ResetPassword";
import Dashboard from "./routes/Dashboard";
import { AuthProvider } from "./context/AuthContext";
import NewsletterSubscribe from "./pages/NewsletterSubscribe";
import CheckoutSuccess from "./routes/CheckoutSuccess";
import CheckoutCancel from "./routes/CheckoutCancel";
import Community from "./routes/Community";
import Profile from "./routes/Profile";
import Messages from "./routes/Messages";
import { ProfileIdentityProvider } from "./context/ProfileIdentityContext";
import { DirectMessageProvider } from "./context/DirectMessageContext";
import { ToastProvider } from "./context/ToastContext";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    errorElement: <RouteError />,              // ✅ friendly error UI
    children: [
      { index: true, element: <Home /> },
      { path: "education", element: <CourseDirectory /> },
      { path: "education/:slug", element: <CourseDetail /> },
      { path: "settings", element: <Settings /> },
      { path: "blog", element: <Blog /> },
      { path: "contact", element: <Contact /> },
      { path: "lessons", element: <Lessons /> },
      { path: "lessons/:slug", element: <LessonDetail /> },
      { path: "languages", element: <Languages /> },
      { path: "shop", element: <Shop /> },
      { path: "shop/:id", element: <ProductDetail /> },
      { path: "login", element: <Login /> },
      { path: "dashboard", element: <Dashboard /> },
      { path: "register", element: <Register /> },
      { path: "forgot-password", element: <ForgotPassword /> },
      { path: "reset-password", element: <ResetPassword /> },
      { path: "newsletter", element: <NewsletterSubscribe /> },
      { path: "checkout/success", element: <CheckoutSuccess /> },
      { path: "checkout/cancel", element: <CheckoutCancel /> },
      { path: "community", element: <Community /> },
      { path: "community/forum/:postId", element: <Community /> },
      { path: "profile/:pubkey/messages", element: <Messages /> },
      { path: "profile/:pubkey", element: <Profile /> },
      { path: "messages", element: <Messages /> },
    ],
  },
]);

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>
          <PreferencesProvider>
            <ProfileIdentityProvider>
              <DirectMessageProvider>
                <ToastProvider>
                  <RouterProvider router={router} />
                </ToastProvider>
              </DirectMessageProvider>
            </ProfileIdentityProvider>
          </PreferencesProvider>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>
);

if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/nostr-sw.js")
      .catch((error) => console.warn("Service worker registration failed", error));
  });
}
