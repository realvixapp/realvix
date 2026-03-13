/**
 * agenda.js — Calendario + Tareas Kanban
 */
const AGENDA = { eventos: [], tareas: [], calFecha: new Date(), diaSeleccionado: null };

async function initAgenda() {
  AGENDA.calFecha = new Date();
  AGENDA.diaSeleccionado = new Date().toISOString().split('T')[0];
  await Promise.all([cargarEventos(), cargarTareas()]);
  renderCalendario();
}

function switchAgendaTab(tab, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('tabCalendario').style.display = tab === 'calendario' ? '' : 'none';
  document.getElementById('tabTareas').style.display = tab === 'tareas' ? '' : 'none';
  if (tab === 'tareas') renderKanban();
}

// ── EVENTOS ──
async function cargarEventos() {
  try {
    const data = await apiGet('/api/eventos');
    AGENDA.eventos = data.eventos || [];
    renderCalendario();
  } catch (e) { showToast('Error al cargar eventos', 'error'); }
}

function mesAnterior() {
  AGENDA.calFecha = new Date(AGENDA.calFecha.getFullYear(), AGENDA.calFecha.getMonth() - 1, 1);
  renderCalendario();
}

function mesSiguiente() {
  AGENDA.calFecha = new Date(AGENDA.calFecha.getFullYear(), AGENDA.calFecha.getMonth() + 1, 1);
  renderCalendario();
}

function renderCalendario() {
  const f = AGENDA.calFecha;
  const titulo = document.getElementById('calTitulo');
  if (titulo) titulo.textContent = f.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

  const grid = document.getElementById('calGrid');
  if (!grid) return;

  const primerDia = new Date(f.getFullYear(), f.getMonth(), 1);
  const ultimoDia = new Date(f.getFullYear(), f.getMonth() + 1, 0);
  const hoy = new Date().toISOString().split('T')[0];

  let html = '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;">';
  // Headers
  ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'].forEach(d => {
    html += `<div style="text-align:center;font-size:0.68rem;font-weight:600;color:#888;padding:6px 0;">${d}</div>`;
  });

  // Días vacíos al inicio
  let inicioSemana = primerDia.getDay();
  for (let i = 0; i < inicioSemana; i++) {
    html += '<div style="min-height:48px;"></div>';
  }

  // Días del mes
  for (let dia = 1; dia <= ultimoDia.getDate(); dia++) {
    const fecha = `${f.getFullYear()}-${String(f.getMonth()+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
    const evsDia = AGENDA.eventos.filter(e => e.fecha === fecha);
    const esHoy = fecha === hoy;
    const esSel = fecha === AGENDA.diaSeleccionado;
    html += `
      <div onclick="seleccionarDia('${fecha}')"
        style="min-height:48px;padding:4px;border-radius:6px;cursor:pointer;border:1px solid ${esSel ? 'var(--rx-blue)' : 'transparent'};background:${esHoy ? 'var(--rx-blue-light)' : esSel ? '#fff' : 'transparent'};transition:background 0.1s;"
        onmouseover="this.style.background='var(--cream)'" onmouseout="this.style.background='${esHoy ? 'var(--rx-blue-light)' : esSel ? '#fff' : 'transparent'}'">
        <div style="font-size:0.75rem;font-weight:${esHoy ? '700' : '400'};color:${esHoy ? 'var(--rx-blue)' : 'var(--text-primary)'};">${dia}</div>
        ${evsDia.slice(0,2).map(e => `<div style="font-size:0.58rem;background:var(--rx-blue);color:white;border-radius:3px;padding:1px 4px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(e.titulo)}</div>`).join('')}
        ${evsDia.length > 2 ? `<div style="font-size:0.58rem;color:#888;">+${evsDia.length - 2} más</div>` : ''}
      </div>`;
  }
  html += '</div>';
  grid.innerHTML = html;

  // Mostrar eventos del día seleccionado
  renderEventosDia(AGENDA.diaSeleccionado);
}

function seleccionarDia(fecha) {
  AGENDA.diaSeleccionado = fecha;
  renderCalendario();
}

function renderEventosDia(fecha) {
  const container = document.getElementById('eventosDia');
  if (!container) return;
  const evs = AGENDA.eventos.filter(e => e.fecha === fecha);
  if (evs.length === 0) {
    container.innerHTML = `<div style="color:#aaa;font-size:0.82rem;text-align:center;padding:12px;">Sin eventos el ${formatFecha(fecha)}</div>`;
    return;
  }
  container.innerHTML = `
    <div style="margin-bottom:8px;font-size:0.8rem;font-weight:600;color:#888;">Eventos del ${formatFecha(fecha)}</div>
    <div style="display:flex;flex-direction:column;gap:6px;">
      ${evs.map(e => `
        <div class="card" style="padding:10px 14px;display:flex;align-items:center;justify-content:space-between;">
          <div>
            <span style="font-size:0.85rem;font-weight:600;">${e.hora ? e.hora + ' — ' : ''}${escHtml(e.titulo)}</span>
            <span class="badge badge-blue" style="margin-left:8px;">${escHtml(e.tipo)}</span>
            ${e.notas ? `<div style="font-size:0.76rem;color:#888;margin-top:2px;">${escHtml(e.notas)}</div>` : ''}
          </div>
          <div style="display:flex;gap:4px;">
            <button class="btn-icon-sm" onclick="editarEvento('${e.id}')">✏️</button>
            <button class="btn-icon-sm danger" onclick="eliminarEvento('${e.id}')">🗑️</button>
          </div>
        </div>
      `).join('')}
    </div>`;
}

function abrirNuevoEvento() {
  ['evId','evTitulo','evNotas'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
  document.getElementById('evFecha').value = AGENDA.diaSeleccionado || new Date().toISOString().split('T')[0];
  document.getElementById('evHora').value = '';
  document.getElementById('evTipo').value = 'reunion';
  document.getElementById('modalEvTitulo').textContent = 'Nuevo evento';
  abrirModal('modalEvento');
}

function editarEvento(id) {
  const e = AGENDA.eventos.find(x => x.id === id);
  if (!e) return;
  document.getElementById('evId').value = e.id;
  document.getElementById('evTitulo').value = e.titulo || '';
  document.getElementById('evFecha').value = e.fecha || '';
  document.getElementById('evHora').value = e.hora || '';
  document.getElementById('evTipo').value = e.tipo || 'reunion';
  document.getElementById('evNotas').value = e.notas || '';
  document.getElementById('modalEvTitulo').textContent = 'Editar evento';
  abrirModal('modalEvento');
}

async function guardarEvento() {
  const id = document.getElementById('evId').value;
  const titulo = document.getElementById('evTitulo').value.trim();
  if (!titulo) { showToast('El título es requerido', 'error'); return; }
  const body = {
    titulo,
    fecha: document.getElementById('evFecha').value,
    hora: document.getElementById('evHora').value,
    tipo: document.getElementById('evTipo').value,
    notas: document.getElementById('evNotas').value,
  };
  try {
    if (id) await apiPut(`/api/eventos/${id}`, body);
    else await apiPost('/api/eventos', body);
    cerrarModal('modalEvento');
    showToast('Evento guardado');
    await cargarEventos();
  } catch (e) { showToast(e.message, 'error'); }
}

async function eliminarEvento(id) {
  if (!confirmar('¿Eliminar este evento?')) return;
  try {
    await apiDelete(`/api/eventos/${id}`);
    showToast('Evento eliminado');
    await cargarEventos();
  } catch (e) { showToast(e.message, 'error'); }
}

// ── TAREAS KANBAN ──
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
      col.innerHTML = '<div style="font-size:0.78rem;color:#bbb;text-align:center;padding:16px;">Sin tareas</div>';
      return;
    }
    col.innerHTML = tareas.map(t => `
      <div class="kanban-card">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:4px;">
          <span style="font-size:0.84rem;font-weight:600;">${escHtml(t.titulo)}</span>
          <div style="display:flex;gap:3px;flex-shrink:0;">
            <button class="btn-icon-sm" onclick="editarTarea('${t.id}')">✏️</button>
            <button class="btn-icon-sm danger" onclick="eliminarTarea('${t.id}')">🗑️</button>
          </div>
        </div>
        ${t.descripcion ? `<div style="font-size:0.76rem;color:#888;margin-bottom:4px;">${escHtml(t.descripcion)}</div>` : ''}
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
          <span class="badge badge-${t.prioridad === 'alta' ? 'red' : t.prioridad === 'media' ? 'orange' : 'gray'}">${t.prioridad}</span>
          <div style="display:flex;gap:4px;">
            ${estado !== 'pendiente' ? `<button class="btn-xs" onclick="moverTarea('${t.id}','pendiente')">← Pendiente</button>` : ''}
            ${estado !== 'en_proceso' ? `<button class="btn-xs" onclick="moverTarea('${t.id}','en_proceso')">En proceso</button>` : ''}
            ${estado !== 'completado' ? `<button class="btn-xs" onclick="moverTarea('${t.id}','completado')">Completado ✓</button>` : ''}
          </div>
        </div>
      </div>
    `).join('');
  });
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
  document.getElementById('taId').value = t.id;
  document.getElementById('taTitulo').value = t.titulo || '';
  document.getElementById('taPrioridad').value = t.prioridad || 'media';
  document.getElementById('taDate').value = t.fecha_venc || '';
  document.getElementById('taDesc').value = t.descripcion || '';
  document.getElementById('modalTaTitulo').textContent = 'Editar tarea';
  abrirModal('modalTarea');
}

async function guardarTarea() {
  const id = document.getElementById('taId').value;
  const titulo = document.getElementById('taTitulo').value.trim();
  if (!titulo) { showToast('El título es requerido', 'error'); return; }
  const body = {
    titulo,
    prioridad: document.getElementById('taPrioridad').value,
    fecha_venc: document.getElementById('taDate').value,
    descripcion: document.getElementById('taDesc').value,
    estado: 'pendiente',
  };
  try {
    if (id) await apiPut(`/api/tareas/${id}`, body);
    else await apiPost('/api/tareas', body);
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
