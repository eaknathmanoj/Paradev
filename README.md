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

## Before/after recording

`before-after.gif` is a 10-second stacked comparison of two real manual
screen recordings. The original before recording contributes seconds 10-20;
the after recording from November 13 at 5:38 PM contributes seconds 0-10.
Both are cropped to the header, resized and sampled at 15 fps, at original
playback speed. Only the label bars are added; window and cursor motion are
from the source recordings. An H.264 MP4 version is included.
