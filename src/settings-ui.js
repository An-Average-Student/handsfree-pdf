import { OPTIONS, DEFAULT_SETTINGS } from './settings.js';
import { CUSTOM_ACTIONS, CUSTOM_LIMITS } from './custom-gestures.js';

/**
 * Builds the ⚙ Gestures panel from the OPTIONS list.
 * `settings` is a plain object that we edit in place; the gesture controller reads
 * the same object every frame, so changes apply instantly.
 */
export function initSettingsUI({ settings, onChange, custom }) {
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
      if (action === 'pointer' && settings.pointer === 'point' && settings.page === 'point-swipe') {
        const warn = document.createElement('small');
        warn.className = 'warn';
        warn.textContent = '⚠ Not available right now: "Change page" is using the index-finger swipe, which is the same pose.';
        group.append(warn);
      }
      body.append(group);
    }

    // My gestures (user-recorded poses)
    if (custom) body.append(customSection());

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
    slider('Pointer speed', 'pointerGain', 1, 3, 'Higher = small hand movements move the dot further. Lower = steadier, but you reach further.');
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

  // "My gestures": list, add (name + action + record) and remove. All text is set with textContent.
  function customSection() {
    const box = document.createElement('fieldset');
    box.id = 'custom-section';
    const lg = document.createElement('legend');
    lg.textContent = 'My gestures';
    box.append(lg);

    const intro = document.createElement('small');
    intro.textContent = 'Record your own hand pose and choose what it does. It triggers when you hold it for about half a second.';
    box.append(intro);

    const saved = custom.list();
    for (const g of saved) {
      const row = document.createElement('div');
      row.className = 'custom-row';
      const name = document.createElement('span');
      name.className = 'custom-name';
      name.textContent = `\u2B50 ${g.name}`;
      const act = document.createElement('small');
      act.textContent = CUSTOM_ACTIONS.find((a) => a.id === g.action)?.label ?? g.action;
      const del = document.createElement('button');
      del.className = 'btn';
      del.textContent = 'Remove';
      del.setAttribute('aria-label', `Remove ${g.name}`);
      del.onclick = () => { custom.remove(g.id); render(); };
      row.append(name, act, del);
      box.append(row);
    }

    if (saved.length >= CUSTOM_LIMITS.maxGestures) {
      const full = document.createElement('small');
      full.textContent = `You can save up to ${CUSTOM_LIMITS.maxGestures} gestures.`;
      box.append(full);
      return box;
    }

    const add = document.createElement('button');
    add.className = 'btn add-gesture';
    add.textContent = '+ Add a gesture';
    const form = document.createElement('div');
    form.className = 'custom-form';
    form.hidden = true;

    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Name';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.maxLength = CUSTOM_LIMITS.nameMax;
    nameInput.placeholder = `My gesture ${saved.length + 1}`;
    nameLabel.append(nameInput);

    const actLabel = document.createElement('label');
    actLabel.textContent = 'What it does';
    const actSelect = document.createElement('select');
    for (const a of CUSTOM_ACTIONS) {
      const o = document.createElement('option');
      o.value = a.id;
      o.textContent = a.label;
      actSelect.append(o);
    }
    actLabel.append(actSelect);

    const hint = document.createElement('small');
    hint.textContent = custom.cameraOn()
      ? 'Press Record, then hold your pose still when asked. Avoid poses the app already uses (open palm, fist, peace sign...).'
      : '\u26A0 Start the camera first (the Camera button), then come back here.';
    if (!custom.cameraOn()) hint.className = 'warn';

    const go = document.createElement('button');
    go.className = 'btn primary';
    go.textContent = 'Record';
    go.disabled = !custom.cameraOn();
    go.onclick = async () => {
      go.disabled = true;
      const name = nameInput.value.trim() || nameInput.placeholder;
      await custom.record({ name, action: actSelect.value });
      render();
    };
    const cancel = document.createElement('button');
    cancel.className = 'btn';
    cancel.textContent = 'Cancel';
    cancel.onclick = () => { form.hidden = true; add.hidden = false; };

    const buttons = document.createElement('div');
    buttons.className = 'custom-buttons';
    buttons.append(go, cancel);
    form.append(nameLabel, actLabel, hint, buttons);
    add.onclick = () => { form.hidden = false; add.hidden = true; nameInput.focus(); };
    box.append(add, form);
    return box;
  }

  const open = () => { render(); dialog.showModal(); };
  document.getElementById('settings-open').onclick = open;
  document.getElementById('settings-close').onclick = () => dialog.close();
  document.getElementById('settings-reset').onclick = () => {
    Object.assign(settings, DEFAULT_SETTINGS);
    onChange();
    render();
  };

  return { open, render };
}
