// ATENÇÃO: window.storage é uma API especial disponível apenas dentro de Artifacts do Claude.ai.
// Se você hospedar estes arquivos em outro lugar (GitHub Pages, Vercel, servidor próprio etc),
// as chamadas a window.storage vão falhar — você precisaria trocar por um backend próprio
// (ex: Firebase, Supabase, ou uma API simples com banco de dados) para guardar os dados.

(function(){
  const STATUS_STAGES = ['Convidado','Negociando','Confirmado','Postado'];
  const STATUS_COLORS = {
    'Convidado':  { bg: '#ECEFF2', fg: '#5B6472' },
    'Negociando': { bg: '#FDEDD3', fg: '#8a5a10' },
    'Confirmado': { bg: '#DCF4F2', fg: '#0a6f6a' },
    'Postado':    { bg: '#FFE3E9', fg: '#a8123a' },
  };

  let campaigns = [];
  let campaignInfluencers = [];
  let posts = [];
  let influencers = [];
  let snapshots = [];
  let selectedCampaignId = null;

  const $ = (id) => document.getElementById(id);
  const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
  const escapeHtml = (str) => String(str).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtNum = (n) => Number(n||0).toLocaleString('pt-BR');
  const fmtCurrency = (n) => Number(n||0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
  const fmtDate = (iso) => { if(!iso) return '—'; const d = new Date(iso + 'T00:00:00'); return d.toLocaleDateString('pt-BR'); };
  const getInfluencer = (id) => influencers.find(i => i.id === id);

  // ---------- Storage ----------
  async function loadAll(){
    try {
      const cp = await window.storage.get('campaigns-posts', true);
      if (cp && cp.value) {
        const parsed = JSON.parse(cp.value);
        campaigns = (parsed.campaigns || []).map(c => ({ budget: 0, goalPosts: 0, ...c }));
        campaignInfluencers = parsed.campaignInfluencers || [];
        posts = parsed.posts || [];
      }
    } catch(e){ campaigns = []; campaignInfluencers = []; posts = []; }

    try {
      const ir = await window.storage.get('influencers-roster', true);
      if (ir && ir.value) {
        const parsed = JSON.parse(ir.value);
        influencers = parsed.influencers || [];
      }
    } catch(e){ influencers = []; }

    try {
      const vs = await window.storage.get('view-snapshots', true);
      if (vs && vs.value) {
        const parsed = JSON.parse(vs.value);
        snapshots = parsed.snapshots || [];
      }
    } catch(e){ snapshots = []; }

    migrateLegacyPosts();
  }

  // Posts criados na versão anterior guardavam o nome do influenciador como texto livre
  // (campo "influencer"). Aqui a gente converte isso para o banco de influenciadores novo,
  // sem perder nada que já tinha sido registrado.
  function migrateLegacyPosts(){
    let changed = false;
    posts.forEach(p => {
      if(!p.influencerId && p.influencer){
        let inf = influencers.find(i => i.name.toLowerCase() === String(p.influencer).toLowerCase());
        if(!inf){
          inf = { id: genId(), name: p.influencer, handle:'', niche:'', followers:null, contact:'', notes:'', createdAt: Date.now() };
          influencers.push(inf);
        }
        p.influencerId = inf.id;
        delete p.influencer;
        let link = campaignInfluencers.find(ci => ci.campaignId === p.campaignId && ci.influencerId === inf.id);
        if(!link){
          campaignInfluencers.push({ id: genId(), campaignId: p.campaignId, influencerId: inf.id, status: 'Postado', addedAt: Date.now() });
        }
        changed = true;
      }
    });
    if(changed){ saveCampaignsPosts(); saveInfluencers(); }
  }

  async function saveCampaignsPosts(){
    try { await window.storage.set('campaigns-posts', JSON.stringify({campaigns, campaignInfluencers, posts}), true); }
    catch(e){ console.error('Erro ao salvar campanhas/posts', e); }
  }
  async function saveInfluencers(){
    try { await window.storage.set('influencers-roster', JSON.stringify({influencers}), true); }
    catch(e){ console.error('Erro ao salvar banco de influenciadores', e); }
  }
  async function saveSnapshots(){
    try { await window.storage.set('view-snapshots', JSON.stringify({snapshots}), true); }
    catch(e){ console.error('Erro ao salvar leituras', e); }
  }

  // ---------- Tabs ----------
  const TABS = {
    campaigns:   { btn: 'tabBtnCampaigns',   view: 'viewCampaigns' },
    influencers: { btn: 'tabBtnInfluencers', view: 'viewInfluencers' },
    views:       { btn: 'tabBtnViews',       view: 'viewViews' },
  };
  function switchTab(tab){
    Object.entries(TABS).forEach(([key, ids]) => {
      const active = key === tab;
      $(ids.btn).setAttribute('aria-selected', String(active));
      $(ids.view).classList.toggle('active', active);
    });
  }
  $('tabBtnCampaigns').addEventListener('click', () => switchTab('campaigns'));
  $('tabBtnInfluencers').addEventListener('click', () => switchTab('influencers'));
  $('tabBtnViews').addEventListener('click', () => switchTab('views'));

  // ---------- Campaigns ----------
  $('formCampaign').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('inputCampaignName').value.trim();
    const tag = $('inputCampaignTag').value.trim();
    if(!name || !tag){ $('errorCampaign').style.display='block'; return; }
    $('errorCampaign').style.display='none';
    campaigns.push({ id: genId(), name, hashtag: tag, budget:0, goalPosts:0, createdAt: Date.now() });
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
      const extra = (c.budget > 0 || c.goalPosts > 0)
        ? `<div class="count">${c.budget>0?fmtCurrency(c.budget):'sem orçamento'} · ${count}/${c.goalPosts||'?'} posts</div>`
        : '';
      return `<div class="campaign-card ${sel}" data-id="${c.id}">
        <div class="name">${escapeHtml(c.name)}</div>
        <div class="tag">${escapeHtml(c.hashtag)}</div>
        <div class="count">${count} post${count===1?'':'s'} registrado${count===1?'':'s'}</div>
        ${extra}
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

    $('inputBudget').value = campaign.budget || '';
    $('inputGoalPosts').value = campaign.goalPosts || '';

    renderPlanningStats(campaign);
    renderCampaignInfluencers(campaign.id);
    renderPostInfluencerOptions(campaign.id);
    renderPosts(campaign.id);
  }

  // ---------- Planning (budget + goal + CPM) ----------
  $('formBudget').addEventListener('submit', async (e) => {
    e.preventDefault();
    if(!selectedCampaignId) return;
    const campaign = campaigns.find(c => c.id === selectedCampaignId);
    if(!campaign) return;
    campaign.budget = Number($('inputBudget').value) || 0;
    campaign.goalPosts = Number($('inputGoalPosts').value) || 0;
    await saveCampaignsPosts();
    renderPlanningStats(campaign);
    renderCampaignList();
  });

  function renderPlanningStats(campaign){
    const campaignPosts = posts.filter(p => p.campaignId === campaign.id);
    const count = campaignPosts.length;
    const goal = campaign.goalPosts || 0;
    const pct = goal > 0 ? Math.min(100, Math.round((count/goal)*100)) : 0;
    $('progressValue').textContent = goal > 0 ? `${count}/${goal}` : `${count} registrado${count===1?'':'s'}`;
    $('progressFill').style.width = pct + '%';

    const totalViews = campaignPosts.reduce((sum,p) => sum + (Number(p.views)||0), 0);
    const budget = campaign.budget || 0;
    if(budget > 0 && totalViews > 0){
      const cpm = (budget / totalViews) * 1000;
      $('cpmValue').textContent = fmtCurrency(cpm);
      $('cpmSub').textContent = `${fmtNum(totalViews)} visualizações totais`;
      $('cpmSub').className = 'delta';
    } else {
      $('cpmValue').textContent = '—';
      $('cpmSub').textContent = 'defina orçamento e registre visualizações nos posts';
      $('cpmSub').className = 'delta';
    }
  }

  // ---------- Campaign influencers (recruiting + status) ----------
  $('btnToggleNewInfluencer').addEventListener('click', () => {
    const block = $('newInfluencerFields');
    const isHidden = block.style.display === 'none';
    block.style.display = isHidden ? 'block' : 'none';
    $('btnToggleNewInfluencer').textContent = isHidden ? 'Usar influenciador do banco' : '+ Novo influenciador';
    $('selectExistingInfluencer').disabled = isHidden;
  });

  function renderCampaignInfluencers(campaignId){
    const linked = campaignInfluencers.filter(ci => ci.campaignId === campaignId);
    const linkedIds = new Set(linked.map(ci => ci.influencerId));
    const available = influencers.filter(inf => !linkedIds.has(inf.id));

    const select = $('selectExistingInfluencer');
    select.innerHTML = '<option value="">Selecione...</option>' +
      available.map(inf => `<option value="${inf.id}">${escapeHtml(inf.name)}${inf.handle?' ('+escapeHtml(inf.handle)+')':''}</option>`).join('');

    const tbody = $('campaignInfluencersTableBody');
    if(linked.length === 0){
      tbody.innerHTML = '';
      $('campaignInfluencersEmpty').style.display = 'block';
    } else {
      $('campaignInfluencersEmpty').style.display = 'none';
      tbody.innerHTML = linked.map(ci => {
        const inf = getInfluencer(ci.influencerId);
        const name = inf ? escapeHtml(inf.name) : '(removido do banco)';
        const handle = inf && inf.handle ? escapeHtml(inf.handle) : '—';
        const options = STATUS_STAGES.map(s => `<option value="${s}" ${s===ci.status?'selected':''}>${s}</option>`).join('');
        return `<tr data-id="${ci.id}">
          <td>${name}</td>
          <td>${handle}</td>
          <td><select class="status-select" data-id="${ci.id}">${options}</select></td>
          <td><button class="btn btn-small btn-ghost confirm-btn" data-action="remove-campaign-influencer">Remover</button></td>
        </tr>`;
      }).join('');
    }
    colorStatusSelects();
    attachCampaignInfluencerHandlers();
  }

  function colorStatusSelects(){
    document.querySelectorAll('.status-select').forEach(sel => {
      const colors = STATUS_COLORS[sel.value] || STATUS_COLORS['Convidado'];
      sel.style.background = colors.bg;
      sel.style.color = colors.fg;
    });
  }

  function attachCampaignInfluencerHandlers(){
    document.querySelectorAll('.status-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        const ci = campaignInfluencers.find(x => x.id === sel.dataset.id);
        if(!ci) return;
        ci.status = sel.value;
        await saveCampaignsPosts();
        colorStatusSelects();
      });
    });
    document.querySelectorAll('[data-action="remove-campaign-influencer"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const row = e.target.closest('tr');
        if(btn.dataset.armed !== 'true'){
          btn.dataset.armed = 'true';
          btn.textContent = 'Confirmar?';
          setTimeout(() => { btn.dataset.armed='false'; btn.textContent='Remover'; }, 3000);
          return;
        }
        const id = row.dataset.id;
        const ci = campaignInfluencers.find(x => x.id === id);
        if(ci){
          posts = posts.filter(p => !(p.campaignId === ci.campaignId && p.influencerId === ci.influencerId));
        }
        campaignInfluencers = campaignInfluencers.filter(x => x.id !== id);
        await saveCampaignsPosts();
        const campaign = campaigns.find(c => c.id === selectedCampaignId);
        renderCampaignInfluencers(selectedCampaignId);
        renderPostInfluencerOptions(selectedCampaignId);
        renderPosts(selectedCampaignId);
        if(campaign) renderPlanningStats(campaign);
        renderCampaignList();
      });
    });
  }

  $('formAddCampaignInfluencer').addEventListener('submit', async (e) => {
    e.preventDefault();
    if(!selectedCampaignId) return;
    const isNew = $('newInfluencerFields').style.display !== 'none';
    let influencerId = $('selectExistingInfluencer').value;

    if(isNew){
      const name = $('inputNewInfName').value.trim();
      if(!name){ $('errorAddCampaignInfluencer').style.display = 'block'; return; }
      const handle = $('inputNewInfHandle').value.trim();
      const inf = { id: genId(), name, handle, niche:'', followers:null, contact:'', notes:'', createdAt: Date.now() };
      influencers.push(inf);
      await saveInfluencers();
      influencerId = inf.id;
      $('inputNewInfName').value = '';
      $('inputNewInfHandle').value = '';
    } else if(!influencerId){
      $('errorAddCampaignInfluencer').style.display = 'block';
      return;
    }
    $('errorAddCampaignInfluencer').style.display = 'none';

    campaignInfluencers.push({ id: genId(), campaignId: selectedCampaignId, influencerId, status: 'Convidado', addedAt: Date.now() });
    await saveCampaignsPosts();

    $('newInfluencerFields').style.display = 'none';
    $('btnToggleNewInfluencer').textContent = '+ Novo influenciador';
    $('selectExistingInfluencer').disabled = false;

    renderCampaignInfluencers(selectedCampaignId);
    renderPostInfluencerOptions(selectedCampaignId);
    renderInfluencerRoster();
  });

  // ---------- Posts ----------
  function renderPostInfluencerOptions(campaignId){
    const linked = campaignInfluencers.filter(ci => ci.campaignId === campaignId);
    const select = $('selectPostInfluencer');
    select.innerHTML = '<option value="">Selecione...</option>' +
      linked.map(ci => {
        const inf = getInfluencer(ci.influencerId);
        const label = inf ? inf.name + (inf.handle ? ' ('+inf.handle+')' : '') : '(removido)';
        return `<option value="${ci.influencerId}">${escapeHtml(label)}</option>`;
      }).join('');
  }

  $('formPost').addEventListener('submit', async (e) => {
    e.preventDefault();
    const influencerId = $('selectPostInfluencer').value;
    const date = $('inputPostDate').value;
    const link = $('inputPostLink').value.trim();
    const viewsRaw = $('inputPostViews').value;
    const views = viewsRaw === '' ? null : Number(viewsRaw);
    if(!influencerId || !date){ $('errorPost').style.display='block'; return; }
    $('errorPost').style.display='none';

    posts.push({ id: genId(), campaignId: selectedCampaignId, influencerId, date, link, views, createdAt: Date.now() });

    const ci = campaignInfluencers.find(x => x.campaignId === selectedCampaignId && x.influencerId === influencerId);
    if(ci && STATUS_STAGES.indexOf(ci.status) < STATUS_STAGES.indexOf('Postado')){
      ci.status = 'Postado';
    }

    await saveCampaignsPosts();
    $('formPost').reset();

    const campaign = campaigns.find(c => c.id === selectedCampaignId);
    renderPosts(selectedCampaignId);
    renderCampaignInfluencers(selectedCampaignId);
    if(campaign) renderPlanningStats(campaign);
    renderCampaignList();
  });

  function renderPosts(campaignId){
    const campaignPosts = posts.filter(p => p.campaignId === campaignId)
      .sort((a,b) => new Date(b.date) - new Date(a.date));

    const tbody = $('postsTableBody');
    if(campaignPosts.length === 0){
      tbody.innerHTML = '';
      $('postsEmpty').style.display = 'block';
    } else {
      $('postsEmpty').style.display = 'none';
      tbody.innerHTML = campaignPosts.map(p => {
        const inf = getInfluencer(p.influencerId);
        const name = inf ? escapeHtml(inf.name) : '(removido)';
        return `<tr data-id="${p.id}">
          <td>${name}</td>
          <td class="num">${fmtDate(p.date)}</td>
          <td class="num">${p.views!=null ? fmtNum(p.views) : '—'}</td>
          <td>${p.link ? `<a class="post-link" href="${escapeHtml(p.link)}" target="_blank" rel="noopener">ver post</a>` : '—'}</td>
          <td><button class="btn btn-small btn-ghost confirm-btn" data-action="remove-post">Remover</button></td>
        </tr>`;
      }).join('');
    }

    const byInfluencer = {};
    let totalViews = 0;
    campaignPosts.forEach(p => {
      const inf = getInfluencer(p.influencerId);
      const name = inf ? inf.name : '(removido)';
      byInfluencer[name] = (byInfluencer[name]||0) + 1;
      totalViews += Number(p.views)||0;
    });
    const chips = Object.entries(byInfluencer).map(([name,count]) => `<span class="summary-chip">${escapeHtml(name)} · ${count}</span>`);
    const totalChip = `<span class="summary-chip" style="background:var(--signal-soft); color:#a8123a;">Total · ${campaignPosts.length} post${campaignPosts.length===1?'':'s'}</span>`;
    const viewsChip = totalViews > 0 ? `<span class="summary-chip" style="background:var(--pending-soft); color:#8a5a10;">${fmtNum(totalViews)} visualizações</span>` : '';
    $('summaryRow').innerHTML = campaignPosts.length ? totalChip + viewsChip + chips.join('') : '';

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
        const campaign = campaigns.find(c => c.id === selectedCampaignId);
        renderPosts(selectedCampaignId);
        if(campaign) renderPlanningStats(campaign);
        renderCampaignList();
      });
    });
  }

  // ---------- Influencer roster ----------
  $('formInfluencer').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('inputInfName').value.trim();
    if(!name){ $('errorInfluencer').style.display = 'block'; return; }
    $('errorInfluencer').style.display = 'none';
    influencers.push({
      id: genId(),
      name,
      handle: $('inputInfHandle').value.trim(),
      niche: $('inputInfNiche').value.trim(),
      followers: $('inputInfFollowers').value ? Number($('inputInfFollowers').value) : null,
      contact: $('inputInfContact').value.trim(),
      notes: $('inputInfNotes').value.trim(),
      createdAt: Date.now()
    });
    await saveInfluencers();
    $('formInfluencer').reset();
    renderInfluencerRoster();
    if(selectedCampaignId) renderCampaignInfluencers(selectedCampaignId);
  });

  function renderInfluencerRoster(){
    const wrap = $('influencerList');
    if(influencers.length === 0){
      wrap.innerHTML = '<div class="empty-state">Nenhum influenciador cadastrado ainda.</div>';
      return;
    }
    wrap.innerHTML = influencers.map(inf => {
      const campaignsCount = campaignInfluencers.filter(ci => ci.influencerId === inf.id).length;
      const meta = [inf.niche, inf.followers!=null ? fmtNum(inf.followers)+' seguidores' : null].filter(Boolean).join(' · ');
      return `<div class="campaign-card static" data-id="${inf.id}">
        <div class="name">${escapeHtml(inf.name)} ${inf.handle ? `<span class="tag">${escapeHtml(inf.handle)}</span>` : ''}</div>
        ${meta ? `<div class="count">${escapeHtml(meta)}</div>` : ''}
        <div class="count">${campaignsCount} campanha${campaignsCount===1?'':'s'}</div>
        <button class="btn btn-small btn-ghost confirm-btn" data-action="remove-influencer" style="margin-top:8px;">Remover</button>
      </div>`;
    }).join('');
    attachRemoveInfluencerHandlers();
  }

  function attachRemoveInfluencerHandlers(){
    document.querySelectorAll('[data-action="remove-influencer"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const card = e.target.closest('.campaign-card');
        if(btn.dataset.armed !== 'true'){
          btn.dataset.armed = 'true';
          btn.textContent = 'Confirmar? (remove de campanhas também)';
          setTimeout(() => { btn.dataset.armed='false'; btn.textContent='Remover'; }, 3500);
          return;
        }
        const id = card.dataset.id;
        influencers = influencers.filter(i => i.id !== id);
        const linkedCampaignInfluencerIds = campaignInfluencers.filter(ci => ci.influencerId === id).map(ci => ci.id);
        campaignInfluencers = campaignInfluencers.filter(ci => ci.influencerId !== id);
        posts = posts.filter(p => p.influencerId !== id);
        await saveInfluencers();
        await saveCampaignsPosts();
        renderInfluencerRoster();
        if(selectedCampaignId){
          const campaign = campaigns.find(c => c.id === selectedCampaignId);
          renderCampaignInfluencers(selectedCampaignId);
          renderPostInfluencerOptions(selectedCampaignId);
          renderPosts(selectedCampaignId);
          if(campaign) renderPlanningStats(campaign);
        }
        renderCampaignList();
      });
    });
  }

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

    const tbody = $('snapshotsTableBody');
    const descending = [...sorted].reverse();
    if(descending.length === 0){
      tbody.innerHTML = '';
      $('snapshotsEmpty').style.display = 'block';
    } else {
      $('snapshotsEmpty').style.display = 'none';
      tbody.innerHTML = descending.map((s) => {
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
    renderCampaignList();
    renderCampaignDetail();
    renderInfluencerRoster();
    renderViews();
  }
  init();
})();
