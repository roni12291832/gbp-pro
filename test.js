
/* ===========================
   STATE
   =========================== */
let APP = {
  currentBiz: null,
  competitors: [],
  aiText: '',
  history: JSON.parse(localStorage.getItem('gbp_history') || '[]'),
  clients: JSON.parse(localStorage.getItem('gbp_clients') || '[]'),
  cfg: JSON.parse(localStorage.getItem('gbp_cfg') || '{}')
};

/* ===========================
   INIT
   =========================== */
window.onload = () => {
  renderManageList();
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && document.activeElement.id.startsWith('s_')) doSearch(); });
};

function saveConfig() {
  // Config save removed
}

function updateApiStatus() {
  // Status is hardcoded in HTML now
}

/* ===========================
   NAVIGATION
   =========================== */
function goPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  document.querySelector('[data-page="' + name + '"]')?.classList.add('active');
  const titles = { setup:'Início', dashboard:'Dashboard', checklist:'Checklist', reviews:'Avaliações', competitors:'Concorrentes', insights:'Insights', history:'Histórico', proposal:'Proposta', manage:'Clientes', settings:'Config' };
  document.getElementById('topbarTitle').textContent = 'GBP Pro — ' + (titles[name] || name);
  if (name === 'competitors' && APP.currentBiz && !APP.competitors.length) loadCompetitors();
  if (name === 'insights') renderInsights();
  if (name === 'history') renderHistory();
  if (name === 'manage') renderManageList();
  if (name === 'proposal') updateProposalPreview();
}

/* ===========================
   LOADING
   =========================== */
function setLoading(show, title = '', sub = '', steps = []) {
  const ov = document.getElementById('loadingOverlay');
  ov.classList.toggle('show', show);
  if (title) document.getElementById('loadingTitle').textContent = title;
  if (sub) document.getElementById('loadingSub').textContent = sub;
  const sc = document.getElementById('loadingSteps');
  sc.innerHTML = steps.map((s, i) => `<div class="loading-step"><span class="step-dot ${s.status}"></span>${s.label}</div>`).join('');
}

function updateStep(steps, idx) {
  const sc = document.getElementById('loadingSteps');
  sc.innerHTML = steps.map((s, i) => `<div class="loading-step"><span class="step-dot ${i < idx ? 'done' : i === idx ? 'active' : ''}"></span>${s.label}</div>`).join('');
}

/* ===========================
   SEARCH
   =========================== */
async function doSearch() {
  const name = document.getElementById('s_bizName').value.trim();
  const city = document.getElementById('s_bizCity').value.trim();
  document.getElementById('searchError').style.display = 'none';
  if (!name) return showSearchError('Informe o nome do negócio.');

  const steps = [
    { label: 'Buscando negócio no Google Places' },
    { label: 'Coletando detalhes e fotos' },
    { label: 'Analisando concorrentes da região' },
    { label: 'Gerando diagnóstico com IA e calculando score de saúde' },
    { label: 'Montando relatório completo' }
  ];

  setLoading(true, 'Analisando: ' + name, 'Aguarde, coletando dados públicos...', steps);
  document.getElementById('searchBtn').disabled = true;

  try {
    updateStep(steps, 0);
    const query = encodeURIComponent(name + (city ? ' ' + city : ''));

    let biz = null;

    // Text search
    const searchUrl = `/api/places?action=search&query=${query}`;
    let searchRes;
    try { searchRes = await fetch(searchUrl); } catch(e) { throw new Error('Erro de rede ao acessar Google Places API. Verifique sua chave e permissões CORS.'); }
    const searchData = await searchRes.json();
    if (searchData.status === 'REQUEST_DENIED') throw new Error('API Key inválida ou sem permissão. Ative a Places API no Google Cloud Console.');
    if (!searchData.results?.length) throw new Error(`Nenhum resultado para "${name}"${city ? ' em ' + city : ''}. Tente variações do nome.`);

    updateStep(steps, 1);

    const place_id = searchData.results[0].place_id;
    const fields = 'name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,opening_hours,photos,reviews,types,business_status,price_level,editorial_summary,geometry,url';
    const detailUrl = `/api/places?action=details&place_id=${place_id}`;
    const detailRes = await fetch(detailUrl);
    const detailData = await detailRes.json();

    if (detailData.status !== 'OK') throw new Error('Erro ao buscar detalhes: ' + (detailData.error_message || detailData.status));

    biz = detailData.result;
    biz.place_id = place_id;
    biz.fetchedAt = new Date().toISOString();
    biz.lat = detailData.result.geometry?.location?.lat;
    biz.lng = detailData.result.geometry?.location?.lng;

    updateStep(steps, 2);

    // Load nearby competitors
    if (biz.lat && biz.lng) {
      const type = biz.types?.[0] || 'establishment';
      const nearUrl = `/api/places?action=nearby&lat=${biz.lat}&lng=${biz.lng}&type=${type}&radius=2000`;
      try {
        const nearRes = await fetch(nearUrl);
        const nearData = await nearRes.json();
        if (nearData.results) {
          APP.competitors = nearData.results.filter(r => r.place_id !== place_id).slice(0, 8).map(r => ({
            name: r.name, rating: r.rating || 0, total: r.user_ratings_total || 0,
            address: r.vicinity, place_id: r.place_id,
            types: r.types, status: r.business_status
          }));
        }
      } catch(e) { APP.competitors = []; }
    }

    updateStep(steps, 3);

    APP.aiText = '';
    await runAI(biz);

    updateStep(steps, 4);

    APP.currentBiz = biz;
    saveClient(biz);
    renderAll(biz);

    setLoading(false);
    document.getElementById('searchBtn').disabled = false;
    document.getElementById('topbarBizName').textContent = biz.name;
    document.getElementById('pdfBtn').style.display = 'flex';
    goPage('dashboard');

  } catch(err) {
    setLoading(false);
    document.getElementById('searchBtn').disabled = false;
    showSearchError(err.message);
  }
}

function showSearchError(msg) {
  const el = document.getElementById('searchError');
  el.style.display = 'flex';
  el.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="flex-shrink:0;margin-top:1px"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> ${msg}`;
}

/* ===========================
   AI ANALYSIS
   =========================== */
async function runAI(biz) {
  const reviews = (biz.reviews || []).slice(0, 5).map(r => `${r.rating}★: ${(r.text || '').slice(0, 120)}`).join('\n');
  const prompt = `Você é especialista em Google Business Profile e Local SEO. Analise este negócio e responda em JSON exato:

NEGÓCIO: ${biz.name}
Categoria: ${(biz.types||[]).slice(0,3).join(', ')}
Avaliação: ${biz.rating||'N/A'} (${biz.user_ratings_total||0} reviews)
Telefone: ${biz.formatted_phone_number?'SIM':'NÃO'}
Website: ${biz.website?'SIM':'NÃO'}
Horários: ${biz.opening_hours?'SIM':'NÃO'}
Fotos: ${biz.photos?.length||0}
Status: ${biz.business_status||'?'}
Reviews recentes:
${reviews||'Nenhum'}

Retorne JSON válido (sem markdown):
{
  "score_comment": "frase de 1 linha sobre a saúde do perfil",
  "strengths": ["ponto forte 1","ponto forte 2","ponto forte 3"],
  "problems": ["problema crítico 1","problema crítico 2","problema crítico 3"],
  "opportunities": ["oportunidade 1","oportunidade 2","oportunidade 3"],
  "keywords_positive": ["palavra1","palavra2","palavra3","palavra4","palavra5"],
  "keywords_negative": ["palavra1","palavra2"],
  "proposal_pitch": "parágrafo de 3-4 linhas para uma proposta comercial, em 1ª pessoa como especialista, endereçado ao dono do negócio, explicando o problema e a solução. Tom profissional e direto.",
  "priority_action": "ação mais urgente que o negócio deve tomar"
}`;

  try {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-3-5-sonnet-20241022', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await res.json();
    if (data.content?.[0]?.text) {
      try {
        APP.aiText = JSON.parse(data.content[0].text.replace(/```json|```/g, '').trim());
      } catch(e) { APP.aiText = { proposal_pitch: data.content[0].text }; }
    }
  } catch(e) { APP.aiText = null; }
}

/* ===========================
   RENDER ALL
   =========================== */
function renderAll(biz) {
  const score = calcScore(biz);
  renderDashboard(biz, score);
  renderChecklist(biz, score);
  renderReviews(biz);
  renderCompetitors();
  renderInsights();
  renderHistory();
}

function calcScore(biz) {
  let s = 0;
  const r = biz.rating || 0;
  const t = biz.user_ratings_total || 0;
  const p = biz.photos?.length || 0;
  if (r >= 4.5) s += 28; else if (r >= 4) s += 22; else if (r >= 3) s += 12; else if (r > 0) s += 4;
  if (t >= 100) s += 22; else if (t >= 50) s += 16; else if (t >= 20) s += 10; else if (t >= 5) s += 4;
  if (biz.formatted_phone_number) s += 10;
  if (biz.website) s += 10;
  if (biz.opening_hours?.weekday_text) s += 14;
  if (p >= 20) s += 16; else if (p >= 10) s += 11; else if (p >= 3) s += 6; else if (p >= 1) s += 2;
  return Math.min(100, s);
}

function scoreColor(s) { return s >= 70 ? '#1D9E75' : s >= 45 ? '#BA7517' : '#E24B4A'; }
function scoreLabel(s) { return s >= 70 ? 'Boa saúde' : s >= 45 ? 'Atenção' : 'Crítico'; }
function stars(n) { let s=''; for(let i=1;i<=5;i++) s += i<=Math.floor(n)?'★':'☆'; return s; }

/* ===========================
   DASHBOARD
   =========================== */
function renderDashboard(biz, score) {
  document.getElementById('db_title').textContent = biz.name;
  document.getElementById('db_sub').textContent = (biz.types||[]).slice(0,2).join(' · ').replace(/_/g,' ') + ' — ' + (biz.formatted_address||'').split(',').slice(-2).join(',').trim();

  const r = biz.rating||0, t = biz.user_ratings_total||0, p = biz.photos?.length||0;
  const rC = r>=4?'metric-green':r>=3?'metric-amber':'metric-red';
  const tC = t>=50?'metric-green':t>=20?'metric-amber':'metric-red';
  const pC = p>=10?'metric-green':p>=3?'metric-amber':'metric-red';

  document.getElementById('db_metrics').innerHTML = `
    <div class="metric-card"><div class="metric-label">Avaliação Google</div><div class="metric-value ${rC}">${r>0?r.toFixed(1):'N/A'}</div><div class="metric-sub">${r>0?stars(r):''} ${t>0?'('+t+')':''}</div></div>
    <div class="metric-card"><div class="metric-label">Nº de avaliações</div><div class="metric-value ${tC}">${t.toLocaleString('pt-BR')}</div><div class="metric-sub">${t>=50?'Volume bom':t>=20?'Volume médio':'Volume baixo'}</div></div>
    <div class="metric-card"><div class="metric-label">Fotos públicas</div><div class="metric-value ${pC}">${p}</div><div class="metric-sub">${p>=10?'Boa galeria':p>=3?'Poucos':p===0?'Nenhuma':'Insuficiente'}</div></div>
    <div class="metric-card"><div class="metric-label">Score de saúde</div><div class="metric-value" style="color:${scoreColor(score)}">${score}</div><div class="metric-sub">/100 — ${scoreLabel(score)}</div></div>
  `;

  // Health ring
  const circ = 2*Math.PI*36, dash = (score/100)*circ, col = scoreColor(score);
  const ai = APP.aiText;
  document.getElementById('db_health').innerHTML = `
    <div class="card-title mb-2"><span class="card-title-dot" style="background:${col}"></span>Score de Saúde do Perfil</div>
    <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">
      <div class="score-ring-wrap"><svg width="90" height="90" viewBox="0 0 90 90"><circle cx="45" cy="45" r="36" fill="none" stroke="#eee" stroke-width="7"/><circle cx="45" cy="45" r="36" fill="none" stroke="${col}" stroke-width="7" stroke-dasharray="${dash.toFixed(1)} ${circ.toFixed(1)}" stroke-linecap="round"/></svg><div class="score-ring-number" style="color:${col}">${score}<div class="score-ring-label">/100</div></div></div>
      <div style="flex:1;min-width:160px">
        <div style="font-size:16px;font-weight:700;margin-bottom:4px;color:${col}">${scoreLabel(score)}</div>
        <div style="font-size:13px;color:var(--text2);line-height:1.5">${ai?.score_comment||'Análise baseada nos dados públicos do Google Places.'}</div>
        ${ai?.priority_action?`<div style="margin-top:8px"><span class="tag tag-red">Ação urgente</span> <span style="font-size:12px;color:var(--text2)">${ai.priority_action}</span></div>`:``}
      </div>
    </div>
    ${ai?.strengths?`<hr class="divider"><div style="display:flex;gap:8px;flex-wrap:wrap">${ai.strengths.map(s=>`<span class="tag tag-green">✓ ${s}</span>`).join('')}</div>`:``}
  `;

  // Tags
  const isOpen = biz.opening_hours?.open_now;
  const tags = [
    biz.business_status==='OPERATIONAL'?['Perfil ativo','green']:['Perfil suspenso','red'],
    biz.formatted_phone_number?['Telefone cadastrado','green']:['Sem telefone','amber'],
    biz.website?['Website linkado','blue']:['Sem website','amber'],
    biz.opening_hours?['Horários cadastrados','green']:['Sem horários','amber'],
    p>=10?['Boa galeria de fotos','green']:p>=3?['Poucas fotos','amber']:['Sem fotos','red'],
    isOpen===true?['Aberto agora','green']:isOpen===false?['Fechado agora','gray']:[],
  ].filter(t=>t.length);

  document.getElementById('db_tags').innerHTML = `
    <div class="card-title mb-2"><span class="card-title-dot" style="background:var(--blue)"></span>Status do Perfil</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px">${tags.map(t=>`<span class="tag tag-${t[1]}">${t[0]}</span>`).join('')}</div>
    <div style="font-size:12px;color:var(--text2)"><strong>Google Maps URL:</strong> <a href="${biz.url||'#'}" target="_blank" style="font-size:11px">${biz.url?'Ver perfil →':'N/A'}</a></div>
    ${biz.editorial_summary?.overview?`<div style="margin-top:10px;font-size:13px;color:var(--text2);line-height:1.5;font-style:italic">"${biz.editorial_summary.overview}"</div>`:``}
  `;

  // Opportunities
  const opps = buildOpportunities(biz);
  document.getElementById('db_opportunities').innerHTML = `
    <div class="card-title mb-2"><span class="card-title-dot" style="background:var(--red)"></span>Oportunidades Identificadas (${opps.length})</div>
    ${opps.map(o=>`<div class="opp-item opp-${o.p}"><div><div class="opp-title">${o.t}</div><div class="opp-desc">${o.d}</div></div><span class="tag tag-${o.p==='high'?'red':o.p==='med'?'amber':'green'}" style="flex-shrink:0;margin-left:auto">${o.p==='high'?'Alta':o.p==='med'?'Média':'Baixa'}</span></div>`).join('')}
  `;

  // Hours
  let hoursHtml = `<div class="card-title mb-2"><span class="card-title-dot" style="background:var(--blue)"></span>Horários</div>`;
  if (biz.opening_hours?.weekday_text) {
    const today = new Date().getDay();
    hoursHtml += `<table style="width:100%;font-size:13px;border-collapse:collapse">`;
    biz.opening_hours.weekday_text.forEach((line,i) => {
      const isT = i===(today===0?6:today-1);
      hoursHtml += `<tr style="${isT?'color:var(--green);font-weight:600':''}"><td style="padding:4px 0;width:90px">${line.split(':')[0]}</td><td style="padding:4px 0">${line.split(': ').slice(1).join(': ')}</td></tr>`;
    });
    hoursHtml += `</table>`;
  } else {
    hoursHtml += `<div class="alert alert-warn"><span>Horários não cadastrados. Isso reduz cliques de "Como chegar" e ligações.</span></div>`;
  }
  document.getElementById('db_hours').innerHTML = hoursHtml;

  // Contact
  document.getElementById('db_contact').innerHTML = `
    <div class="card-title mb-2"><span class="card-title-dot" style="background:var(--purple)"></span>Dados de Contato</div>
    <div style="display:flex;flex-direction:column;gap:10px;font-size:13px">
      <div class="flex-between"><span class="text-muted">Endereço</span><span style="text-align:right;max-width:200px">${biz.formatted_address||'N/A'}</span></div>
      <div class="flex-between"><span class="text-muted">Telefone</span><span style="font-weight:${biz.formatted_phone_number?'600':'400'};color:${biz.formatted_phone_number?'var(--text)':'var(--red)'}">${biz.formatted_phone_number||'❌ Não cadastrado'}</span></div>
      <div class="flex-between"><span class="text-muted">Website</span>${biz.website?`<a href="${biz.website}" target="_blank" style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block">${biz.website.replace('https://','').replace('http://','').split('/')[0]}</a>`:`<span style="color:var(--red)">❌ Não cadastrado</span>`}</div>
      <div class="flex-between"><span class="text-muted">Preço</span><span>${biz.price_level?'$'.repeat(biz.price_level):'N/A'}</span></div>
      <div class="flex-between"><span class="text-muted">Status</span><span class="tag ${biz.business_status==='OPERATIONAL'?'tag-green':'tag-red'}">${biz.business_status==='OPERATIONAL'?'Operacional':'Suspenso/Fechado'}</span></div>
    </div>
  `;
}

function buildOpportunities(biz) {
  const opps = [];
  const r = biz.rating||0, t = biz.user_ratings_total||0, p = biz.photos?.length||0;
  if (!biz.opening_hours) opps.push({ t:'Horários não cadastrados', d:'Perfis com horários têm 2x mais cliques em "Como chegar". Fácil de corrigir.', p:'high' });
  if (!biz.formatted_phone_number) opps.push({ t:'Sem telefone cadastrado', d:'Clientes não conseguem ligar direto do Maps. Alta perda de leads.', p:'high' });
  if (t < 20) opps.push({ t:`Apenas ${t} avaliações`, d:'Volume muito baixo. Uma estratégia de coleta ativa pode triplicar em 30 dias.', p:'high' });
  if (r > 0 && r < 4) opps.push({ t:`Nota ${r.toFixed(1)} — abaixo da média`, d:'Respostas profissionais e gestão de reviews podem recuperar a nota em 60-90 dias.', p:'high' });
  if (!biz.website) opps.push({ t:'Sem website vinculado', d:'Perda de credibilidade e conversões. Um site simples já resolve.', p:'med' });
  if (p < 10) opps.push({ t:`Apenas ${p} foto${p!==1?'s':''} no perfil`, d:'+20 fotos geram 2x mais visitas ao site segundo dados do Google.', p:p<3?'high':'med' });
  const ai = APP.aiText;
  if (ai?.opportunities) ai.opportunities.forEach(o => opps.push({ t: o, d:'Identificado pela análise de IA com base nas avaliações e perfil.', p:'med' }));
  if (opps.length === 0) opps.push({ t:'Perfil bem estruturado!', d:'Base sólida. Foque em SEO local avançado e gestão recorrente para manter a liderança.', p:'low' });
  return opps;
}

/* ===========================
   CHECKLIST
   =========================== */
function renderChecklist(biz, score) {
  const r = biz.rating||0, t = biz.user_ratings_total||0, p = biz.photos?.length||0;
  const reviews = biz.reviews||[];
  const hasRecent = reviews.some(rv => (Date.now()/1000 - rv.time) < 90*86400);

  const checks = [
    { l:'Avaliação ≥ 4 estrelas', ok:r>=4, w:r>=3&&r<4, v:r>0?r.toFixed(1)+' ★':'Sem avaliações', tip:'Avaliação média acima de 4 é referência de confiança.' },
    { l:'Volume de avaliações ≥ 50', ok:t>=50, w:t>=20&&t<50, v:t+' avaliações', tip:'Negócios com mais avaliações aparecem mais no Maps.' },
    { l:'Avaliações recentes (90 dias)', ok:hasRecent, w:reviews.length>0&&!hasRecent, v:hasRecent?'Sim':'Sem recentes', tip:'Frequência de novas avaliações influencia o ranking local.' },
    { l:'Telefone cadastrado', ok:!!biz.formatted_phone_number, v:biz.formatted_phone_number||'Não cadastrado', tip:'Aumenta as chamadas diretas do Google Maps.' },
    { l:'Website linkado', ok:!!biz.website, v:biz.website?'Cadastrado':'Não cadastrado', tip:'Redirecionamentos ao site geram conversões.' },
    { l:'Horários de funcionamento', ok:!!biz.opening_hours, v:biz.opening_hours?'Cadastrado':'Não cadastrado', tip:'Usuários verificam horários antes de visitar.' },
    { l:'Galeria de fotos (≥10)', ok:p>=10, w:p>=3&&p<10, v:p+' foto'+(p!==1?'s':''), tip:'Perfis com +20 fotos têm 2x mais visitas ao site.' },
    { l:'Perfil ativo (não suspenso)', ok:biz.business_status==='OPERATIONAL', v:biz.business_status==='OPERATIONAL'?'Operacional':(biz.business_status||'Desconhecido'), tip:'Perfis suspensos ficam ocultos nos resultados.' },
    { l:'Descrição editorial', ok:!!biz.editorial_summary?.overview, w:!biz.editorial_summary?.overview, v:biz.editorial_summary?.overview?'Disponível':'Não disponível', tip:'Descrição gerada pelo Google aparece em destaque.' },
    { l:'Categoria do negócio', ok:!!(biz.types?.length>0), v:biz.types?biz.types.slice(0,2).join(', ').replace(/_/g,' '):'N/A', tip:'Categorias corretas determinam em quais buscas aparecer.' },
    { l:'Resposta a avaliações', ok:false, w:true, v:'Não verificável via API', tip:'Responder avaliações aumenta confiança e ranking.' },
    { l:'Postagens (Google Posts)', ok:false, w:true, v:'Não verificável via API', tip:'Posts mantêm o perfil ativo e engajado.' },
  ];

  const okCount = checks.filter(c=>c.ok).length;
  const warnCount = checks.filter(c=>!c.ok&&c.w).length;
  const failCount = checks.filter(c=>!c.ok&&!c.w).length;

  document.getElementById('cl_list').innerHTML = `
    <div class="card-title mb-2"><span class="card-title-dot" style="background:var(--green)"></span>Itens verificados — ${okCount}/${checks.length} OK</div>
    <div style="display:flex;gap:12px;margin-bottom:14px">
      <span class="tag tag-green">✓ ${okCount} OK</span>
      <span class="tag tag-amber">! ${warnCount} atenção</span>
      <span class="tag tag-red">✗ ${failCount} falho</span>
    </div>
    ${checks.map(c => {
      const st = c.ok?'ci-ok':c.w?'ci-warn':'ci-fail';
      const icon = c.ok?'✓':c.w?'!':'✗';
      return `<div class="check-item"><div class="check-icon ${st}">${icon}</div><div style="flex:1"><div class="check-text">${c.l}</div><div class="check-sub">${c.v}${c.tip?` — ${c.tip}`:``}</div></div></div>`;
    }).join('')}
  `;

  document.getElementById('cl_chart_wrap').innerHTML = `
    <div class="card-title mb-2"><span class="card-title-dot" style="background:var(--purple)"></span>Distribuição dos itens</div>
    <div style="position:relative;height:220px"><canvas id="clChart" role="img" aria-label="Gráfico de pizza mostrando itens OK, atenção e falho">OK: ${okCount}, Atenção: ${warnCount}, Falho: ${failCount}</canvas></div>
    <div style="display:flex;gap:12px;margin-top:12px;font-size:12px;justify-content:center">
      <span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:2px;background:#1D9E75;display:inline-block"></span>OK (${okCount})</span>
      <span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:2px;background:#BA7517;display:inline-block"></span>Atenção (${warnCount})</span>
      <span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:2px;background:#E24B4A;display:inline-block"></span>Falho (${failCount})</span>
    </div>
  `;
  setTimeout(() => {
    const ctx = document.getElementById('clChart');
    if (ctx) new Chart(ctx, { type:'doughnut', data:{ labels:['OK','Atenção','Falho'], datasets:[{data:[okCount,warnCount,failCount],backgroundColor:['#1D9E75','#BA7517','#E24B4A'],borderWidth:2,borderColor:'#fff'}] }, options:{ responsive:true, maintainAspectRatio:false, cutout:'65%', plugins:{legend:{display:false}} } });
  }, 100);
}

/* ===========================
   REVIEWS
   =========================== */
function renderReviews(biz) {
  const reviews = biz.reviews || [];
  const r = biz.rating||0, t = biz.user_ratings_total||0;
  const breakdown = [0,0,0,0,0];
  reviews.forEach(rv => { if(rv.rating>=1&&rv.rating<=5) breakdown[rv.rating-1]++; });
  const maxB = Math.max(...breakdown,1);
  const ai = APP.aiText;

  // Summary
  document.getElementById('rv_summary').innerHTML = `
    <div class="card-title mb-2"><span class="card-title-dot" style="background:var(--amber)"></span>Resumo de Avaliações</div>
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px">
      <div><div style="font-size:48px;font-weight:700;color:var(--amber);line-height:1">${r>0?r.toFixed(1):'N/A'}</div><div style="color:var(--amber);font-size:16px">${stars(r)}</div><div style="font-size:12px;color:var(--text2);margin-top:2px">${t.toLocaleString('pt-BR')} avaliações</div></div>
      <div style="flex:1">
        ${[4,3,2,1,0].map(i=>`<div class="progress-row"><span class="progress-label">${i+1} ★</span><div class="progress-wrap"><div class="progress-fill" style="width:${(breakdown[i]/maxB*100).toFixed(0)}%;background:${i>=3?'#1D9E75':i>=2?'#BA7517':'#E24B4A'}"></div></div><span class="progress-count">${breakdown[i]}</span></div>`).join('')}
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">
      <div style="background:var(--green-light);border-radius:6px;padding:8px;color:var(--green-dark)"><strong>Positivas</strong><br>${((breakdown[3]+breakdown[4])/(reviews.length||1)*100).toFixed(0)}% das avaliações</div>
      <div style="background:var(--red-light);border-radius:6px;padding:8px;color:#791F1F"><strong>Negativas</strong><br>${((breakdown[0]+breakdown[1])/(reviews.length||1)*100).toFixed(0)}% das avaliações</div>
    </div>
  `;

  // Chart
  document.getElementById('rv_chart_wrap').innerHTML = `
    <div class="card-title mb-2"><span class="card-title-dot" style="background:var(--amber)"></span>Distribuição por nota</div>
    <div style="position:relative;height:180px"><canvas id="rvChart" role="img" aria-label="Gráfico de barras com distribuição de avaliações 1 a 5 estrelas">Distribuição de avaliações.</canvas></div>
  `;
  setTimeout(() => {
    const ctx = document.getElementById('rvChart');
    if (ctx) new Chart(ctx, { type:'bar', data:{ labels:['1★','2★','3★','4★','5★'], datasets:[{data:breakdown, backgroundColor:['#E24B4A','#E24B4A','#BA7517','#1D9E75','#1D9E75'], borderRadius:4, borderSkipped:false}] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,ticks:{stepSize:1}},x:{grid:{display:false}}} } });
  }, 100);

  // Keywords
  const posKws = ai?.keywords_positive || extractKeywords(reviews, true);
  const negKws = ai?.keywords_negative || extractKeywords(reviews, false);
  document.getElementById('rv_keywords').innerHTML = `
    <div class="card-title mb-2"><span class="card-title-dot" style="background:var(--purple)"></span>Palavras-chave identificadas nas avaliações</div>
    ${posKws.length?`<div style="margin-bottom:10px"><div style="font-size:11px;font-weight:700;color:var(--green);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">Mencionadas positivamente</div><div class="kw-cloud">${posKws.map(k=>`<span class="kw-tag kw-positive">${k}</span>`).join('')}</div></div>`:``}
    ${negKws.length?`<div><div style="font-size:11px;font-weight:700;color:var(--red);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">Mencionadas negativamente</div><div class="kw-cloud">${negKws.map(k=>`<span class="kw-tag kw-negative">${k}</span>`).join('')}</div></div>`:'<div style="font-size:13px;color:var(--text2)">Nenhuma palavra-chave negativa detectada.</div>'}
    ${!ai?`<div style="margin-top:10px;font-size:11px;color:var(--text3)">💡 Conecte a Claude API para análise de sentimento mais precisa</div>`:``}
  `;

  // Reviews list
  document.getElementById('rv_list').innerHTML = `
    <div class="card-title mb-2"><span class="card-title-dot" style="background:var(--amber)"></span>Avaliações recentes (${reviews.length})</div>
    ${reviews.length ? reviews.slice(0,8).map(rv=>`
      <div class="review-card">
        <div class="review-stars">${stars(rv.rating)} <span style="font-size:11px;color:var(--text2);margin-left:4px">${rv.relative_time_description||''}</span></div>
        <div class="review-text">${(rv.text||'Avaliação sem texto.').slice(0,300)}${(rv.text||'').length>300?'...':''}</div>
        <div class="review-author">${rv.author_name||'Anônimo'}</div>
      </div>`).join('') : '<div style="font-size:13px;color:var(--text2);padding:12px 0">Nenhuma avaliação pública disponível via API.</div>'}
  `;
}

function extractKeywords(reviews, positive) {
  const posWords = ['ótimo','excelente','boa','bom','rápido','atendimento','qualidade','recomendo','adorei','incrível','maravilhoso','delicioso','profissional','cuidado','amável','limpo'];
  const negWords = ['ruim','horrível','péssimo','demorado','lento','descaso','sujo','caro','frio','errado','problema','falha','decepção'];
  const words = positive ? posWords : negWords;
  const text = reviews.map(r=>r.text||'').join(' ').toLowerCase();
  return words.filter(w => text.includes(w)).slice(0, positive ? 8 : 4);
}

/* ===========================
   COMPETITORS
   =========================== */
function renderCompetitors() {
  if (!APP.currentBiz) return;
  const biz = APP.currentBiz;
  const comps = APP.competitors;

  if (!comps.length) {
    document.getElementById('comp_content').innerHTML = `
      <div class="empty-state"><div class="empty-icon">🏆</div><div class="empty-title">Sem dados de concorrentes</div><div>A API não retornou negócios similares próximos, ou os dados ainda estão carregando.</div></div>
    `;
    return;
  }

  const allBiz = [{ name:biz.name, rating:biz.rating||0, total:biz.user_ratings_total||0, isMain:true }, ...comps];
  allBiz.sort((a,b) => b.rating===a.rating ? b.total-a.total : b.rating-a.rating);
  const mainRank = allBiz.findIndex(b=>b.isMain) + 1;

  let tableRows = allBiz.map((b,i) => {
    const rC = b.rating>=4?'#1D9E75':b.rating>=3?'#BA7517':'#E24B4A';
    const rankC = i===0?'rank-1':i===1?'rank-2':i===2?'rank-3':'';
    return `<tr class="${b.isMain?'highlight':''}">
      <td><span class="rank-badge ${rankC}">${i+1}</span></td>
      <td><strong>${b.name}</strong>${b.isMain?' <span class="tag tag-blue" style="font-size:10px">seu cliente</span>':''}</td>
      <td style="color:${rC};font-weight:600">${b.rating>0?b.rating.toFixed(1)+' ★':'N/A'}</td>
      <td>${b.total.toLocaleString('pt-BR')}</td>
      <td><div style="height:6px;width:${Math.min(100,b.rating/5*100).toFixed(0)}%;background:${rC};border-radius:3px;min-width:4px"></div></td>
    </tr>`;
  }).join('');

  const avgRating = (allBiz.reduce((a,b)=>a+b.rating,0)/allBiz.length).toFixed(2);
  const avgTotal = Math.round(allBiz.reduce((a,b)=>a+b.total,0)/allBiz.length);
  const mainBiz = allBiz.find(b=>b.isMain);

  document.getElementById('comp_content').innerHTML = `
    <div class="grid-4 mb-2">
      <div class="metric-card"><div class="metric-label">Posição no ranking</div><div class="metric-value" style="color:${mainRank<=3?'#1D9E75':'#BA7517'}">${mainRank}º</div><div class="metric-sub">de ${allBiz.length} negócios</div></div>
      <div class="metric-card"><div class="metric-label">Nota média da região</div><div class="metric-value" style="color:var(--amber)">${avgRating}</div><div class="metric-sub">do segmento</div></div>
      <div class="metric-card"><div class="metric-label">Avaliações médias</div><div class="metric-value" style="color:var(--text)">${avgTotal.toLocaleString('pt-BR')}</div><div class="metric-sub">por negócio</div></div>
      <div class="metric-card"><div class="metric-label">Seu cliente vs média</div><div class="metric-value" style="color:${(mainBiz?.rating||0)>=parseFloat(avgRating)?'#1D9E75':'#E24B4A'}">${((mainBiz?.rating||0)>=parseFloat(avgRating)?'+':'')}${((mainBiz?.rating||0)-parseFloat(avgRating)).toFixed(1)}</div><div class="metric-sub">diferença de nota</div></div>
    </div>
    <div class="card mb-2">
      <div class="card-title mb-2"><span class="card-title-dot" style="background:var(--amber)"></span>Ranking de concorrentes na região (raio 2km)</div>
      <div style="overflow-x:auto">
        <table class="comp-table">
          <thead><tr><th>#</th><th>Negócio</th><th>Nota</th><th>Avaliações</th><th>Score visual</th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </div>
    <div class="card">
      <div class="card-title mb-2"><span class="card-title-dot" style="background:var(--blue)"></span>Comparativo: cliente vs top 3 concorrentes</div>
      <div style="position:relative;height:220px"><canvas id="compChart" role="img" aria-label="Gráfico comparativo de avaliações">Comparativo de concorrentes.</canvas></div>
    </div>
  `;

  setTimeout(() => {
    const ctx = document.getElementById('compChart');
    if (!ctx) return;
    const top4 = allBiz.slice(0,4);
    new Chart(ctx, {
      type:'bar',
      data:{ labels:top4.map(b=>b.name.slice(0,18)+(b.name.length>18?'...':'')), datasets:[
        { label:'Avaliação', data:top4.map(b=>b.rating), backgroundColor:top4.map(b=>b.isMain?'#1D9E75':'#B5D4F4'), borderRadius:4, borderSkipped:false, yAxisID:'y1' },
        { label:'Nº avaliações', data:top4.map(b=>b.total), backgroundColor:top4.map(b=>b.isMain?'rgba(29,158,117,.25)':'rgba(56,138,221,.15)'), borderRadius:4, borderSkipped:false, type:'bar', yAxisID:'y2' }
      ]},
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ y1:{position:'left',beginAtZero:true,max:5,title:{display:true,text:'Nota'}}, y2:{position:'right',beginAtZero:true,grid:{drawOnChartArea:false},title:{display:true,text:'Reviews'}} } }
    });
  }, 100);
}

async function loadCompetitors() {
  if (APP.competitors.length) { renderCompetitors(); return; }
  document.getElementById('comp_content').innerHTML = `<div class="empty-state"><div class="spinner" style="margin:0 auto 12px"></div><div>Carregando concorrentes...</div></div>`;
}

/* ===========================
   INSIGHTS
   =========================== */
function renderInsights() {
  if (!APP.currentBiz) { document.getElementById('ins_content').innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><div class="empty-title">Nenhum negócio analisado</div><div>Faça uma busca primeiro para ver os insights.</div></div>'; return; }
  const biz = APP.currentBiz;
  const r = biz.rating||0, t = biz.user_ratings_total||0, p = biz.photos?.length||0;

  // Simulated monthly trend data
  const months = ['Ago','Set','Out','Nov','Dez','Jan'];
  const baseLine = t;
  const trendData = months.map((_,i) => Math.max(0, Math.round(baseLine * (0.7 + i*0.06) + (Math.random()-0.5)*10)));
  trendData[5] = t;

  document.getElementById('ins_content').innerHTML = `
    <div class="grid-4 mb-2">
      <div class="metric-card"><div class="metric-label">Impressões estimadas/mês</div><div class="metric-value metric-green">${(t*12).toLocaleString('pt-BR')}</div><div class="metric-sub">baseado no volume</div></div>
      <div class="metric-card"><div class="metric-label">Taxa de engajamento</div><div class="metric-value metric-amber">${r>0?(r/5*100).toFixed(0):'0'}%</div><div class="metric-sub">baseado na nota</div></div>
      <div class="metric-card"><div class="metric-label">Potencial de crescimento</div><div class="metric-value" style="color:var(--purple)">${r>0&&r<4.5?'Alto':r>=4.5?'Médio':'Muito alto'}</div><div class="metric-sub">com otimização</div></div>
      <div class="metric-card"><div class="metric-label">Score de completude</div><div class="metric-value metric-green">${calcScore(biz)}/100</div><div class="metric-sub">perfil público</div></div>
    </div>
    <div class="grid-2 mb-2">
      <div class="card">
        <div class="card-title mb-2"><span class="card-title-dot" style="background:var(--green)"></span>Evolução estimada de avaliações</div>
        <div style="position:relative;height:180px"><canvas id="insChart1" role="img" aria-label="Gráfico de evolução de avaliações nos últimos 6 meses">Evolução de avaliações.</canvas></div>
      </div>
      <div class="card">
        <div class="card-title mb-2"><span class="card-title-dot" style="background:var(--blue)"></span>Projeção com gestão ativa (6 meses)</div>
        <div style="position:relative;height:180px"><canvas id="insChart2" role="img" aria-label="Projeção de crescimento com gestão ativa">Projeção de crescimento.</canvas></div>
      </div>
    </div>
    <div class="card">
      <div class="card-title mb-2"><span class="card-title-dot" style="background:var(--amber)"></span>Análise de completude do perfil</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        ${[
          { l:'Informações básicas', v: (!!biz.formatted_phone_number + !!biz.website + !!biz.opening_hours + !!biz.formatted_address), max:4, col:'#1D9E75' },
          { l:'Mídia e fotos', v: Math.min(p,20), max:20, col:'#BA7517' },
          { l:'Engajamento (avaliações)', v: Math.min(t,100), max:100, col:'#7F77DD' },
          { l:'Qualidade (nota)', v: Math.round(r/5*100), max:100, col:'#378ADD' },
        ].map(item => `
          <div>
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px"><span>${item.l}</span><span style="font-weight:600;color:${item.col}">${item.l==='Informações básicas'?item.v+'/4':item.v+'%'}</span></div>
            <div style="height:8px;background:var(--bg3);border-radius:4px;overflow:hidden"><div style="height:100%;width:${(item.v/item.max*100).toFixed(0)}%;background:${item.col};border-radius:4px;transition:width .5s"></div></div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  setTimeout(() => {
    const c1 = document.getElementById('insChart1');
    if (c1) new Chart(c1, { type:'line', data:{ labels:months, datasets:[{label:'Avaliações',data:trendData,borderColor:'#1D9E75',backgroundColor:'rgba(29,158,117,.1)',fill:true,tension:.4,pointRadius:4}] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:false}} } });

    const c2 = document.getElementById('insChart2');
    if (c2) {
      const curr = t;
      const proj = months.map((_,i) => Math.round(curr * (1 + (i+1)*0.18)));
      new Chart(c2, { type:'bar', data:{ labels:['Atual','Mês 1','Mês 2','Mês 3','Mês 4','Mês 5','Mês 6'], datasets:[{label:'Sem gestão',data:[curr,...months.slice(0,6).map((_,i)=>Math.round(curr*(1+i*0.05)))],backgroundColor:'rgba(200,200,200,.5)',borderRadius:3},{label:'Com gestão',data:[curr,...proj],backgroundColor:'rgba(29,158,117,.7)',borderRadius:3}] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:false,grid:{color:'rgba(0,0,0,.05)'}},x:{grid:{display:false}}} } });
    }
  }, 100);
}

/* ===========================
   HISTORY
   =========================== */
function renderHistory() {
  const hist = APP.history.filter(h => APP.currentBiz ? h.biz===APP.currentBiz.name : true);
  const el = document.getElementById('hist_content');
  if (!APP.currentBiz) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div><div class="empty-title">Nenhum negócio selecionado</div><div>Faça uma busca para começar a rastrear o histórico.</div></div>'; return; }
  if (!hist.length) {
    el.innerHTML = `
      <div class="alert alert-info mb-2">💡 O histórico rastreia a evolução do perfil ao longo do tempo. Salve um snapshot agora e compare nas próximas visitas.</div>
      <div class="empty-state"><div class="empty-icon">📅</div><div class="empty-title">Sem snapshots salvos</div><div>Clique em "Salvar snapshot" para registrar o estado atual do perfil.</div></div>
    `;
    return;
  }

  el.innerHTML = `
    <div class="grid-2 mb-2">
      <div class="card">
        <div class="card-title mb-2"><span class="card-title-dot" style="background:var(--green)"></span>Evolução da nota</div>
        <div style="position:relative;height:160px"><canvas id="histChart" role="img" aria-label="Evolução histórica da nota do negócio">Evolução histórica.</canvas></div>
      </div>
      <div class="card">
        <div class="card-title mb-2"><span class="card-title-dot" style="background:var(--blue)"></span>Evolução do score de saúde</div>
        <div style="position:relative;height:160px"><canvas id="histScoreChart" role="img" aria-label="Evolução histórica do score de saúde">Evolução do score.</canvas></div>
      </div>
    </div>
    <div class="card">
      <div class="card-title mb-2"><span class="card-title-dot" style="background:var(--purple)"></span>Snapshots salvos</div>
      <div class="timeline">
        ${[...hist].reverse().map(h => `
          <div class="timeline-item">
            <div class="timeline-date">${new Date(h.date).toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'})}</div>
            <div class="timeline-content">
              <strong>${h.biz}</strong> — Nota: ${h.rating}★ · ${h.total} avaliações · ${h.photos} fotos · Score: ${h.score}/100
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  setTimeout(() => {
    const dates = hist.map(h => new Date(h.date).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}));
    const hc = document.getElementById('histChart');
    if (hc) new Chart(hc, { type:'line', data:{ labels:dates, datasets:[{label:'Nota',data:hist.map(h=>h.rating),borderColor:'#BA7517',backgroundColor:'rgba(186,117,23,.1)',fill:true,tension:.4}] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{min:0,max:5}} } });
    const sc = document.getElementById('histScoreChart');
    if (sc) new Chart(sc, { type:'line', data:{ labels:dates, datasets:[{label:'Score',data:hist.map(h=>h.score),borderColor:'#1D9E75',backgroundColor:'rgba(29,158,117,.1)',fill:true,tension:.4}] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{min:0,max:100}} } });
  }, 100);
}

function addHistorySnapshot() {
  if (!APP.currentBiz) return alert('Nenhum negócio selecionado.');
  const biz = APP.currentBiz;
  APP.history.push({ biz:biz.name, date:new Date().toISOString(), rating:biz.rating||0, total:biz.user_ratings_total||0, photos:biz.photos?.length||0, score:calcScore(biz) });
  localStorage.setItem('gbp_history', JSON.stringify(APP.history));
  renderHistory();
}

/* ===========================
   PROPOSAL
   =========================== */
function updateProposalPreview() {
  const el = document.getElementById('proposalPreview');
  const agency = document.getElementById('ag_name').value.trim() || 'Sua Agência';
  const contact = document.getElementById('ag_contact').value.trim() || 'Seu nome';
  const email = document.getElementById('ag_email').value.trim() || 'email@agencia.com';
  const phone = document.getElementById('ag_phone').value.trim() || '(11) 99999-9999';
  const price = document.getElementById('ag_price').value.trim();
  const msg = document.getElementById('ag_msg').value.trim();
  const biz = APP.currentBiz;
  const ai = APP.aiText;

  const opps = biz ? buildOpportunities(biz) : [];
  const score = biz ? calcScore(biz) : 0;
  const pitchText = msg || ai?.proposal_pitch || 'Identificamos importantes oportunidades de melhoria no perfil do seu negócio no Google. Com uma gestão profissional, podemos aumentar significativamente sua visibilidade local, atrair mais clientes e fortalecer sua reputação online.';

  el.innerHTML = `
    <div style="font-family:-apple-system,sans-serif;color:#1a1a1a">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:3px solid #1D9E75">
        <div>
          <div style="font-size:20px;font-weight:700;color:#1D9E75">${agency}</div>
          <div style="font-size:12px;color:#666;margin-top:3px">${contact} · ${email} · ${phone}</div>
        </div>
        <div style="text-align:right;font-size:11px;color:#999">
          <div style="font-weight:600;color:#1a1a1a">Proposta Comercial</div>
          <div>${new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'})}</div>
        </div>
      </div>

      ${biz?`<div style="margin-bottom:20px"><div style="font-size:10px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:#999;margin-bottom:6px">Para</div><div style="font-size:16px;font-weight:700">${biz.name}</div><div style="font-size:12px;color:#666">${biz.formatted_address||''}</div></div>`:``}

      <div style="background:#f5f5f3;border-radius:8px;padding:14px;margin-bottom:18px;font-size:13px;line-height:1.7;color:#333">${pitchText}</div>

      ${biz?`
      <div style="margin-bottom:18px">
        <div style="font-size:11px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:#999;margin-bottom:10px">Diagnóstico atual do perfil</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:12px;text-align:center">
          <div style="background:#f5f5f3;border-radius:6px;padding:10px"><div style="font-size:20px;font-weight:700;color:${(biz.rating||0)>=4?'#1D9E75':'#E24B4A'}">${biz.rating?biz.rating.toFixed(1):'N/A'}</div><div style="color:#666">Avaliação</div></div>
          <div style="background:#f5f5f3;border-radius:6px;padding:10px"><div style="font-size:20px;font-weight:700;color:#BA7517">${biz.user_ratings_total||0}</div><div style="color:#666">Reviews</div></div>
          <div style="background:#f5f5f3;border-radius:6px;padding:10px"><div style="font-size:20px;font-weight:700;color:${score>=70?'#1D9E75':score>=45?'#BA7517':'#E24B4A'}">${score}/100</div><div style="color:#666">Score</div></div>
        </div>
      </div>

      <div style="margin-bottom:18px">
        <div style="font-size:11px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:#999;margin-bottom:10px">Oportunidades identificadas</div>
        ${opps.slice(0,4).map(o=>`<div style="display:flex;gap:10px;margin-bottom:7px;font-size:12px"><span style="color:${o.p==='high'?'#E24B4A':o.p==='med'?'#BA7517':'#1D9E75'};font-weight:700">●</span><span><strong>${o.t}</strong> — ${o.d}</span></div>`).join('')}
      </div>`:``}

      ${price?`
      <div style="background:#EAF3DE;border-radius:8px;padding:14px;margin-bottom:18px">
        <div style="font-size:11px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:#3B6D11;margin-bottom:8px">Investimento</div>
        <div style="font-size:24px;font-weight:700;color:#1D9E75">R$ ${price}<span style="font-size:14px;font-weight:400;color:#3B6D11">/mês</span></div>
        <div style="font-size:12px;color:#3B6D11;margin-top:4px">Gestão profissional completa do Google Perfil da Empresa</div>
      </div>`:``}

      <div style="text-align:center;font-size:12px;color:#999;padding-top:14px;border-top:1px solid #eee">
        ${contact} · ${email} · ${phone}<br>${agency}
      </div>
    </div>
  `;
}

async function generateAIProposal() {
  if (!APP.cfg.claude) return alert('Configure a Claude API Key em Configurações primeiro.');
  if (!APP.currentBiz) return alert('Analise um negócio primeiro.');
  const btn = document.querySelector('#propAiBtn button');
  btn.disabled = true; btn.textContent = '⏳ Gerando...';
  const biz = APP.currentBiz;
  const score = calcScore(biz);
  const prompt = `Escreva um parágrafo curto (3-4 linhas) para uma proposta comercial de gestão de Google Meu Negócio. Endereçado ao proprietário de "${biz.name}" (${(biz.types||[]).slice(0,2).join(', ').replace(/_/g,' ')}). O perfil tem nota ${biz.rating||'N/A'} e ${biz.user_ratings_total||0} avaliações. Score de saúde: ${score}/100. Seja direto, profissional, focado nos benefícios concretos. Primeira pessoa como especialista. Português brasileiro. Sem markdown.`;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', { method:'POST', headers:{'Content-Type':'application/json','x-api-key':APP.cfg.claude,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'}, body:JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:300, messages:[{role:'user',content:prompt}] }) });
    const data = await res.json();
    if (data.content?.[0]?.text) { document.getElementById('ag_msg').value = data.content[0].text; updateProposalPreview(); }
  } catch(e) { alert('Erro ao gerar texto: ' + e.message); }
  btn.disabled = false; btn.textContent = '🤖 Gerar texto com IA';
}

async function downloadProposalPDF() {
  const agency = document.getElementById('ag_name').value.trim() || 'Agência';
  const contact = document.getElementById('ag_contact').value.trim() || '';
  const email = document.getElementById('ag_email').value.trim() || '';
  const phone = document.getElementById('ag_phone').value.trim() || '';
  const price = document.getElementById('ag_price').value.trim() || '';
  const msg = document.getElementById('ag_msg').value.trim();
  const biz = APP.currentBiz;
  const ai = APP.aiText;
  const score = biz ? calcScore(biz) : 0;
  const pitchText = msg || ai?.proposal_pitch || 'Identificamos importantes oportunidades de melhoria no perfil do seu negócio no Google.';

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
  const W = 210, M = 20, CW = W - M*2;
  let y = 20;

  const addPage = () => { doc.addPage(); y = 20; };
  const ck = (n=20) => { if(y+n>270) addPage(); };

  // Header
  doc.setFillColor(29,158,117);
  doc.rect(0,0,W,50,'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(22); doc.setFont('helvetica','bold');
  doc.text(agency, M, 22);
  doc.setFontSize(10); doc.setFont('helvetica','normal');
  doc.text('Proposta Comercial · ' + new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'}), M, 30);
  doc.text([contact, email, phone].filter(Boolean).join(' · '), M, 38);
  doc.setFontSize(9); doc.setTextColor(200,255,230);
  doc.text('Google Business Profile — Gestão Profissional', M, 46);

  y = 62;
  doc.setTextColor(0,0,0);

  if (biz) {
    doc.setFillColor(245,245,243); doc.roundedRect(M,y,CW,26,3,3,'F');
    doc.setFontSize(7); doc.setFont('helvetica','bold'); doc.setTextColor(120,120,120);
    doc.text('PARA', M+5, y+7);
    doc.setFontSize(14); doc.setFont('helvetica','bold'); doc.setTextColor(20,20,20);
    doc.text(biz.name, M+5, y+14);
    doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(100,100,100);
    doc.text((biz.formatted_address||'').slice(0,80), M+5, y+21);
    y += 34;

    // Metrics
    const cols = CW/3;
    const metrics = [ {l:'Avaliação atual',v:biz.rating?biz.rating.toFixed(1)+' ★':'N/A',c:[(biz.rating||0)>=4?[29,158,117]:[226,75,74]][0]}, {l:'Nº de avaliações',v:(biz.user_ratings_total||0).toLocaleString('pt-BR'),c:[186,117,23]}, {l:'Score de saúde',v:score+'/100',c:score>=70?[29,158,117]:score>=45?[186,117,23]:[226,75,74]} ];
    metrics.forEach((m,i) => {
      const x = M + i*cols;
      doc.setFillColor(248,248,246); doc.roundedRect(x,y,cols-4,20,2,2,'F');
      doc.setFontSize(7); doc.setFont('helvetica','normal'); doc.setTextColor(120,120,120);
      doc.text(m.l, x+(cols-4)/2, y+6, {align:'center'});
      doc.setFontSize(14); doc.setFont('helvetica','bold'); doc.setTextColor(...m.c);
      doc.text(m.v, x+(cols-4)/2, y+15, {align:'center'});
    });
    y += 28;
  }

  // Pitch
  ck(30);
  const pitchLines = doc.splitTextToSize(pitchText, CW-8);
  const pH = pitchLines.length*5+10;
  doc.setFillColor(241,239,232); doc.roundedRect(M,y,CW,pH,3,3,'F');
  doc.setFontSize(10); doc.setFont('helvetica','normal'); doc.setTextColor(40,40,40);
  doc.text(pitchLines, M+4, y+8);
  y += pH+10;

  // Opportunities
  if (biz) {
    ck(30);
    doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(0,0,0);
    doc.text('Oportunidades identificadas', M, y); y+=7;
    doc.setDrawColor(226,75,74); doc.line(M,y,M+CW,y); y+=6;
    buildOpportunities(biz).slice(0,5).forEach(o => {
      ck(16);
      const col = o.p==='high'?[226,75,74]:o.p==='med'?[186,117,23]:[29,158,117];
      doc.setFillColor(...col); doc.roundedRect(M,y,2,10,0,0,'F');
      doc.setFontSize(10); doc.setFont('helvetica','bold'); doc.setTextColor(20,20,20);
      doc.text(o.t, M+6, y+5);
      doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(80,80,80);
      doc.text(o.d.slice(0,90), M+6, y+10);
      y+=16;
    });
    y += 4;
  }

  // Price
  if (price) {
    ck(28);
    doc.setFillColor(234,243,222); doc.roundedRect(M,y,CW,28,3,3,'F');
    doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(59,109,17);
    doc.text('INVESTIMENTO MENSAL', M+6, y+8);
    doc.setFontSize(22); doc.setFont('helvetica','bold'); doc.setTextColor(29,158,117);
    doc.text('R$ '+price, M+6, y+20);
    doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(59,109,17);
    doc.text('/mês · Gestão profissional completa do Google Perfil da Empresa', M+6+doc.getTextWidth('R$ '+price)+4, y+20);
    y += 36;
  }

  // AI analysis
  if (APP.aiText?.strengths) {
    ck(40);
    doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(0,0,0);
    doc.text('Análise técnica do perfil', M, y); y+=7;
    doc.setDrawColor(127,119,221); doc.line(M,y,M+CW,y); y+=6;
    if (APP.aiText.strengths.length) {
      doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(29,158,117);
      doc.text('Pontos fortes:', M, y); y+=5;
      APP.aiText.strengths.forEach(s => { ck(7); doc.setFont('helvetica','normal'); doc.setTextColor(40,40,40); doc.text('✓ '+s, M+4, y); y+=6; });
      y+=2;
    }
    if (APP.aiText.problems?.length) {
      doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(226,75,74);
      doc.text('Problemas a corrigir:', M, y); y+=5;
      APP.aiText.problems.forEach(s => { ck(7); doc.setFont('helvetica','normal'); doc.setTextColor(40,40,40); doc.text('• '+s, M+4, y); y+=6; });
    }
    y += 6;
  }

  // Footer
  const pages = doc.getNumberOfPages();
  for (let p=1;p<=pages;p++) {
    doc.setPage(p);
    doc.setFillColor(29,158,117); doc.rect(0,287,W,10,'F');
    doc.setFontSize(7); doc.setTextColor(255,255,255);
    doc.text(agency+' · '+email+' · '+phone, M, 293);
    doc.text('Página '+p+'/'+pages, W-M, 293, {align:'right'});
  }

  const safeName = (biz?.name||'negocio').replace(/[^a-zA-Z0-9]/g,'_').slice(0,25);
  doc.save(`Proposta_${agency.replace(/[^a-zA-Z0-9]/g,'_').slice(0,20)}_${safeName}.pdf`);
}

/* ===========================
   FULL REPORT PDF
   =========================== */
function generatePDF() {
  if (!APP.currentBiz) return alert('Analise um negócio primeiro.');
  const biz = APP.currentBiz;
  const score = calcScore(biz);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
  const W=210,M=20,CW=W-M*2;
  let y=20;
  const addPage=()=>{doc.addPage();y=20;};
  const ck=(n=20)=>{if(y+n>272)addPage();};

  // Cover
  doc.setFillColor(17,17,17); doc.rect(0,0,W,297,'F');
  doc.setFillColor(29,158,117); doc.circle(W/2, 100, 55,'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(28); doc.setFont('helvetica','bold');
  const nameLines = doc.splitTextToSize(biz.name, 160);
  nameLines.forEach((l,i) => doc.text(l,W/2,170+i*10,{align:'center'}));
  doc.setFontSize(13); doc.setFont('helvetica','normal'); doc.setTextColor(200,200,200);
  doc.text('Relatório de Diagnóstico Google Business Profile',W/2,170+nameLines.length*10+10,{align:'center'});
  doc.setFontSize(10); doc.setTextColor(120,120,120);
  doc.text('GBP Pro · '+new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'}),W/2,255,{align:'center'});

  // Score on cover
  const sC = scoreColor(score);
  doc.setFillColor(...sC.replace('#','').match(/.{2}/g).map(h=>parseInt(h,16)));
  doc.circle(W/2,100,40,'F');
  doc.setTextColor(255,255,255); doc.setFontSize(32); doc.setFont('helvetica','bold');
  doc.text(String(score),W/2,106,{align:'center'});
  doc.setFontSize(10); doc.setFont('helvetica','normal');
  doc.text('/100',W/2,115,{align:'center'});
  doc.text(scoreLabel(score),W/2,123,{align:'center'});

  addPage();
  doc.setTextColor(0,0,0);

  // Business info
  doc.setFillColor(29,158,117); doc.rect(0,0,W,14,'F');
  doc.setTextColor(255,255,255); doc.setFontSize(10); doc.setFont('helvetica','bold');
  doc.text('INFORMAÇÕES DO NEGÓCIO', M, 9);

  y = 22;
  doc.setTextColor(0,0,0);
  doc.setFontSize(16); doc.setFont('helvetica','bold');
  doc.text(biz.name, M, y); y+=8;
  doc.setFontSize(10); doc.setFont('helvetica','normal'); doc.setTextColor(100,100,100);
  doc.text((biz.types||[]).slice(0,3).join(' · ').replace(/_/g,' '), M, y); y+=6;
  doc.text(biz.formatted_address||'', M, y); y+=10;

  // Metric boxes
  const mData = [
    { l:'Avaliação',v:biz.rating?biz.rating.toFixed(1)+' ★':'N/A',c:(biz.rating||0)>=4?[29,158,117]:[226,75,74] },
    { l:'Avaliações',v:(biz.user_ratings_total||0).toLocaleString('pt-BR'),c:[186,117,23] },
    { l:'Fotos',v:String(biz.photos?.length||0),c:(biz.photos?.length||0)>=10?[29,158,117]:[186,117,23] },
    { l:'Score',v:score+'/100',c:scoreColor(score).replace('#','').match(/.{2}/g).map(h=>parseInt(h,16)) }
  ];
  const cs = CW/4;
  mData.forEach((m,i) => {
    const x = M+i*cs;
    doc.setFillColor(245,245,243); doc.roundedRect(x,y,cs-3,18,2,2,'F');
    doc.setFontSize(7); doc.setFont('helvetica','normal'); doc.setTextColor(120,120,120);
    doc.text(m.l, x+(cs-3)/2, y+6, {align:'center'});
    doc.setFontSize(13); doc.setFont('helvetica','bold'); doc.setTextColor(...(Array.isArray(m.c)?m.c:m.c.replace('#','').match(/.{2}/g).map(h=>parseInt(h,16))));
    doc.text(m.v, x+(cs-3)/2, y+14, {align:'center'});
  }); y+=24;

  // Checklist
  doc.setFontSize(12); doc.setFont('helvetica','bold'); doc.setTextColor(0,0,0);
  doc.text('Checklist de Otimização', M, y); y+=7;
  doc.setDrawColor(29,158,117); doc.setLineWidth(0.5); doc.line(M,y,M+CW,y); y+=5;

  const checks = [
    {l:'Avaliação ≥ 4★',ok:(biz.rating||0)>=4,w:(biz.rating||0)>=3,v:biz.rating?biz.rating.toFixed(1)+' ★':'N/A'},
    {l:'Avaliações ≥ 50',ok:(biz.user_ratings_total||0)>=50,w:(biz.user_ratings_total||0)>=20,v:(biz.user_ratings_total||0)+' avaliações'},
    {l:'Telefone',ok:!!biz.formatted_phone_number,v:biz.formatted_phone_number||'Não cadastrado'},
    {l:'Website',ok:!!biz.website,v:biz.website?'Cadastrado':'Não cadastrado'},
    {l:'Horários',ok:!!biz.opening_hours,v:biz.opening_hours?'Cadastrado':'Não cadastrado'},
    {l:'Fotos (≥10)',ok:(biz.photos?.length||0)>=10,w:(biz.photos?.length||0)>=3,v:(biz.photos?.length||0)+' fotos'},
    {l:'Perfil ativo',ok:biz.business_status==='OPERATIONAL',v:biz.business_status==='OPERATIONAL'?'Operacional':(biz.business_status||'?')},
  ];
  checks.forEach(c => {
    ck(10);
    const col=c.ok?[29,158,117]:c.w?[186,117,23]:[226,75,74];
    const sym=c.ok?'✓':c.w?'!':'✗';
    doc.setFillColor(...col); doc.circle(M+3,y+1.5,3,'F');
    doc.setTextColor(255,255,255); doc.setFontSize(7); doc.setFont('helvetica','bold');
    doc.text(sym,M+3,y+2.5,{align:'center'});
    doc.setFontSize(10); doc.setFont('helvetica','normal'); doc.setTextColor(20,20,20);
    doc.text(c.l, M+9, y+3);
    doc.setTextColor(100,100,100); doc.setFontSize(9);
    doc.text(c.v, M+CW, y+3, {align:'right'});
    y+=8;
  }); y+=4;

  // Opportunities
  ck(30); doc.setFontSize(12); doc.setFont('helvetica','bold'); doc.setTextColor(0,0,0);
  doc.text('Oportunidades', M, y); y+=7;
  doc.setDrawColor(226,75,74); doc.line(M,y,M+CW,y); y+=5;
  buildOpportunities(biz).forEach(o => {
    ck(16);
    const col=o.p==='high'?[226,75,74]:o.p==='med'?[186,117,23]:[29,158,117];
    doc.setFillColor(...col); doc.roundedRect(M,y,2,11,0,0,'F');
    doc.setFontSize(10); doc.setFont('helvetica','bold'); doc.setTextColor(20,20,20);
    doc.text(o.t, M+6, y+5);
    doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(80,80,80);
    doc.text(o.d.slice(0,95), M+6, y+10);
    y+=15;
  }); y+=4;

  // AI
  if (APP.aiText) {
    const ai = APP.aiText;
    ck(30); doc.setFontSize(12); doc.setFont('helvetica','bold'); doc.setTextColor(0,0,0);
    doc.text('Diagnóstico por IA', M, y); y+=7;
    doc.setDrawColor(127,119,221); doc.line(M,y,M+CW,y); y+=5;
    if (ai.score_comment) { ck(10); doc.setFontSize(10); doc.setFont('helvetica','italic'); doc.setTextColor(60,50,180); doc.text('"'+ai.score_comment+'"',M,y); y+=8; }
    if (ai.strengths?.length) {
      ck(10); doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(29,158,117);
      doc.text('Pontos fortes:', M, y); y+=5;
      ai.strengths.forEach(s=>{ck(6);doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(40,40,40);doc.text('✓ '+s,M+4,y);y+=5;});
      y+=2;
    }
    if (ai.problems?.length) {
      ck(10); doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(226,75,74);
      doc.text('Problemas:', M, y); y+=5;
      ai.problems.forEach(s=>{ck(6);doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(40,40,40);doc.text('• '+s,M+4,y);y+=5;});
      y+=2;
    }
  }

  // Reviews
  const reviews = biz.reviews||[];
  if (reviews.length) {
    ck(30); doc.setFontSize(12); doc.setFont('helvetica','bold'); doc.setTextColor(0,0,0);
    doc.text('Avaliações recentes', M, y); y+=7;
    doc.setDrawColor(186,117,23); doc.line(M,y,M+CW,y); y+=5;
    reviews.slice(0,4).forEach(rv => {
      const txt = (rv.text||'Sem texto').slice(0,200);
      const lines = doc.splitTextToSize(txt,CW-10);
      const h = lines.length*4.5+14;
      ck(h+4); doc.setFillColor(250,250,248); doc.roundedRect(M,y,CW,h,2,2,'F');
      doc.setFontSize(10); doc.setTextColor(186,117,23); doc.setFont('helvetica','bold');
      doc.text('★'.repeat(rv.rating)+'☆'.repeat(5-rv.rating), M+4, y+6);
      doc.setFontSize(8); doc.setTextColor(80,80,80); doc.setFont('helvetica','normal');
      doc.text((rv.author_name||'Anônimo')+(rv.relative_time_description?' · '+rv.relative_time_description:''), M+4, y+11);
      doc.setFontSize(9); doc.setTextColor(30,30,30);
      doc.text(lines, M+4, y+17); y+=h+4;
    });
  }

  // Footer
  const pages=doc.getNumberOfPages();
  for(let p=1;p<=pages;p++){
    doc.setPage(p);
    doc.setFillColor(245,245,243); doc.rect(0,287,W,10,'F');
    doc.setFontSize(7); doc.setTextColor(160,160,160); doc.setFont('helvetica','normal');
    doc.text('GBP Pro · Análise baseada em dados públicos do Google Places', M, 293);
    doc.text('Pág. '+p+'/'+pages, W-M, 293, {align:'right'});
  }

  doc.save('Relatorio_GBP_'+biz.name.replace(/[^a-zA-Z0-9]/g,'_').slice(0,30)+'.pdf');
}

/* ===========================
   CLIENTS MANAGEMENT
   =========================== */
function saveClient(biz) {
  const existing = APP.clients.findIndex(c => c.place_id === biz.place_id);
  const entry = { name:biz.name, place_id:biz.place_id, address:biz.formatted_address, rating:biz.rating, total:biz.user_ratings_total, score:calcScore(biz), savedAt:new Date().toISOString() };
  if (existing >= 0) APP.clients[existing] = entry;
  else APP.clients.unshift(entry);
  APP.clients = APP.clients.slice(0, 20);
  localStorage.setItem('gbp_clients', JSON.stringify(APP.clients));
}

function renderManageList() {
  const el = document.getElementById('manage_list');
  if (!APP.clients.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">👥</div><div class="empty-title">Nenhum cliente salvo</div><div>Clientes são salvos automaticamente após cada análise.</div></div>';
    return;
  }
  el.innerHTML = APP.clients.map(c => `
    <div class="biz-list-item" onclick="loadSavedClient('${c.place_id}')">
      <div class="biz-avatar">${c.name.charAt(0).toUpperCase()}</div>
      <div style="flex:1">
        <div class="biz-list-name">${c.name}</div>
        <div class="biz-list-sub">${(c.address||'').split(',').slice(-2).join(',').trim()}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:13px;font-weight:700;color:${c.rating>=4?'var(--green)':c.rating>=3?'var(--amber)':'var(--red)'}">${c.rating?c.rating.toFixed(1)+' ★':'N/A'}</div>
        <div style="font-size:11px;color:var(--text2)">${c.total||0} reviews</div>
        <div style="font-size:10px;color:var(--text3)">Score: ${c.score}/100</div>
      </div>
    </div>
  `).join('');
}

function loadSavedClient(place_id) {
  const client = APP.clients.find(c => c.place_id === place_id);
  if (client && APP.currentBiz?.place_id === place_id) { goPage('dashboard'); return; }
  document.getElementById('s_bizName').value = client.name;
  document.getElementById('s_bizCity').value = '';
  goPage('setup');
}

function clearAllData() {
  if (!confirm('Apagar todos os clientes e histórico salvos?')) return;
  localStorage.removeItem('gbp_history'); localStorage.removeItem('gbp_clients');
  APP.history = []; APP.clients = [];
  renderManageList(); renderHistory();
  alert('Dados apagados.');
}
