/**
 * metricas.js — Embudo, Objetivos, Planilla
 */
const MET = { objetivos: {}, planilla: [], periodo: 'mensual', chartInst: null };

async function initMetricas() {
  await Promise.all([
    cargarObjetivos(),
    cargarPlanilla(),
    cargarDatosEmbudo(),
  ]);
}

function switchMetTab(tab, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  ['tabEmbudo','tabObjetivos','tabPlanilla'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === 'tab' + tab.charAt(0).toUpperCase() + tab.slice(1) ? '' : 'none';
  });
}

// ── EMBUDO — con Listing (#23) ──
async function cargarDatosEmbudo() {
  try {
    const [propData, leadsData, cierresData] = await Promise.all([
      apiGet('/api/propiedades').catch(() => ({ propiedades: [] })),
      apiGet('/api/consultas').catch(() => ({ consultas: [] })),
      apiGet('/api/cierres').catch(() => ({ cierres: [] })),
    ]);
    const props   = propData.propiedades || [];
    const leads   = leadsData.consultas  || [];
    const cierres = cierresData.cierres  || [];

    // Embudo con Listing (#23)
    const totalCartera  = props.length;
    const listingRealiz = props.filter(p => {
      const est = (p.estado_tasacion || p.estadio || '').toLowerCase();
      return ['captado','publicado','reservado','cerrado'].includes(est);
    }).length;
    const publicadas    = props.filter(p => ['publicado','reservado','cerrado'].includes((p.estado_tasacion||'').toLowerCase())).length;
    const visitas       = leads.filter(l => ['visito','visitó','Visitó'].includes(l.estado));

    const pasos = [
      { label: 'Propiedades',   num: totalCartera,  icon: '🏘️', desc: 'En cartera' },
      { label: 'Listing',       num: listingRealiz, icon: '📋', desc: 'Captadas/Publicadas' },
      { label: 'Publicadas',    num: publicadas,    icon: '🟢', desc: 'Activas en mercado' },
      { label: 'Consultas',     num: leads.length,  icon: '🔍', desc: 'Leads entrantes' },
      { label: 'Visitas',       num: visitas.length,icon: '👁️', desc: 'Visitaron' },
      { label: 'Cierres',       num: cierres.length,icon: '✅', desc: 'Operaciones cerradas' },
    ];

    const grid = document.getElementById('embudoGrid');
    if (grid) {
      grid.innerHTML = pasos.map((p, i) => {
        const pct = i > 0 && pasos[i-1].num > 0 ? Math.round(p.num / pasos[i-1].num * 100) : null;
        return `
          <div class="embudo-step ${i === 0 ? 'active' : ''}">
            <div style="font-size:1.2rem;margin-bottom:4px;">${p.icon}</div>
            <div class="embudo-num">${p.num}</div>
            <div class="embudo-label">${p.label}</div>
            <div style="font-size:0.65rem;color:#aaa;margin-top:2px;">${p.desc}</div>
            ${pct !== null ? `<div class="embudo-pct">${pct}%</div>` : ''}
          </div>`;
      }).join('');
    }
    renderEmbudoChart(pasos);
  } catch (e) { console.error(e); }
}

function renderEmbudoChart(pasos) {
  const canvas = document.getElementById('embudoChart');
  if (!canvas || typeof Chart === 'undefined') return;
  if (MET.chartInst) MET.chartInst.destroy();
  MET.chartInst = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: pasos.map(p => p.label),
      datasets: [{
        data: pasos.map(p => p.num),
        backgroundColor: ['#1B3FE4CC','#2B54F5AA','#4B7FF088','#6B9FF366','#8BBFF644'],
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1 } },
        x: { grid: { display: false } }
      }
    }
  });
}

// ── OBJETIVOS ──
async function cargarObjetivos() {
  try {
    const data = await apiGet('/api/objetivos');
    MET.objetivos = data.objetivos || {};
    renderObjetivos();
  } catch (e) { console.error(e); }
}

const MET_PERIODOS = [
  { key: 'trimestre',    label: 'TRIMESTRE' },
  { key: 'cuatrimestre', label: 'CUATRIMESTRE' },
  { key: 'semestre',     label: 'SEMESTRE' },
  { key: 'anual',        label: 'ANUAL' },
];

function renderObjetivos() {
  const container = document.getElementById('objetivosGrid');
  if (!container) return;
  const campos = [
    { key: 'consultas', label: 'Consultas',    icon: '🔍' },
    { key: 'visitas',   label: 'Visitas',      icon: '👁️' },
    { key: 'cierres',   label: 'Cierres',      icon: '✅' },
    { key: 'comision',  label: 'Comisión USD', icon: '💰' },
  ];

  container.innerHTML = MET_PERIODOS.map(p => {
    const obj = MET.objetivos[p.key] || {};
    const cardsHtml = campos.map(c => {
      const meta     = parseFloat(obj[c.key] || 0);
      const progreso = parseFloat(obj[c.key + '_progreso'] || 0);
      const pct      = meta > 0 ? Math.min(100, Math.round(progreso / meta * 100)) : 0;
      const color    = pct >= 100 ? 'var(--success,#059669)' : 'var(--rx-blue,#2563EB)';
      return `
        <div class="card" style="padding:14px;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
            <span style="font-size:1rem;">${c.icon}</span>
            <span style="font-size:0.8rem;font-weight:600;">${c.label}</span>
          </div>
          <div style="font-size:1.3rem;font-weight:700;color:var(--rx-blue);margin-bottom:2px;">${progreso.toLocaleString('es-AR')}</div>
          <div style="font-size:0.7rem;color:#888;margin-bottom:6px;">Meta: ${meta.toLocaleString('es-AR')}</div>
          <div style="height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:${color};border-radius:3px;transition:width 0.4s;"></div>
          </div>
          <div style="font-size:0.68rem;color:#888;margin-top:3px;">${pct}%</div>
        </div>`;
    }).join('');

    return `
      <div style="margin-bottom:28px;">
        <div style="font-size:0.95rem;font-weight:700;color:#374151;letter-spacing:0.5px;margin-bottom:12px;padding-bottom:6px;border-bottom:2px solid var(--border);">
          ${p.label}
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin-bottom:10px;">
          ${cardsHtml}
        </div>
        <button onclick="abrirEditarObjetivos('${p.key}')"
          style="font-size:0.78rem;padding:5px 14px;border-radius:8px;border:none;background:var(--rx-blue);color:white;cursor:pointer;font-weight:600;">
          ✏️ Editar objetivos
        </button>
      </div>`;
  }).join('');
}

function abrirEditarObjetivos(periodo) {
  MET.periodo = periodo;
  const obj = MET.objetivos[periodo] || {};
  const campos = ['consultas','visitas','cierres','comision'];
  const labelMap = { consultas:'Consultas', visitas:'Visitas', cierres:'Cierres', comision:'Comisión USD' };
  const html = campos.map(c => `
    <div class="field">
      <label class="field-label">${labelMap[c]}</label>
      <input type="number" id="obj_${c}" class="input-base" value="${obj[c] || ''}">
    </div>
  `).join('');
  const existing = document.getElementById('modalObjetivos');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.className = 'modal-bg open';
  modal.id = 'modalObjetivos';
  const periodoLabel = MET_PERIODOS.find(p => p.key === periodo)?.label || periodo;
  modal.innerHTML = `
    <div class="modal" style="max-width:400px;">
      <div class="modal-header">
        <h3>Editar objetivos — ${periodoLabel}</h3>
        <button class="modal-close" onclick="cerrarModal('modalObjetivos')">✕</button>
      </div>
      <div class="modal-body" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">${html}</div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="cerrarModal('modalObjetivos')">Cancelar</button>
        <button class="btn-primary" onclick="guardarObjetivos()">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function guardarObjetivos() {
  const campos = ['consultas','visitas','cierres','comision'];
  const obj = MET.objetivos[MET.periodo] || {};
  campos.forEach(c => {
    const v = document.getElementById('obj_' + c)?.value;
    if (v !== undefined) obj[c] = parseFloat(v) || 0;
  });
  MET.objetivos[MET.periodo] = obj;
  try {
    await apiPost('/api/objetivos', { data: MET.objetivos });
    cerrarModal('modalObjetivos');
    showToast('Objetivos guardados');
    renderObjetivos();
  } catch (e) { showToast(e.message, 'error'); }
}

// ── PLANILLA ──
async function cargarPlanilla() {
  try {
    const data = await apiGet('/api/planilla');
    MET.planilla = data.planilla || [];
    renderPlanilla();
  } catch (e) { console.error(e); }
}

function renderPlanilla() {
  const container = document.getElementById('planillaTable');
  if (!container) return;
  if (MET.planilla.length === 0) {
    container.innerHTML = `<div class="empty-state">No hay semanas cargadas. Agregá la primera semana.</div>`;
    return;
  }
  container.innerHTML = `
    <table class="table">
      <thead><tr>
        <th>Semana</th><th>Consultas</th><th>Visitas</th><th>Ofertas</th><th>Cierres</th><th>Comisión</th>
        <th style="text-align:right">Acciones</th>
      </tr></thead>
      <tbody>
        ${MET.planilla.map((s, i) => `
          <tr>
            <td>${escHtml(s.semana || `Semana ${i+1}`)}</td>
            <td>${s.consultas || 0}</td>
            <td>${s.visitas || 0}</td>
            <td>${s.ofertas || 0}</td>
            <td>${s.cierres || 0}</td>
            <td>${s.comision ? 'USD ' + parseFloat(s.comision).toLocaleString('es-AR') : '—'}</td>
            <td style="text-align:right;">
              <button class="btn-icon-sm danger" onclick="eliminarSemana(${i})">🗑️</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
}

function agregarSemana() {
  const ahora = new Date();
  const semana = `Semana del ${ahora.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}`;
  const existing = document.getElementById('modalSemana');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.className = 'modal-bg open';
  modal.id = 'modalSemana';
  modal.innerHTML = `
    <div class="modal" style="max-width:420px;">
      <div class="modal-header">
        <h3>Nueva semana</h3>
        <button class="modal-close" onclick="cerrarModal('modalSemana')">✕</button>
      </div>
      <div class="modal-body" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="field" style="grid-column:span 2">
          <label class="field-label">Período</label>
          <input type="text" id="semPeriodo" class="input-base" value="${semana}">
        </div>
        <div class="field"><label class="field-label">Consultas</label><input type="number" id="semConsultas" class="input-base" value="0"></div>
        <div class="field"><label class="field-label">Visitas</label><input type="number" id="semVisitas" class="input-base" value="0"></div>
        <div class="field"><label class="field-label">Ofertas</label><input type="number" id="semOfertas" class="input-base" value="0"></div>
        <div class="field"><label class="field-label">Cierres</label><input type="number" id="semCierres" class="input-base" value="0"></div>
        <div class="field" style="grid-column:span 2">
          <label class="field-label">Comisión USD</label>
          <input type="number" id="semComision" class="input-base" value="0">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="cerrarModal('modalSemana')">Cancelar</button>
        <button class="btn-primary" onclick="guardarSemana()">Guardar semana</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function guardarSemana() {
  const semana = {
    semana: document.getElementById('semPeriodo').value,
    consultas: parseInt(document.getElementById('semConsultas').value) || 0,
    visitas: parseInt(document.getElementById('semVisitas').value) || 0,
    ofertas: parseInt(document.getElementById('semOfertas').value) || 0,
    cierres: parseInt(document.getElementById('semCierres').value) || 0,
    comision: parseFloat(document.getElementById('semComision').value) || 0,
  };
  MET.planilla.push(semana);
  try {
    await apiPost('/api/planilla', { data: MET.planilla });
    cerrarModal('modalSemana');
    showToast('Semana guardada');
    renderPlanilla();
  } catch (e) { showToast(e.message, 'error'); }
}

async function eliminarSemana(idx) {
  if (!confirmar('¿Eliminar esta semana?')) return;
  MET.planilla.splice(idx, 1);
  try {
    await apiPost('/api/planilla', { data: MET.planilla });
    showToast('Semana eliminada');
    renderPlanilla();
  } catch (e) { showToast(e.message, 'error'); }
}
