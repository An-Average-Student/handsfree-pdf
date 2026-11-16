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

    // Sliders
    const slider = (title, key, min, max, note) => {
      const box = document.createElement('fieldset');
      const lg = document.createElement('legend');
      lg.textContent = title;
      const input = document.createElement('input');
      input.type = 'range'; input.min = String(min); input.max = String(max); input.step = '0.1';
      input.value = settings[key];
      input.dataset.key = key;
      const val = document.createElement('span');
      val.textContent = ` ${Number(settings[key]).toFixed(1)}×`;
      input.oninput = () => {
        settings[key] = Number(input.value);
        val.textContent = ` ${settings[key].toFixed(1)}×`;
        onChange();
      };
      const small = document.createElement('small');
      small.textContent = note;
      box.append(lg, input, val, document.createElement('br'), small);
      body.append(box);
    };
    slider('Scroll speed', 'scrollSpeed', 0.5, 4, 'Higher = the PDF scrolls further for the same hand movement. Raise it for long PDFs.');
    slider('Sensitivity (zoom and everything else)', 'sensitivity', 0.5, 2, 'Higher = a small movement zooms more.');

    // On-screen feedback switch
    const fb = document.createElement('fieldset');
    fb.innerHTML = '<legend>Feedback</legend>';
    const fbRow = document.createElement('label');
    fbRow.className = 'choice';
    const fbInput = document.createElement('input');
    fbInput.type = 'checkbox';
    fbInput.checked = settings.feedback;
    fbInput.onchange = () => { settings.feedback = fbInput.checked; onChange(); };
    const fbText = document.createElement('span');
    fbText.innerHTML = '<strong>Show a message on the slide when a gesture fires</strong><br><small>For example "➡ Page 2 / 10". Handy for you and your audience; turn it off for a clean slide.</small>';
    fbRow.append(fbInput, fbText);
    fb.append(fbRow);
    body.append(fb);

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
