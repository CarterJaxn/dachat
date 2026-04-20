import React from "react";
import { createRoot } from "react-dom/client";
import { ChatWidget } from "./ChatWidget.js";

// Mount via script tag data attributes:
// <script src="dachat-widget.iife.js"
//   data-api-url="https://api.dachat.io"
//   data-api-key="wk_xxxx"
//   data-accent-color="#6366f1">
// </script>

const script = document.currentScript as HTMLScriptElement | null;
const apiUrl = script?.dataset.apiUrl ?? "";
const apiKey = script?.dataset.apiKey ?? "";
const accentColor = script?.dataset.accentColor;

const container = document.createElement("div");
document.body.appendChild(container);

createRoot(container).render(
  <ChatWidget apiUrl={apiUrl} apiKey={apiKey} accentColor={accentColor} />
);
