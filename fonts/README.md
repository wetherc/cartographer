# Bundled fonts

The app ships three typefaces so it renders the same offline, in the browser,
and in a packaged desktop build. All are licensed under the SIL Open Font
License 1.1; the license texts sit beside the files.

- **IM Fell English** (`fell-*.woff2`): the display face. Digitizations by
  Igino Marini of the seventeenth-century Fell types. Used only for the
  wordmark. Below about 24 pixels on a low-density screen, its period
  letterforms blur, so it appears nowhere smaller.
- **Alegreya SC** (`alegreya-sc-*.woff2`): the titling face, by Juan Pablo
  del Peral. True small capitals from the same family as the body face.
  Carries panel titles, modal titles, and the names of people and places.
  It is designed for screen sizes, so it stays sharp where IM Fell smears.
- **Alegreya Sans** (`alegreya-*.woff2`): the body face, by the same
  designer. Carries every label, row, and control.

The files are the latin subsets of the Google Fonts builds. The `@font-face`
rules live at the top of `styles/base.css`, and every other file reaches the
faces through the `--font-display`, `--font-title`, and `--font-sans` tokens.
