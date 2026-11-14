# Window drag regression evidence for Paradev #9178

Before: original source baseline 1b71f07a8, captured during reproduction.
After: PR commit 2ece588469f4ccffc3ea5648881db4218244663e, rebased on upstream main d0c6bbfa5.

These are screenshots from the real local Electron app, captured through CDP.
They show overflowing tabs, collapsed sidebar, and a single tab. Still images
document the layout; actual window dragging was confirmed manually by the contributor.

The native drag-region diagnostic reduced the renderer's region list from
316 regions (5 drag, 311 no-drag) to 29 (5 drag, 24 no-drag) after the root
style and tab-track exclusion were corrected. This diagnostic was recorded
before rebasing; fresh screenshots and layout checks were then repeated.

The screenshots are hosted separately so the code PR contains only three source files.
