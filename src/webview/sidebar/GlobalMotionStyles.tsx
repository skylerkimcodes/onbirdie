import React from "react";
import { GLOBAL_MOTION_CSS } from "./motion";

/** Mount once next to the webview root so keyframe names are available app-wide. */
export function GlobalMotionStyles(): React.ReactElement {
  return <style>{GLOBAL_MOTION_CSS}</style>;
}
