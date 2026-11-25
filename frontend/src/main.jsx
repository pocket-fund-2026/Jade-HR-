import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App.jsx";
import UpdateBanner from "./components/UpdateBanner.jsx";
import "./index.css";
import { installNumericAlign } from "./lib/numericAlign.js";
import { installMotion } from "./lib/motion.js";

installNumericAlign();
installMotion();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <UpdateBanner />
    </BrowserRouter>
  </React.StrictMode>,
);
