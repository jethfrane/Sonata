## 2026-09-01 - Add keyboard focus styles
**Learning:** This app didn't have any specific keyboard navigation focus styling. Adding `:focus-visible` to interactive components (buttons, inputs) makes keyboard navigation noticeably more intuitive without adding an outline to mouse interactions.
**Action:** Always check if `:focus-visible` styling is missing when encountering standard form/interactive elements and add a clear indicator.

## 2024-05-18 - Actionable CTAs in Empty States
**Learning:** Purely informational empty states (e.g. "Library is empty", "No Setlists found", or "No matching songs") leave users hanging, requiring them to search the UI to figure out how to add content or clear a search filter.
**Action:** Always include actionable Call-to-Action (CTA) buttons in empty states (e.g. "Create New Song", "Create Setlist", "Clear Search") to guide users seamlessly to the next logical action.
