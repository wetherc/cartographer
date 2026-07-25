/**
 * The two browser file-IO primitives the storage modules share: trigger a
 * download of a JSON string and read an uploaded File back to text. Thin DOM
 * wrappers (Blob, object URLs, FileReader) verified in the browser rather than
 * unit tested — and the one seam the planned Tauri storage adapter replaces
 * with native dialogs.
 */

/**
 * Trigger a browser download of an already-serialized JSON string.
 * @param {string} json
 * @param {string} filename
 */
export function downloadJSON(json, filename) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
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
