'use strict';

// "News topics" window. Plain text only; the main process re-checks everything on save.

(() => {
  const api = window.newsSettings;
  const MAX_INTERESTS = 20;
  const extrasBox = document.getElementById('extras');
  const list = document.getElementById('interests');
  const input = document.getElementById('interest');
  const error = document.getElementById('error');
  let interests = [];

  const clean = (text) => text.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);

  function renderInterests() {
    list.replaceChildren(...interests.map((text) => {
      const item = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = text;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Remove ${text}`);
      remove.addEventListener('click', () => {
        interests = interests.filter((t) => t !== text);
        renderInterests();
      });
      item.append(label, remove);
      return item;
    }));
  }

  function renderExtras(extras) {
    extrasBox.replaceChildren(...extras.map((extra) => {
      const label = document.createElement('label');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.value = extra.key;
      box.checked = extra.on === true;
      label.append(box, document.createTextNode(extra.label));
      return label;
    }));
  }

  input.addEventListener('input', () => { error.textContent = ''; });

  document.getElementById('add').addEventListener('submit', (event) => {
    event.preventDefault();
    const text = clean(input.value);
    if (!text) { error.textContent = 'Type a word or name first.'; return; }
    if (interests.some((t) => t.toLowerCase() === text.toLowerCase())) { error.textContent = 'Already on the list.'; return; }
    if (interests.length >= MAX_INTERESTS) { error.textContent = `Up to ${MAX_INTERESTS} interests.`; return; }
    interests = [...interests, text];
    input.value = '';
    renderInterests();
  });

  document.getElementById('save').addEventListener('click', () => {
    const extras = [...extrasBox.querySelectorAll('input:checked')].map((box) => box.value);
    api.save({ extras, interests });
  });
  document.getElementById('cancel').addEventListener('click', () => api.close());
  document.getElementById('dismiss').addEventListener('click', () => api.close());
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') api.close(); });

  api.get().then((current) => {
    renderExtras(Array.isArray(current.extras) ? current.extras : []);
    interests = Array.isArray(current.interests) ? current.interests.map(String) : [];
    renderInterests();
    input.focus();
  });
})();
