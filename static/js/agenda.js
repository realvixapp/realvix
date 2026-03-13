/**
 * agenda.js — Google Calendar embebido + Kanban drag & drop
 */
const AGENDA = { tareas: [] };
const GCAL_KEY = 'realvix_gcal_id';
let _gcalPendingData = null;

async function initAgenda() {
  await cargarTareas();
  initGcalTab();
}

function switchAgendaTab(tab, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('tabGcal').style.display   = tab === 'gcal'   ? '' : 'none';
  document.getElementById('tabTareas').style.display = tab === 'tareas' ? '' : 'none';
  if (tab === 'tareas') renderKanban();
}

// ══════════════════════════════════════════════════════════
// ── GOOGLE CALENDAR EMBEBIDO ──
// ══════════════════════════════════════════════════════════

function initGcalTab() {
  const savedId = localStorage.getItem(GCAL_KEY) || '';
  const input   = document.getElementById('gcalIdInput');
  if (input && savedId) input.value = savedId;
  if (savedId) mostrarGcalFrame(savedId);
}

function guardarGcalId() {
  const id = (document.getElementById('gcalIdInput')?.value || '').trim();
  if (!id) { showToast('Ingresá el ID del calendario', 'error'); return; }
  localStorage.setItem(GCAL_KEY, id);
  mostrarGcalFrame(id);
  showToast('Google Calendar conectado ✓', 'success');
}

function mostrarGcalFrame(calId) {
  const banner = document.getElementById('gcalSetupBanner');
  const frame  = document.getElementById('gcalFrame');
  const iframe = document.getElementById('gcalIframe');
  if (!iframe) return;
  const encoded = encodeURIComponent(calId);
  iframe.src = `https://calendar.google.com/calendar/embed?src=${encoded}&ctz=America%2FArgentina%2FBuenos_Aires&showTitle=0&showNav=1&showDate=1&showPrint=0&showTabs=1&showCalendars=1&showTz=0&mode=WEEK&hl=es`;
  if (banner) banner.style.display = 'none';
  if (frame)  frame.style.display  = '';
}

function desconectarGcal() {
  localStorage.removeItem(GCAL_KEY);
  const banner = document.getElementById('gcalSetupBanner');
  const frame  = document.getElementById('gcalFrame');
  const iframe = document.getElementById('gcalIframe');
  if (banner) banner.style.display = 'flex';
  if (frame)  frame.style.display  = 'none';
  if (iframe) iframe.src = '';
  showToast('Calendario desconectado');
}

function abrirNuevoEventoGcal() {
  const calId = localStorage.getItem(GCAL_KEY) || '';
  const url = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
    + (calId ? `&src=${encodeURIComponent(calId)}` : '');
  window.open(url, '_blank');
}

// ══════════════════════════════════════════════════════════
// ── MODAL GLOBAL: PEDIR AGENDAR EN GOOGLE CALENDAR ──
// Llamar con: pedirAgendarEnCalendar({ titulo, descripcion, fecha, hora, notas })
// ══════════════════════════════════════════════════════════

function pedirAgendarEnCalendar(opts = {}) {
  _gcalPendingData = opts;
  const hoy = new Date().toISOString().split('T')[0];
  const el = id => document.getElementById(id);
  if (el('gcalConfirmDesc'))     el('gcalConfirmDesc').textContent = opts.descripcion || opts.titulo || 'Nueva actividad';
  if (el('gcalConfirmFecha'))    el('gcalConfirmFecha').value = opts.fecha || hoy;
  if (el('gcalConfirmHora'))     el('gcalConfirmHora').value  = opts.hora  || '10:00';
  if (el('gcalConfirmNotas'))    el('gcalConfirmNotas').value  = opts.notas || '';
  if (el('gcalConfirmDuracion')) el('gcalConfirmDuracion').value = '60';
  abrirModal('modalConfirmarGcal');
}

function confirmarAgregarGcal() {
  const el = id => document.getElementById(id);
  const titulo  = el('gcalConfirmDesc')?.textContent || 'Evento Realvix';
  const fecha   = el('gcalConfirmFecha')?.value || new Date().toISOString().split('T')[0];
  const hora    = el('gcalConfirmHora')?.value || '10:00';
  const durMin  = parseInt(el('gcalConfirmDuracion')?.value || '60');
  const notas   = el('gcalConfirmNotas')?.value || '';
  const calId   = localStorage.getItem(GCAL_KEY) || '';

  const [y,m,d]  = fecha.split('-');
  const [hh,mm]  = hora.split(':');
  const dtStart  = `${y}${m}${d}T${hh}${mm}00`;
  const fin      = new Date(+y, +m-1, +d, +hh, +mm + durMin);
  const dtEnd    = `${fin.getFullYear()}${String(fin.getMonth()+1).padStart(2,'0')}${String(fin.getDate()).padStart(2,'0')}T${String(fin.getHours()).padStart(2,'0')}${String(fin.getMinutes()).padStart(2,'0')}00`;

  const url = `https://calendar.google.com/calendar/render?action=TEMPLATE`
    + `&text=${encodeURIComponent(titulo)}`
    + `&dates=${dtStart}/${dtEnd}`
    + `&details=${encodeURIComponent(notas)}`
    + (calId ? `&src=${encodeURIComponent(calId)}` : '');

  window.open(url, '_blank');
  cerrarModal('modalConfirmarGcal');
  showToast('Evento abierto en Google Calendar ✓', 'success');
  _gcalPendingData = null;
}

function mostrarPanelFlotante() {
  const data    = _gcalPendingData;
  const panel   = document.getElementById('panelFlotanteLead');
  const content = document.getElementById('panelFlotanteContent');
  if (!panel || !content || !data) return;

  const rows = [
    data.descripcion || data.titulo,
    data.fecha   ? `📅 ${data.fecha}` : null,
    data.hora    ? `🕙 ${data.hora}`  : null,
    data.notas   ? `📝 ${data.notas}` : null,
  ].filter(Boolean);

  content.innerHTML = rows.map(r => `<div style="padding:2px 0;border-bottom:1px solid #f0f0f0;">${escHtml(r)}</div>`).join('');
  panel.style.display = '';
}

function cerrarPanelFlotante() {
  const panel = document.getElementById('panelFlotanteLead');
  if (panel) panel.style.display = 'none';
}

function abrirGcalDesdePanelFlotante() {
  cerrarPanelFlotante();
  if (_gcalPendingData) pedirAgendarEnCalendar(_gcalPendingData);
}

// ══════════════════════════════════════════════════════════
// ── TAREAS KANBAN con drag & drop ──
// ══════════════════════════════════════════════════════════

async function cargarTareas() {
  try {
    const data = await apiGet('/api/tareas');
    AGENDA.tareas = data.tareas || [];
    renderKanban();
    const pendientes = AGENDA.tareas.filter(t => t.estado === 'pendiente').length;
    setBadge('badgeTareas', pendientes);
  } catch (e) { console.error(e); }
}

function renderKanban() {
  const cols = { pendiente: 'colPendiente', en_proceso: 'colProceso', completado: 'colCompletado' };
  Object.entries(cols).forEach(([estado, colId]) => {
    const col = document.getElementById(colId);
    if (!col) return;
    const tareas = AGENDA.tareas.filter(t => t.estado === estado);
    if (tareas.length === 0) {
      col.innerHTML = '<div style="font-size:0.78rem;color:#bbb;text-align:center;padding:20px 12px;">Sin tareas<br><span style="font-size:0.7rem;opacity:0.6;">Arrastrá una acá</span></div>';
      return;
    }
    col.innerHTML = tareas.map(t => `
      <div class="kanban-card" draggable="true"
        ondragstart="dragStartTarea(event,'${t.id}')"
        ondragend="event.target.style.opacity='1'"
        style="cursor:grab;">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:4px;">
          <span style="font-size:0.84rem;font-weight:600;">${escHtml(t.titulo)}</span>
          <div style="display:flex;gap:3px;flex-shrink:0;">
            <button class="btn-icon-sm" onclick="editarTarea('${t.id}')">✏️</button>
            <button class="btn-icon-sm danger" onclick="eliminarTarea('${t.id}')">🗑️</button>
          </div>
        </div>
        ${t.descripcion ? `<div style="font-size:0.76rem;color:#888;margin-bottom:4px;">${escHtml(t.descripcion)}</div>` : ''}
        ${t.fecha_venc  ? `<div style="font-size:0.72rem;color:#aaa;margin-bottom:4px;">📅 ${formatFecha(t.fecha_venc)}</div>` : ''}
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
          <span class="badge badge-${t.prioridad === 'alta' ? 'red' : t.prioridad === 'media' ? 'orange' : 'gray'}">${t.prioridad}</span>
          <span style="font-size:0.68rem;color:#ccc;">⠿ arrastrar</span>
        </div>
      </div>
    `).join('');
  });
}

function dragStartTarea(event, id) {
  event.dataTransfer.setData('tareaId', id);
  event.target.style.opacity = '0.5';
}

async function dropTarea(event, nuevoEstado) {
  event.preventDefault();
  const col = event.currentTarget;
  col.classList.remove('drag-over');
  const id = event.dataTransfer.getData('tareaId');
  const t  = AGENDA.tareas.find(x => x.id === id);
  if (!t || t.estado === nuevoEstado) return;
  try {
    await apiPut(`/api/tareas/${id}`, { ...t, estado: nuevoEstado });
    t.estado = nuevoEstado;
    renderKanban();
    setBadge('badgeTareas', AGENDA.tareas.filter(t => t.estado === 'pendiente').length);
    showToast('Tarea movida ✓');
  } catch (e) { showToast(e.message, 'error'); }
}

async function moverTarea(id, nuevoEstado) {
  const t = AGENDA.tareas.find(x => x.id === id);
  if (!t) return;
  try {
    await apiPut(`/api/tareas/${id}`, { ...t, estado: nuevoEstado });
    t.estado = nuevoEstado;
    renderKanban();
    setBadge('badgeTareas', AGENDA.tareas.filter(t => t.estado === 'pendiente').length);
  } catch (e) { showToast(e.message, 'error'); }
}

function abrirNuevaTarea() {
  ['taId','taTitulo','taDesc'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
  document.getElementById('taPrioridad').value = 'media';
  document.getElementById('taDate').value = '';
  document.getElementById('modalTaTitulo').textContent = 'Nueva tarea';
  abrirModal('modalTarea');
}

function editarTarea(id) {
  const t = AGENDA.tareas.find(x => x.id === id);
  if (!t) return;
  document.getElementById('taId').value       = t.id;
  document.getElementById('taTitulo').value   = t.titulo || '';
  document.getElementById('taPrioridad').value= t.prioridad || 'media';
  document.getElementById('taDate').value     = t.fecha_venc || '';
  document.getElementById('taDesc').value     = t.descripcion || '';
  document.getElementById('modalTaTitulo').textContent = 'Editar tarea';
  abrirModal('modalTarea');
}

async function guardarTarea() {
  const id     = document.getElementById('taId').value;
  const titulo = document.getElementById('taTitulo').value.trim();
  if (!titulo) { showToast('El título es requerido', 'error'); return; }
  const body = {
    titulo,
    prioridad:   document.getElementById('taPrioridad').value,
    fecha_venc:  document.getElementById('taDate').value,
    descripcion: document.getElementById('taDesc').value,
    estado: id ? (AGENDA.tareas.find(x=>x.id===id)?.estado || 'pendiente') : 'pendiente',
  };
  try {
    if (id) await apiPut(`/api/tareas/${id}`, body);
    else    await apiPost('/api/tareas', body);
    cerrarModal('modalTarea');
    showToast('Tarea guardada');
    await cargarTareas();
  } catch (e) { showToast(e.message, 'error'); }
}

async function eliminarTarea(id) {
  if (!confirmar('¿Eliminar esta tarea?')) return;
  try {
    await apiDelete(`/api/tareas/${id}`);
    showToast('Tarea eliminada');
    await cargarTareas();
  } catch (e) { showToast(e.message, 'error'); }
}
