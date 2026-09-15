## 2026-09-01 - Add keyboard focus styles
**Learning:** This app didn't have any specific keyboard navigation focus styling. Adding `:focus-visible` to interactive components (buttons, inputs) makes keyboard navigation noticeably more intuitive without adding an outline to mouse interactions.
**Action:** Always check if `:focus-visible` styling is missing when encountering standard form/interactive elements and add a clear indicator.
## 2026-09-15 - Keyboard accessibility for interactive divs
**Learning:** Interactive div elements like song cards lack default keyboard focus and activation. Relying solely on click handlers excludes screen reader and keyboard-only users.
**Action:** Always add role="button", tabindex="0", and a keydown listener (Enter/Space) to non-standard interactive elements.
