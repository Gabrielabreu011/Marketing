let data = JSON.parse(localStorage.getItem('influ_tracker') || '{"config":{"handle":"","tags":[]},"posts":[]}');

function save() {
  localStorage.setItem('influ_tracker', JSON.stringify(data));
}

function saveConfig() {
  data.config.handle = document.getElementById('brand-handle').value.trim().replace(/^@/, '');
  save();
  refreshHashtagSelect();
  alert('Configuração salva!');
}

// Tags input
let tags = data.config.tags || [];
const tagInput = document.getElementById('tag-input-inner');

tagInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const val = tagInput.value.trim().replace(/^#/, '');
    if (val && !tags.includes(val)) {
      tags.push(val);
      data.config.tags = tags;
      save();
      renderTags();
      refreshHashtagSelect();
    }
    tagInput.value = '';
  }
  if (e.key === 'Backspace' && tagInput.value === '' && tags.length) {
    tags.pop();
    data.config.tags = tags;
    save();
    renderTags();
    refreshHashtagSelect();
  }
});

function renderTags() {
  const c = document.getElementById('tags-container');
  c.querySelectorAll('.tag').forEach(t => t.remove());
  tags.forEach((t, i) => {
    const el = document.createElement('div');
    el.className = 'tag';
    el.innerHTML = `#${t} <span class="tag-remove" data-i="${i}">×</span>`;
    c.insertBefore(el, tagInput);
  });
  c.querySelectorAll('.tag-remove').forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      tags.splice(+btn.dataset.i, 1);
      data.config.tags = tags;
      save();
      renderTags();
      refreshHashtagSelect();
    };
  });
}

function refreshHashtagSelect() {
  const sel = document.getElementById('post-hashtag');
  sel.innerHTML = '<option value="">— selecione —</option>';
  (data.config.tags || []).forEach(t => {
    const o = document.createElement('option');
    o.value = t;
    o.textContent = '#' + t;
    sel.appendChild(o);
  });
}

document.getElementById('post-type').addEventListener('change', e => {
  document.getElementById('hashtag-select-wrap').style.display =
    e.target.value === 'mention' ? 'none' : 'block';
});

function addPost() {
  const handle = document.getElementById('influ-handle').value.trim().replace(/^@/, '');
  const type = document.getElementById('post-type').value;
  const hashtag = document.getElementById('post-hashtag').value;
  const date = document.getElementById('post-date').value;
  const url = document.getElementById('post-url').value.trim();
  const note = document.getElementById('post-note').value.trim();

  if (!handle) { alert('Informe o @ do influencer.'); return; }
  if ((type === 'hashtag' || type === 'both') && !hashtag) { alert('Selecione a hashtag.'); return; }
  if (!date) { alert('Informe a data.'); return; }

  data.posts.push({ id: Date.now(), handle, type, hashtag, date, url, note });
  save();
  document.getElementById('influ-handle').value = '';
  document.getElementById('post-url').value = '';
  document.getElementById('post-note').value = '';
  document.getElementById('post-date').value = '';
  render();
}

function deletePost(id) {
  if (!confirm('Remover este post?')) return;
  data.posts = data.posts.filter(p => p.id !== id);
  save();
  render();
}

const openPosts = {};
function togglePosts(handle) {
  openPosts[handle] = !openPosts[handle];
  render();
}

function render() {
  const search = (document.getElementById('search').value || '').toLowerCase();
  const grouped = {};
  data.posts.forEach(p => {
    if (!grouped[p.handle]) grouped[p.handle] = { posts: [] };
    grouped[p.handle].posts.push(p);
  });

  const entries = Object.entries(grouped)
    .filter(([h]) => !search || h.toLowerCase().includes(search))
    .sort((a, b) => b[1].posts.length - a[1].posts.length);

  document.getElementById('s-total').textContent = data.posts.length;
  document.getElementById('s-influ').textContent = Object.keys(grouped).length;
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  document.getElementById('s-today').textContent = data.posts.filter(p => p.date && p.date.startsWith(ym)).length;
  document.getElementById('filter-count').textContent = entries.length + ' influencer' + (entries.length !== 1 ? 's' : '');

  const list = document.getElementById('influ-list');
  if (!entries.length) {
    list.innerHTML = `<div class="empty"><div class="empty-icon">📭</div><p>Nenhum post registrado ainda.</p><p style="font-size:12px;margin-top:6px">Adicione o primeiro post pelo painel ao lado.</p></div>`;
    return;
  }

  list.innerHTML = '';
  entries.forEach(([handle, { posts }]) => {
    const mentions = posts.filter(p => p.type === 'mention' || p.type === 'both').length;
    const hashMap = {};
    posts.forEach(p => { if (p.hashtag) hashMap[p.hashtag] = (hashMap[p.hashtag] || 0) + 1; });
    const initials = handle.slice(0, 2).toUpperCase();
    const card = document.createElement('div');
    card.className = 'influ-card flash';
    const showPosts = openPosts[handle];

    let postRows = '';
    if (showPosts) {
      const sorted = [...posts].sort((a, b) => b.date.localeCompare(a.date));
      postRows = `<div class="post-list">${sorted.map(p => `
        <div class="post-item">
          <span class="post-type pill ${p.type === 'mention' ? 'pill-mention' : p.type === 'hashtag' ? 'pill-hash' : 'pill-count'}">
            ${p.type === 'mention' ? '@' : p.type === 'hashtag' ? '#' : '@+#'}
            ${p.type !== 'mention' && p.hashtag ? p.hashtag : ''}
          </span>
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--muted)">${p.note || '—'}</span>
          ${p.url ? `<a class="post-link" href="${p.url}" target="_blank">Ver post ↗</a>` : ''}
          <span class="post-date">${p.date}</span>
          <button class="btn-danger-sm" onclick="deletePost(${p.id})">✕</button>
        </div>`).join('')}
      </div>`;
    }

    card.innerHTML = `
      <div class="influ-header">
        <div class="influ-name">
          <div class="avatar">${initials}</div>
          @${handle}
        </div>
        <div class="influ-count">${posts.length} post${posts.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="influ-pills">
        ${mentions ? `<span class="pill pill-mention">@ ${mentions} menção${mentions !== 1 ? 's' : ''}</span>` : ''}
        ${Object.entries(hashMap).map(([h, c]) => `<span class="pill pill-hash">#${h} × ${c}</span>`).join('')}
      </div>
      ${postRows}
      <button class="toggle-posts" onclick="togglePosts('${handle}')" style="margin-top:10px">
        ${showPosts ? '▲ Ocultar' : '▼ Ver todos os posts'}
      </button>`;
    list.appendChild(card);
  });
}

// Init
document.getElementById('brand-handle').value = data.config.handle || '';
tags = data.config.tags || [];
renderTags();
refreshHashtagSelect();
document.getElementById('post-date').value = new Date().toISOString().slice(0, 10);
document.getElementById('hashtag-select-wrap').style.display = 'none';
render();
