import React from "react";
import ReactDOM from "react-dom/client";
import { Navigate, createBrowserRouter, RouterProvider } from "react-router-dom";

import App from "./App";
import "./index.css";
import "./i18n";

import { MinerQuotation2Page } from "./pages/MinerQuotation2Page";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Navigate to="/tools/miner-quote" replace /> },
      { path: "tools/miner-quote", element: <MinerQuotation2Page /> },
      { path: "*", element: <Navigate to="/tools/miner-quote" replace /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
