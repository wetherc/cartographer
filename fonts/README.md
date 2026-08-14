# Bundled fonts

The app ships two typefaces so it renders the same offline, in the browser,
and in a packaged desktop build. Both are licensed under the SIL Open Font
License 1.1; the license texts sit beside the files.

- **IM Fell English** (`fell-*.woff2`): the display face. Digitizations by
  Igino Marini of the seventeenth-century Fell types. Used only for the
  wordmark, panel titles, and the names of people and places.
- **Alegreya Sans** (`alegreya-*.woff2`): the body face, by Juan Pablo del
  Peral. Carries every label, row, and control.

The files are the latin subsets of the Google Fonts builds. The `@font-face`
rules live at the top of `styles/base.css`, and every other file reaches the
faces through the `--font-display` and `--font-sans` tokens.
