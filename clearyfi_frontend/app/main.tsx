import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@ds/styles.css";
import "./app.css";
import { App } from "./App";
import { RouterProvider } from "./router";
import { SelectionProvider } from "./state";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider>
      <SelectionProvider>
        <App />
      </SelectionProvider>
    </RouterProvider>
  </StrictMode>,
);
