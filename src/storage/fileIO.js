/**
 * The two browser file-IO primitives the storage modules share: trigger a
 * download of a JSON string and read an uploaded File back to text. Thin DOM
 * wrappers (Blob, object URLs, FileReader) verified in the browser rather than
 * unit tested — and the one seam the planned Tauri storage adapter replaces
 * with native dialogs.
 */

/** How long to leave the object URL alive after the click, in milliseconds. */
const REVOKE_DELAY_MS = 1000;

/**
 * Trigger a browser download of a Blob under a filename. The anchor is appended
 * to the document before the click and removed after: a detached anchor's click
 * is ignored outright by WebKit and WebKitGTK, which the packaged desktop build
 * runs on. The object URL is revoked on a timeout rather than immediately,
 * because revoking it in the same task can cancel a download the browser has
 * only queued.
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

/**
 * Trigger a browser download of an already-serialized JSON string.
 * @param {string} json
 * @param {string} filename
 */
export function downloadJSON(json, filename) {
  downloadBlob(new Blob([json], { type: 'application/json' }), filename);
}

/**
 * Read a File (e.g. from a file input's change event) to its text content.
 * @param {File} file
 * @returns {Promise<string>}
 */
export function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
