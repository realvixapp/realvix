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

// ── EMBUDO ──
async function cargarDatosEmbudo() {
  try {
    const [propData, leadsData, cierresData] = await Promise.all([
      apiGet('/api/propiedades').catch(() => ({ propiedades: [] })),
      apiGet('/api/consultas').catch(() => ({ consultas: [] })),
      apiGet('/api/cierres').catch(() => ({ cierres: [] })),
    ]);
    const props = propData.propiedades || [];
    const leads = leadsData.consultas || [];
    const cierres = cierresData.cierres || [];
    const visitas = leads.filter(l => ['visito','visitó','Visitó'].includes(l.estado));

    const pasos = [
      { label: 'Propiedades', num: props.length, icon: '🏢' },
      { label: 'Consultas', num: leads.length, icon: '🔍' },
      { label: 'Visitas', num: visitas.length, icon: '👁️' },
      { label: 'Ofertas', num: Math.round(visitas.length * 0.4), icon: '📋' },
      { label: 'Cierres', num: cierres.length, icon: '✅' },
    ];

    const grid = document.getElementById('embudoGrid');
    if (grid) {
      grid.innerHTML = pasos.map((p, i) => `
        <div class="embudo-step ${i === 0 ? 'active' : ''}">
          <div style="font-size:1.2rem;margin-bottom:4px;">${p.icon}</div>
          <div class="embudo-num">${p.num}</div>
          <div class="embudo-label">${p.label}</div>
          ${i > 0 ? `<div class="embudo-pct">${pasos[i-1].num > 0 ? Math.round(p.num / pasos[i-1].num * 100) + '%' : '—'}</div>` : ''}
        </div>
      `).join('');
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

// ── OBJETIVOS — 4 períodos simultáneos con edición individual (#21 #22) ──
async function cargarObjetivos() {
  try {
    const data = await apiGet('/api/objetivos');
    MET.objetivos = data.objetivos || {};
    renderObjetivos();
  } catch (e) { console.error(e); }
}

const PERIODOS_OBJ = [
  { key: 'trimestre',    label: 'TRIMESTRE'    },
  { key: 'cuatrimestre', label: 'CUATRIMESTRE' },
  { key: 'semestre',     label: 'SEMESTRE'     },
  { key: 'anual',        label: 'ANUAL'        },
];

const CAMPOS_OBJ = [
  { key: 'consultas', label: 'Consultas',   icon: '🔍' },
  { key: 'visitas',   label: 'Visitas',     icon: '👁️' },
  { key: 'cierres',   label: 'Cierres',     icon: '✅' },
  { key: 'comision',  label: 'Comisión USD',icon: '💰' },
];

function renderObjetivos() {
  const container = document.getElementById('objetivosGrid');
  if (!container) return;

  container.innerHTML = PERIODOS_OBJ.map(periodo => {
    const obj = MET.objetivos[periodo.key] || {};
    const cardsHtml = CAMPOS_OBJ.map(c => {
      const meta     = parseFloat(obj[c.key] || 0);
      const progreso = parseFloat(obj[c.key + '_progreso'] || 0);
      const pct      = meta > 0 ? Math.min(100, Math.round(progreso / meta * 100)) : 0;
      const colorBar = pct >= 100 ? '#059669' : pct >= 60 ? '#D97706' : '#2563EB';
      return `
        <div class="card" style="padding:14px;position:relative;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="font-size:1rem;">${c.icon}</span>
              <span style="font-size:0.8rem;font-weight:600;">${c.label}</span>
            </div>
            <button onclick="editarObjetivoIndividual('${periodo.key}','${c.key}')"
              style="font-size:0.68rem;padding:2px 8px;border-radius:6px;border:1px solid #e5e7eb;background:white;cursor:pointer;color:#666;" title="Editar meta">✏️ editar</button>
          </div>
          <div style="font-size:1.3rem;font-weight:700;color:#2563EB;">${progreso.toLocaleString('es-AR')}</div>
          <div style="font-size:0.7rem;color:#888;margin-bottom:6px;">Meta: ${meta.toLocaleString('es-AR')}</div>
          <div style="height:7px;background:#e5e7eb;border-radius:4px;overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:${colorBar};border-radius:4px;transition:width 0.4s;"></div>
          </div>
          <div style="font-size:0.68rem;color:${colorBar};margin-top:3px;font-weight:600;">${pct}%</div>
        </div>`;
    }).join('');

    return `
      <div style="margin-bottom:28px;">
        <div style="font-size:0.85rem;font-weight:700;color:#374151;letter-spacing:1px;text-transform:uppercase;margin-bottom:10px;
          padding-bottom:6px;border-bottom:2px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;">
          <span>${periodo.label}</span>
          <button onclick="editarObjetivoPeriodo('${periodo.key}')"
            style="font-size:0.72rem;padding:3px 10px;border-radius:8px;border:1px solid #e5e7eb;background:white;cursor:pointer;color:#2563EB;font-weight:600;">
            ✏️ Editar todos
          </button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px;">
          ${cardsHtml}
        </div>
      </div>`;
  }).join('');
}

// Editar un objetivo individual (#22)
function editarObjetivoIndividual(periodo, campo) {
  const obj   = MET.objetivos[periodo] || {};
  const campoInfo = CAMPOS_OBJ.find(c => c.key === campo);
  const label = campoInfo ? campoInfo.label : campo;
  const val   = obj[campo] || '';

  const existing = document.getElementById('modalObjetivoInd');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.className = 'modal-bg open';
  modal.id = 'modalObjetivoInd';
  modal.innerHTML = `
    <div class="modal" style="max-width:340px;">
      <div class="modal-header">
        <h3>Editar meta — ${label}</h3>
        <button class="modal-close" onclick="document.getElementById('modalObjetivoInd').remove()">✕</button>
      </div>
      <div class="modal-body">
        <div style="font-size:0.78rem;color:#888;margin-bottom:10px;">Período: <strong style="color:#2563EB;text-transform:uppercase;">${periodo}</strong></div>
        <div class="field">
          <label class="field-label">${label} — meta</label>
          <input type="number" id="objIndValor" class="input-base" value="${val}" placeholder="0">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="document.getElementById('modalObjetivoInd').remove()">Cancelar</button>
        <button class="btn-primary" onclick="guardarObjetivoIndividual('${periodo}','${campo}')">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  setTimeout(() => document.getElementById('objIndValor')?.focus(), 100);
}

async function guardarObjetivoIndividual(periodo, campo) {
  const val = parseFloat(document.getElementById('objIndValor')?.value) || 0;
  if (!MET.objetivos[periodo]) MET.objetivos[periodo] = {};
  MET.objetivos[periodo][campo] = val;
  try {
    await apiPost('/api/objetivos', { data: MET.objetivos });
    document.getElementById('modalObjetivoInd')?.remove();
    showToast('Meta guardada ✓');
    renderObjetivos();
  } catch (e) { showToast(e.message, 'error'); }
}

// Editar todos los del período (mantiene comportamiento anterior)
function editarObjetivoPeriodo(periodo) {
  const obj = MET.objetivos[periodo] || {};
  const html = CAMPOS_OBJ.map(c => `
    <div class="field">
      <label class="field-label">${c.icon} ${c.label}</label>
      <input type="number" id="objp_${c.key}" class="input-base" value="${obj[c.key] || ''}">
    </div>`).join('');

  const existing = document.getElementById('modalObjetivosPeriodo');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.className = 'modal-bg open';
  modal.id = 'modalObjetivosPeriodo';
  modal.setAttribute('data-periodo', periodo);
  modal.innerHTML = `
    <div class="modal" style="max-width:400px;">
      <div class="modal-header">
        <h3>Editar objetivos — <span style="text-transform:uppercase;color:#2563EB;">${periodo}</span></h3>
        <button class="modal-close" onclick="document.getElementById('modalObjetivosPeriodo').remove()">✕</button>
      </div>
      <div class="modal-body" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">${html}</div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="document.getElementById('modalObjetivosPeriodo').remove()">Cancelar</button>
        <button class="btn-primary" onclick="guardarObjetivosPeriodo('${periodo}')">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function guardarObjetivosPeriodo(periodo) {
  if (!MET.objetivos[periodo]) MET.objetivos[periodo] = {};
  CAMPOS_OBJ.forEach(c => {
    const v = document.getElementById('objp_' + c.key)?.value;
    if (v !== undefined) MET.objetivos[periodo][c.key] = parseFloat(v) || 0;
  });
  try {
    await apiPost('/api/objetivos', { data: MET.objetivos });
    document.getElementById('modalObjetivosPeriodo')?.remove();
    showToast('Objetivos guardados ✓');
    renderObjetivos();
  } catch (e) { showToast(e.message, 'error'); }
}

// Mantener compatibilidad con botón global si existe
function abrirEditarObjetivos() { editarObjetivoPeriodo(MET.periodo || 'trimestre'); }
async function guardarObjetivos() { await guardarObjetivosPeriodo(MET.periodo || 'trimestre'); }

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
