(function(){
  let campaigns = [];
  let posts = [];
  let snapshots = [];
  let selectedCampaignId = null;
  let dataReady = false;

  const $ = (id) => document.getElementById(id);
  const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
  const escapeHtml = (str) => String(str).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtNum = (n) => Number(n).toLocaleString('pt-BR');
  const fmtDate = (iso) => { if(!iso) return '—'; const d = new Date(iso + 'T00:00:00'); return d.toLocaleDateString('pt-BR'); };

  async function loadAll(){
    try {
      const cp = await window.storage.get('campaigns-posts', true);
      if (cp && cp.value) {
        const parsed = JSON.parse(cp.value);
        campaigns = parsed.campaigns || [];
        posts = parsed.posts || [];
      }
    } catch(e){ campaigns = []; posts = []; }

    try {
      const vs = await window.storage.get('view-snapshots', true);
      if (vs && vs.value) {
        const parsed = JSON.parse(vs.value);
        snapshots = parsed.snapshots || [];
      }
    } catch(e){ snapshots = []; }
  }

  async function saveCampaignsPosts(){
    try { await window.storage.set('campaigns-posts', JSON.stringify({campaigns, posts}), true); }
    catch(e){ console.error('Erro ao salvar campanhas/posts', e); }
  }
  async function saveSnapshots(){
    try { await window.storage.set('view-snapshots', JSON.stringify({snapshots}), true); }
    catch(e){ console.error('Erro ao salvar leituras', e); }
  }

  // ---------- Tabs ----------
  $('tabBtnCampaigns').addEventListener('click', () => switchTab('campaigns'));
  $('tabBtnViews').addEventListener('click', () => switchTab('views'));
  function switchTab(tab){
    const isCampaigns = tab === 'campaigns';
    $('tabBtnCampaigns').setAttribute('aria-selected', String(isCampaigns));
    $('tabBtnViews').setAttribute('aria-selected', String(!isCampaigns));
    $('viewCampaigns').classList.toggle('active', isCampaigns);
    $('viewViews').classList.toggle('active', !isCampaigns);
  }

  // ---------- Campaigns ----------
  $('formCampaign').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('inputCampaignName').value.trim();
    const tag = $('inputCampaignTag').value.trim();
    if(!name || !tag){ $('errorCampaign').style.display='block'; return; }
    $('errorCampaign').style.display='none';
    campaigns.push({ id: genId(), name, hashtag: tag, createdAt: Date.now() });
    $('formCampaign').reset();
    await saveCampaignsPosts();
    renderCampaignList();
  });

  function renderCampaignList(){
    const wrap = $('campaignList');
    if(campaigns.length === 0){
      wrap.innerHTML = '<div class="empty-state">Nenhuma campanha ainda. Crie a primeira ao lado.</div>';
      return;
    }
    wrap.innerHTML = campaigns.map(c => {
      const count = posts.filter(p => p.campaignId === c.id).length;
      const sel = c.id === selectedCampaignId ? 'selected' : '';
      return `<div class="campaign-card ${sel}" data-id="${c.id}">
        <div class="name">${escapeHtml(c.name)}</div>
        <div class="tag">${escapeHtml(c.hashtag)}</div>
        <div class="count">${count} post${count===1?'':'s'} registrado${count===1?'':'s'}</div>
      </div>`;
    }).join('');
    wrap.querySelectorAll('.campaign-card').forEach(card => {
      card.addEventListener('click', () => { selectedCampaignId = card.dataset.id; renderCampaignList(); renderCampaignDetail(); });
    });
  }

  function renderCampaignDetail(){
    const detailWrap = $('campaignDetailWrap');
    if(!selectedCampaignId){ detailWrap.style.display = 'none'; return; }
    const campaign = campaigns.find(c => c.id === selectedCampaignId);
    if(!campaign){ detailWrap.style.display = 'none'; return; }
    detailWrap.style.display = 'block';
    $('detailTitle').textContent = campaign.name;
    $('detailHint').textContent = `Posts marcados com ${campaign.hashtag}`;

    const campaignPosts = posts.filter(p => p.campaignId === selectedCampaignId)
      .sort((a,b) => new Date(b.date) - new Date(a.date));

    const tbody = $('postsTableBody');
    if(campaignPosts.length === 0){
      tbody.innerHTML = '';
      $('postsEmpty').style.display = 'block';
    } else {
      $('postsEmpty').style.display = 'none';
      tbody.innerHTML = campaignPosts.map(p => `
        <tr data-id="${p.id}">
          <td>${escapeHtml(p.influencer)}</td>
          <td class="num">${fmtDate(p.date)}</td>
          <td>${p.link ? `<a class="post-link" href="${escapeHtml(p.link)}" target="_blank" rel="noopener">ver post</a>` : '—'}</td>
          <td><button class="btn btn-small btn-ghost confirm-btn" data-action="remove-post">Remover</button></td>
        </tr>`).join('');
    }

    // summary chips per influencer
    const byInfluencer = {};
    campaignPosts.forEach(p => { byInfluencer[p.influencer] = (byInfluencer[p.influencer]||0) + 1; });
    const chips = Object.entries(byInfluencer).map(([name,count]) => `<span class="summary-chip">${escapeHtml(name)} · ${count}</span>`);
    $('summaryRow').innerHTML = chips.length
      ? `<span class="summary-chip" style="background:var(--signal-soft); color:#a8123a;">Total · ${campaignPosts.length} post${campaignPosts.length===1?'':'s'}</span>` + chips.join('')
      : '';

    attachRemovePostHandlers();
  }

  function attachRemovePostHandlers(){
    document.querySelectorAll('[data-action="remove-post"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const row = e.target.closest('tr');
        if(btn.dataset.armed !== 'true'){
          btn.dataset.armed = 'true';
          btn.textContent = 'Confirmar?';
          setTimeout(() => { btn.dataset.armed='false'; btn.textContent='Remover'; }, 3000);
          return;
        }
        const id = row.dataset.id;
        posts = posts.filter(p => p.id !== id);
        await saveCampaignsPosts();
        renderCampaignList();
        renderCampaignDetail();
      });
    });
  }

  $('formPost').addEventListener('submit', async (e) => {
    e.preventDefault();
    const influencer = $('inputInfluencer').value.trim();
    const date = $('inputPostDate').value;
    const link = $('inputPostLink').value.trim();
    if(!influencer || !date){ $('errorPost').style.display='block'; return; }
    $('errorPost').style.display='none';
    posts.push({ id: genId(), campaignId: selectedCampaignId, influencer, date, link, createdAt: Date.now() });
    $('formPost').reset();
    await saveCampaignsPosts();
    renderCampaignList();
    renderCampaignDetail();
  });

  // ---------- Views / snapshots ----------
  $('formSnapshot').addEventListener('submit', async (e) => {
    e.preventDefault();
    const date = $('inputSnapshotDate').value;
    const views = $('inputSnapshotViews').value;
    const note = $('inputSnapshotNote').value.trim();
    if(!date || views === ''){ $('errorSnapshot').style.display='block'; return; }
    $('errorSnapshot').style.display='none';
    snapshots.push({ id: genId(), date, views: Number(views), note, createdAt: Date.now() });
    $('formSnapshot').reset();
    await saveSnapshots();
    renderViews();
  });

  function attachRemoveSnapshotHandlers(){
    document.querySelectorAll('[data-action="remove-snapshot"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const row = e.target.closest('tr');
        if(btn.dataset.armed !== 'true'){
          btn.dataset.armed = 'true';
          btn.textContent = 'Confirmar?';
          setTimeout(() => { btn.dataset.armed='false'; btn.textContent='Remover'; }, 3000);
          return;
        }
        const id = row.dataset.id;
        snapshots = snapshots.filter(s => s.id !== id);
        await saveSnapshots();
        renderViews();
      });
    });
  }

  function renderViews(){
    const sorted = [...snapshots].sort((a,b) => new Date(a.date) - new Date(b.date));

    // stat cards
    if(sorted.length === 0){
      $('latestViewsValue').textContent = '—';
      $('latestViewsDelta').textContent = '';
      $('totalGrowthValue').textContent = '—';
      $('totalGrowthSub').textContent = '';
    } else {
      const last = sorted[sorted.length-1];
      const prev = sorted.length > 1 ? sorted[sorted.length-2] : null;
      $('latestViewsValue').textContent = fmtNum(last.views);
      if(prev){
        const diff = last.views - prev.views;
        const el = $('latestViewsDelta');
        el.className = 'delta ' + (diff >= 0 ? 'up' : 'down');
        el.textContent = (diff >= 0 ? '+' : '') + fmtNum(diff) + ' desde a leitura anterior';
      } else {
        $('latestViewsDelta').textContent = 'primeira leitura registrada';
      }

      const first = sorted[0];
      const growth = last.views - first.views;
      $('totalGrowthValue').textContent = (growth >= 0 ? '+' : '') + fmtNum(growth);
      $('totalGrowthSub').textContent = `desde ${fmtDate(first.date)}`;
    }

    // sparkline
    const sparkWrap = $('sparklineWrap');
    if(sorted.length < 2){
      sparkWrap.innerHTML = '<div class="empty-state">Registre ao menos duas leituras para ver o gráfico.</div>';
    } else {
      const w = 600, h = 90, pad = 10;
      const vals = sorted.map(s => s.views);
      const min = Math.min(...vals), max = Math.max(...vals);
      const range = (max - min) || 1;
      const stepX = (w - pad*2) / (sorted.length - 1);
      const points = sorted.map((s,i) => {
        const x = pad + i*stepX;
        const y = h - pad - ((s.views - min) / range) * (h - pad*2);
        return [x,y];
      });
      const linePath = points.map((p,i) => (i===0?'M':'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
      const areaPath = linePath + ` L${points[points.length-1][0].toFixed(1)},${h-pad} L${points[0][0].toFixed(1)},${h-pad} Z`;
      const dots = points.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="#0EA59E" />`).join('');
      sparkWrap.innerHTML = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
        <path d="${areaPath}" fill="#DCF4F2" stroke="none" />
        <path d="${linePath}" fill="none" stroke="#0EA59E" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
        ${dots}
      </svg>`;
    }

    // history table
    const tbody = $('snapshotsTableBody');
    const descending = [...sorted].reverse();
    if(descending.length === 0){
      tbody.innerHTML = '';
      $('snapshotsEmpty').style.display = 'block';
    } else {
      $('snapshotsEmpty').style.display = 'none';
      tbody.innerHTML = descending.map((s, idx) => {
        const posInSorted = sorted.findIndex(x => x.id === s.id);
        const prevItem = posInSorted > 0 ? sorted[posInSorted-1] : null;
        let deltaHtml = '—';
        if(prevItem){
          const diff = s.views - prevItem.views;
          const cls = diff >= 0 ? 'up' : 'down';
          deltaHtml = `<span class="delta ${cls}">${diff>=0?'+':''}${fmtNum(diff)}</span>`;
        }
        return `<tr data-id="${s.id}">
          <td class="num">${fmtDate(s.date)}</td>
          <td class="num">${fmtNum(s.views)}</td>
          <td class="num">${deltaHtml}</td>
          <td>${s.note ? escapeHtml(s.note) : '—'}</td>
          <td><button class="btn btn-small btn-ghost confirm-btn" data-action="remove-snapshot">Remover</button></td>
        </tr>`;
      }).join('');
    }
    attachRemoveSnapshotHandlers();
  }

  // ---------- Init ----------
  async function init(){
    await loadAll();
    $('loadingState').style.display = 'none';
    dataReady = true;
    renderCampaignList();
    renderCampaignDetail();
    renderViews();
  }
  init();
})();
