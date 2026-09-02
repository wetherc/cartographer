/**
 * Which image references the app is willing to load.
 *
 * A campaign file is shared between GMs, and an image ref inside it goes
 * straight into an `<img>` `src` or an `Image` for the map canvas. A ref
 * such as `//host/pixel.png` would make the browser fetch from another
 * host, which tells that host the GM's address and when the campaign is
 * open. The page's Content Security Policy already blocks the fetch, but
 * this module keeps the check inside the app, where a policy change cannot
 * remove it. Three forms are accepted:
 *
 *   - an inline image payload, `data:image/...`;
 *   - an `asset:` key into the payload table (`Assets.js`), in the alphabet
 *     `referencedAssetKeys` matches;
 *   - a relative path on this origin, which is where the shipped tile art
 *     (`assets/tiles/...`) lives. A relative path cannot name another host.
 *     It may not start with a slash, hold a `..` or `.` segment or an empty
 *     segment (`//`), or use anything beyond the plain path characters the
 *     shipped files use. A scheme such as `https:` or `javascript:` fails
 *     that character rule at the colon.
 *
 * Anything else is rejected, and the callers store or draw a blank ref in
 * its place. The module is pure.
 */

/**
 * A relative path: one or more segments of plain characters, joined by
 * single slashes, none of which is `.` or `..`. The lookahead rejects a
 * dot segment anywhere before the character rule runs.
 */
const RELATIVE_PATH = /^(?!(?:.*\/)?\.\.?(?:\/|$))[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;

/** An `asset:` key, in the alphabet `referencedAssetKeys` matches. */
const ASSET_KEY = /^asset:[0-9a-z]+(?:~[0-9]+)?$/;

/**
 * Verdicts for refs seen before. A save repeats a few dozen distinct refs
 * across tens of thousands of tiles, so the load path asks about the same
 * strings over and over. The map is cleared when it grows past a bound, so
 * a save full of distinct inline payloads cannot pin them all here.
 * @type {Map<string, boolean>}
 */
const verdicts = new Map();
const VERDICT_LIMIT = 512;

/**
 * @param {string} ref
 * @returns {boolean}
 */
function check(ref) {
  if (ref.startsWith('data:image/')) return true;
  if (ref.startsWith('asset:')) return ASSET_KEY.test(ref);
  return RELATIVE_PATH.test(ref);
}

/**
 * True when `ref` is an image reference the app will load.
 * @param {unknown} ref
 * @returns {boolean}
 */
export function isSafeImageRef(ref) {
  if (typeof ref !== 'string' || ref === '') return false;
  const known = verdicts.get(ref);
  if (known !== undefined) return known;
  const verdict = check(ref);
  if (verdicts.size >= VERDICT_LIMIT) verdicts.clear();
  verdicts.set(ref, verdict);
  return verdict;
}

/**
 * The ref itself when it is safe to load, otherwise the empty string, which
 * every image site already treats as "no image".
 * @param {string} ref
 * @returns {string}
 */
export function safeImageRef(ref) {
  return isSafeImageRef(ref) ? ref : '';
}
