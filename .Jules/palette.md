## 2026-09-01 - Add keyboard focus styles
**Learning:** This app didn't have any specific keyboard navigation focus styling. Adding `:focus-visible` to interactive components (buttons, inputs) makes keyboard navigation noticeably more intuitive without adding an outline to mouse interactions.
**Action:** Always check if `:focus-visible` styling is missing when encountering standard form/interactive elements and add a clear indicator.
## 2026-09-02 - Custom interactive elements and ARIA tabs
**Learning:** Custom interactive elements like `div`s and `img`s acting as buttons require `role="button"`, `tabindex="0"`, and specific `keydown` event listeners (for `Enter`/`Space`) to be fully keyboard accessible. Additionally, when using `role="tab"`, the `aria-selected` state must be dynamically synced with the UI's active state via JavaScript for screen readers to properly interpret the active tab.
**Action:** Always verify keyboard operability for custom buttons and ensure ARIA states (`aria-selected`, `aria-expanded`, etc.) are actively synced in the JavaScript logic.
