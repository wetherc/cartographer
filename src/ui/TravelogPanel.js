import { icon } from './icons.js';

/** @typedef {import('../types/log.js').LogEntry} LogEntry */

/** Format an entry's epoch-ms timestamp as a local HH:MM readout. */
function formatTime(at) {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Mount the travelogue panel: a newest-first list of auto-recorded events
 * (party movement, combat outcomes) with a Clear control. The panel owns no
 * state — `getEntries` supplies the rows and `onClear` empties the master list
 * kept by the caller, matching the other thin DOM-wrapper panels.
 * @param {HTMLElement} container
 * @param {{ getEntries: () => LogEntry[], onClear: () => Promise<boolean> | boolean }} callbacks
 * @returns {{ update: () => void }}
 */
export function mountTravelogPanel(container, callbacks) {
  const root = document.createElement('div');
  root.className = 'travelog';
  container.appendChild(root);

  function render() {
    root.innerHTML = '';
    // Newest first: entries are stored oldest-first, so reverse a copy.
    const entries = [...callbacks.getEntries()].reverse();

    if (entries.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No events logged yet.';
      root.appendChild(empty);
      return;
    }

    const list = document.createElement('ul');
    list.className = 'travelog__list';
    for (const entry of entries) {
      const item = document.createElement('li');
      item.className = `travelog__item travelog__item--${entry.kind}`;

      const time = document.createElement('time');
      time.className = 'travelog__time';
      time.dateTime = new Date(entry.at).toISOString();
      time.textContent = formatTime(entry.at);

      const message = document.createElement('span');
      message.className = 'travelog__message';
      message.textContent = entry.message;

      item.append(time, message);
      list.appendChild(item);
    }
    root.appendChild(list);

    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.className = 'btn travelog__clear';
    clearButton.append(icon('remove'), document.createTextNode('Clear log'));
    clearButton.addEventListener('click', async () => {
      if (await callbacks.onClear()) render();
    });
    root.appendChild(clearButton);
  }

  render();
  return { update: render };
}
