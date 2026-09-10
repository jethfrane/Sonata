1. **Find Missing ARIA Labels on icon-only buttons**: I will add descriptive `aria-label`s to all buttons in `index.html` that have `title=` but are missing `aria-label`. Specifically:
   - `<button class="button icon-button ghost" id="copyLiveChartBtn" ... title="Copy Formatted Chart">` -> `aria-label="Copy Formatted Chart"`
   - `<button class="icon-button" id="presThemeToggle" ... title="Cycle Theme">` -> `aria-label="Cycle Theme"`
   - `<button class="icon-button" id="presMetronomeToggle" ... title="Toggle Metronome">` -> `aria-label="Toggle Metronome"`
   - `<button class="icon-button" id="presScrollToggle" ... title="Auto-Scroll">` -> `aria-label="Auto-Scroll"`
2. **Find `help-icon` buttons**: I will add `aria-label`s to the `help-icon` buttons to make them accessible to screen readers, taking context from their `data-help` attribute or adjacent heading.
3. **Pre Commit Steps**: Ensure I follow the `pre_commit_instructions` before submitting.
