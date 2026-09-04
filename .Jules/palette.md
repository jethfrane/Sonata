## 2024-05-20 - Missing ARIA Labels on Icon-Only Buttons and Selects
**Learning:** Found an accessibility issue pattern specific to this app's components where `<button class="help-icon">` buttons and some `<select>` elements (like `#instrumentKeyRoot`, `#instrumentKeyMode`, and `#fretboardTuning`) lacked proper `aria-label` attributes, making them inaccessible to screen readers.
**Action:** Always verify that interactive elements, especially icon-only buttons and form controls without visible programmatic labels, have explicit `aria-label` attributes for proper screen reader support.
