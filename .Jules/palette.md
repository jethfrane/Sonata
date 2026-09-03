## 2026-09-01 - Add keyboard focus styles
**Learning:** This app didn't have any specific keyboard navigation focus styling. Adding `:focus-visible` to interactive components (buttons, inputs) makes keyboard navigation noticeably more intuitive without adding an outline to mouse interactions.
**Action:** Always check if `:focus-visible` styling is missing when encountering standard form/interactive elements and add a clear indicator.
## 2026-09-03 - Added ARIA labels to Icon Buttons
**Learning:** `Icon.decorateAll()` in `app.js` looks for inner text or `aria-label` attribute to set accessibility text. If an icon-only button only has a `title` attribute, `Icon.decorateAll()` assigns a generic `aria-label="Action"`, resulting in poor accessibility.
**Action:** When adding icon-only buttons with `data-icon` attributes, always explicitly add an `aria-label` that matches its `title` to ensure correct screen reader text is populated.
