/**
 * The two browser file input and output primitives the storage modules
 * share: start a download of a JSON string, and read an uploaded File back
 * to text. These are thin DOM wrappers (Blob, object URLs, FileReader),
 * checked visually in the browser and not with unit tests. This is the one
 * place the planned Tauri storage adapter replaces with native dialogs.
 */

/** How long the object URL stays alive after the click, in milliseconds. */
const REVOKE_DELAY_MS = 1000;

/**
 * Start a browser download of a Blob under a filename. The code appends the
 * anchor to the document before the click, and removes it after. WebKit and
 * WebKitGTK, which the packaged desktop build runs on, ignore a click on a
 * detached anchor. The code revokes the object URL on a timeout, not
 * immediately, because an immediate revoke can cancel a download the browser
 * has only queued.
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
 * Start a browser download of an already-serialized JSON string.
 * @param {string} json
 * @param {string} filename
 */
export function downloadJSON(json, filename) {
  downloadBlob(new Blob([json], { type: 'application/json' }), filename);
}

/**
 * Read a File to its text content. The File can come, for example, from a
 * file input's change event.
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
