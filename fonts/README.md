---
---
# Bundled fonts

*Reference.*

The app ships its three typefaces in this directory, so it looks the same
with no network connection. All three use the SIL Open Font License 1.1,
and each license text is in an `OFL-*.txt` file beside the fonts.

| Typeface | Files | Designer | Token | Where the app uses it |
| --- | --- | --- | --- | --- |
| IM Fell English | `fell-regular.woff2`, `fell-italic.woff2` | Igino Marini, from the seventeenth-century Fell types | `--font-display` | The wordmark in the header only |
| Alegreya SC | `alegreya-sc-400.woff2`, `alegreya-sc-500.woff2` | Juan Pablo del Peral | `--font-title` | Panel titles, modal titles, and the names of characters and places |
| Alegreya Sans | `alegreya-400.woff2`, `alegreya-500.woff2`, `alegreya-700.woff2`, `alegreya-italic.woff2` | Juan Pablo del Peral | `--font-sans` | Every label, row, and control |

IM Fell English blurs below about 24 pixels on a low-density screen, so the
app uses it only for the wordmark, at 1.75rem. Alegreya SC has true small
capitals from the same family as the body face, and it stays sharp at
screen sizes.

The files are the Latin subsets of the Google Fonts builds. The
`@font-face` rules are at the top of `styles/base.css`. Every other
stylesheet uses the faces through the three tokens in the table.
