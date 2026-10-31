import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/fredoka";
import "@fontsource/space-mono/400.css";
import "@fontsource/space-mono/700.css";
import "@fontsource/caveat/500.css";
import "@fontsource/caveat/700.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/dashboard.css";
import "./styles/home.css";
import App from "./App.jsx";
import { registerOptionalFont } from "./lib/optionalFont";

registerOptionalFont();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
