/** Shared easing for sidebar webviews (smooth, not bouncy). */
export const OB_EASE = "cubic-bezier(0.25, 0.1, 0.25, 1)";

/** Inject once (e.g. from `index.tsx`) so components can use `animation: ob-msg-in …`. */
export const GLOBAL_MOTION_CSS = `
@keyframes ob-msg-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes ob-panel-in {
  from { opacity: 0.88; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes ob-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes ob-pulse-soft {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}
`;
