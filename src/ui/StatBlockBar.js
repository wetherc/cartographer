import { promptModal } from './Modal.js';
import { icon } from './icons.js';

/**
 * A row of stat-block chips ("AC 13", "Speed 30") with an add control, shown
 * on GM encounter rows. Mirrors the conditions bar: it reads the current block
 * via `getStatBlock`, opens its own add dialog (a stat name and a numeric
 * value — adding an existing name overwrites its value), and reports the whole
 * new record through `onChange`, so the owner only has to persist it.
 * @param {HTMLElement} container
 * @param {{
 *   getStatBlock: () => Record<string, number>,
 *   onChange: (next: Record<string, number>) => void,
 * }} callbacks
 * @returns {{ update: () => void }}
 */
export function mountStatBlockBar(container, callbacks) {
  const root = document.createElement('div');
  root.className = 'statblock-bar';
  container.appendChild(root);

  /** @param {string} name @param {number} value */
  function buildChip(name, value) {
    const chip = document.createElement('span');
    chip.className = 'statblock-bar__chip';
    const text = document.createElement('span');
    text.textContent = `${name} ${value}`;
    chip.appendChild(text);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'statblock-bar__remove';
    remove.setAttribute('aria-label', `Remove ${name}`);
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      const next = { ...callbacks.getStatBlock() };
      delete next[name];
      callbacks.onChange(next);
      render();
    });
    chip.appendChild(remove);
    return chip;
  }

  async function add() {
    const values = await promptModal(
      'Add stat',
      [
        { name: 'name', label: 'Stat (e.g. AC, Speed)', value: '' },
        { name: 'value', label: 'Value', type: 'number', value: 10 },
      ],
      { submitLabel: 'Add' },
    );
    const name = values?.name.trim();
    if (!values || !name) return;
    callbacks.onChange({ ...callbacks.getStatBlock(), [name]: Number(values.value) || 0 });
    render();
  }

  function render() {
    root.innerHTML = '';
    for (const [name, value] of Object.entries(callbacks.getStatBlock())) {
      root.appendChild(buildChip(name, value));
    }
    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'btn btn--icon statblock-bar__add';
    addButton.setAttribute('aria-label', 'Add stat');
    addButton.appendChild(icon('add'));
    addButton.addEventListener('click', add);
    root.appendChild(addButton);
  }

  render();
  return { update: render };
}
