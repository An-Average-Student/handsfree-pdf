import { OPTIONS, DEFAULT_SETTINGS } from './settings.js';

/**
 * Builds the ⚙ Gestures panel from the OPTIONS list.
 * `settings` is a plain object that we edit in place; the gesture controller reads
 * the same object every frame, so changes apply instantly.
 */
export function initSettingsUI({ settings, onChange }) {
  const dialog = document.getElementById('settings');
  const body = document.getElementById('settings-body');

  function render() {
    body.replaceChildren();

    for (const [action, { label, choices }] of Object.entries(OPTIONS)) {
      const group = document.createElement('fieldset');
      const legend = document.createElement('legend');
      legend.textContent = label;
      group.append(legend);

      for (const c of choices) {
        const row = document.createElement('label');
        row.className = 'choice';
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = action;
        input.value = c.id;
        input.checked = settings[action] === c.id;
        input.onchange = () => { settings[action] = c.id; onChange(); render(); };
        const text = document.createElement('span');
        const title = document.createElement('strong');
        title.textContent = `${c.icon} ${c.title}`;
        const hint = document.createElement('small');
        hint.textContent = c.hint;
        text.append(title, document.createElement('br'), hint);
        row.append(input, text);
        group.append(row);
      }
      body.append(group);
    }

    // Sensitivity
    const sens = document.createElement('fieldset');
    sens.innerHTML = '<legend>Sensitivity</legend>';
    const slider = document.createElement('input');
    slider.type = 'range'; slider.min = '0.5'; slider.max = '2'; slider.step = '0.1';
    slider.value = settings.sensitivity;
    const val = document.createElement('span');
    val.textContent = ` ${Number(settings.sensitivity).toFixed(1)}×`;
    slider.oninput = () => {
      settings.sensitivity = Number(slider.value);
      val.textContent = ` ${settings.sensitivity.toFixed(1)}×`;
      onChange();
    };
    const note = document.createElement('small');
    note.textContent = 'Higher = a small movement scrolls / zooms more.';
    sens.append(slider, val, document.createElement('br'), note);
    body.append(sens);

    // Live cheat sheet
    const sheet = document.createElement('fieldset');
    sheet.id = 'cheatsheet';
    sheet.innerHTML = '<legend>Your cheat sheet</legend>';
    const ul = document.createElement('ul');
    const li = (t) => { const e = document.createElement('li'); e.textContent = t; ul.append(e); };
    li('✌️ Hold a peace sign for 1 second: turn gestures ON / OFF');
    li('✊ Fist: rest (nothing happens)');
    for (const [action, { label, choices }] of Object.entries(OPTIONS)) {
      const c = choices.find((x) => x.id === settings[action]);
      if (c.id !== 'off') li(`${label}: ${c.icon} ${c.title}`);
    }
    sheet.append(ul);
    body.append(sheet);
  }

  document.getElementById('settings-open').onclick = () => { render(); dialog.showModal(); };
  document.getElementById('settings-close').onclick = () => dialog.close();
  document.getElementById('settings-reset').onclick = () => {
    Object.assign(settings, DEFAULT_SETTINGS);
    onChange();
    render();
  };
}
