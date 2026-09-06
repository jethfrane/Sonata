## 2026-09-01 - Add keyboard focus styles
**Learning:** This app didn't have any specific keyboard navigation focus styling. Adding `:focus-visible` to interactive components (buttons, inputs) makes keyboard navigation noticeably more intuitive without adding an outline to mouse interactions.
**Action:** Always check if `:focus-visible` styling is missing when encountering standard form/interactive elements and add a clear indicator.

## 2024-05-19 - Fallback from title to aria-label for dynamically generated icons
**Learning:** Custom dynamic UI frameworks that decorate elements with icons (like `.decorateAll()`) sometimes overwrite original element contents with SVGs. If the original element relied on a `title` tooltip for screen readers and had no explicit `aria-label`, the decorator might fallback to generic strings like "Action" when constructing the new ARIA attributes.
**Action:** When working with dynamic icon injection, ensure the framework's accessibility logic reads `.getAttribute("title")` as a fallback before resorting to a generic default string to preserve tooltip-based accessibility.
