import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { GlobalMotionStyles } from "./GlobalMotionStyles";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <>
      <GlobalMotionStyles />
      <App />
    </>
  );
}
