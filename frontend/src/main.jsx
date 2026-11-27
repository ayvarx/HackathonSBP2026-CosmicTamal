import React from "react";
import { createRoot } from "react-dom/client";
import SbpApp from "./sbp/SbpApp.jsx";
import "./sbp/styles.css";
import "./sbp/fit.css";
import "./sbp/square.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <SbpApp />
  </React.StrictMode>
);
