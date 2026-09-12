## 2026-09-01 - Add keyboard focus styles
**Learning:** This app didn't have any specific keyboard navigation focus styling. Adding `:focus-visible` to interactive components (buttons, inputs) makes keyboard navigation noticeably more intuitive without adding an outline to mouse interactions.
**Action:** Always check if `:focus-visible` styling is missing when encountering standard form/interactive elements and add a clear indicator.

## 2024-05-18 - Add ARIA labels to inputs
**Learning:** Screen readers require context for form fields to be accessible. Adding `aria-label` attributes to dynamic inputs and textareas (like the AI Chat prompt or the Metronome BPM numeric input) ensures they are properly announced, as they lacked visible `<label>` associations.
**Action:** Always check form elements, especially textareas and numeric inputs, and ensure they either have a clear linked `<label>` or an `aria-label` attribute if the visual label is implicitly understood or provided by placeholder text.
