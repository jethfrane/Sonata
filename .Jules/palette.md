## 2026-09-01 - Add keyboard focus styles
**Learning:** This app didn't have any specific keyboard navigation focus styling. Adding `:focus-visible` to interactive components (buttons, inputs) makes keyboard navigation noticeably more intuitive without adding an outline to mouse interactions.
**Action:** Always check if `:focus-visible` styling is missing when encountering standard form/interactive elements and add a clear indicator.

## 2026-09-08 - Missing ARIA Labels on Presentation Controls
**Learning:** Found a pattern of missing ARIA labels specifically on presentation mode controls (Cycle Theme, Toggle Metronome, Toggle Auto-Scroll) and one editor copy button. Even if a `title` attribute is present, `aria-label` is required for icon-only buttons for consistent accessibility across screen readers.
**Action:** When adding new controls or standalone icon buttons, explicitly verify that `aria-label` attributes are included, even if the element has a `title`.
