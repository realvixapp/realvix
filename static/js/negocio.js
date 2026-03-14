/**
 * negocio.js
 * Listing: dirección, propietario, teléfono, tipología, estado tasación
 * Estado:  dirección, estadio, próximo contacto, último contacto, observaciones
 */

const NEG = {
  propiedades: [],
  contactos:   [],
  estadioFiltro: 'todos',
  tabActual: 'listing',
};

// Mapa de colores por estadio
const ESTADIO_MAP = {
  pendiente:            { label: 'Pendiente',           color: '#6B7280', bg: '#F3F4F6' },
  esperando_respuesta:  { label: 'Esperando respuesta', color: '#7C3AED', bg: '#F5F3FF' },
  captado:     { label: 'Captado',     color: '#2563EB', bg: '#EFF6FF' },
  publicado:   { label: 'Publicado',   color: '#D97706', bg: '#FFFBEB' },
  reservado:   { label: 'Reservado',   color: '#DC2626', bg: '#FEF2F2' },
  cerrado:     { label: 'Cerrado ✓',   color: '#059669', bg: '#ECFDF5' },
  // legacy
  nuevo:       { label: 'Nuevo',       color: '#6B7280', bg: '#F3F4F6' },
  en_tasacion: { label: 'En tasación', color: '#7C3AED', bg: '#F5F3FF' },
};

async function initNegocio() {
  await Promise.all([cargarPropiedades(), cargarContactos()]);
}

// ── TABS ──
function switchTab(tab, btn) {
  NEG.tabActual = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('tabListing').style.display    = tab === 'listing'   ? '' : 'none';
  const tabEst = document.getElementById('tabEstado');
  if (tabEst) tabEst.style.display = tab === 'estado' ? '' : 'none';
  document.getElementById('tabContactos').style.display  = tab === 'contactos' ? '' : 'none';
  const tabAct = document.getElementById('tabActividad');
  if (tabAct) tabAct.style.display = 'none';
  const tabAcep = document.getElementById('tabAceptadas');
  if (tabAcep) tabAcep.style.display = tab === 'aceptadas' ? '' : 'none';
  if (tab === 'estado')    actualizarContadoresEstado();
  if (tab === 'aceptadas') renderAceptadas();
}

// ══ PROPIEDADES (datos comunes) ══
async function cargarPropiedades() {
  try {
    const data = await apiGet('/api/propiedades');
    NEG.propiedades = data.propiedades || [];
    renderListing();
    renderEstado();
    actualizarStatsListing();
    // Actualizar badge tab Aceptadas
    const nAcep = NEG.propiedades.filter(p => p.respuesta_listing === 'aceptado').length;
    const tabAcepBtn = document.getElementById('tab-aceptadas');
    if (tabAcepBtn) {
      tabAcepBtn.innerHTML = `✅ Aceptadas${nAcep > 0 ? ` <span style="background:#059669;color:white;border-radius:10px;padding:1px 7px;font-size:0.72rem;margin-left:4px;">${nAcep}</span>` : ''}`;
    }
  } catch (e) { showToast('Error al cargar propiedades', 'error'); }
}

function renderAceptadas() {
  const lista = NEG.propiedades.filter(p => p.respuesta_listing === 'aceptado');
  const container = document.getElementById('aceptadasTable');
  if (!container) return;

  if (lista.length === 0) {
    container.innerHTML = `<div class="empty-state">No hay propiedades aceptadas todavía.<br><span style="font-size:0.8rem;color:#aaa;">Cuando un propietario acepte la tasación aparecerá aquí.</span></div>`;
    return;
  }

  const RESP_MAP = {
    'esperando_respuesta':{ label: '⏳ Esperando resp.', color:'#D97706', bg:'#FFFBEB' },
    'aceptado':           { label: '✅ Aceptado',        color:'#059669', bg:'#ECFDF5' },
    'rechazado':          { label: '❌ Rechazado',       color:'#DC2626', bg:'#FEF2F2' },
    'decide_esperar':     { label: '🕐 Decide esperar',  color:'#7C3AED', bg:'#F5F3FF' },
    'vendio_con_otro':    { label: '🔄 Vendió con otro', color:'#6B7280', bg:'#F3F4F6' },
  };

  container.innerHTML = `
    <div style="background:linear-gradient(135deg,#ECFDF5,#D1FAE5);border-radius:10px;border:1px solid #6EE7B7;padding:10px 16px;margin-bottom:14px;display:flex;align-items:center;gap:10px;">
      <span style="font-size:1.2rem;">✅</span>
      <div>
        <div style="font-weight:700;color:#065F46;font-size:0.9rem;">${lista.length} propiedad(es) aceptada(s)</div>
        <div style="font-size:0.75rem;color:#6B7280;">Estas propiedades pasaron automáticamente a la sección Propiedades</div>
      </div>
    </div>
    <table class="table">
      <thead><tr>
        <th>Dirección</th>
        <th>Propietario</th>
        <th>Teléfono</th>
        <th>Tipología</th>
        <th>Respuesta</th>
        <th style="text-align:right">Acciones</th>
      </tr></thead>
      <tbody>
        ${lista.map(p => {
          const resp = p.respuesta_listing || 'aceptado';
          const rInfo = RESP_MAP[resp] || RESP_MAP['aceptado'];
          return `<tr style="background:#F0FDF4;">
            <td>
              <div style="font-weight:600;color:var(--rx-blue);cursor:pointer;text-decoration:underline dotted;"
                data-pid="${p.id}" onclick="editarPropiedad(this.dataset.pid)">${escHtml(p.direccion || '—')}</div>
              ${p.localidad ? `<div style="font-size:0.75rem;color:#888;">${escHtml(p.localidad)}${p.zona ? ' · ' + escHtml(p.zona) : ''}</div>` : ''}
            </td>
            <td>${escHtml(p.nombre_propietario || '—')}</td>
            <td>${p.telefono ? `<a href="tel:${escHtml(p.telefono)}" style="color:var(--text-primary);text-decoration:none;">${escHtml(p.telefono)}</a>` : '—'}</td>
            <td>${escHtml(p.tipologia || '—')}</td>
            <td><span style="font-size:0.78rem;font-weight:600;color:${rInfo.color};background:${rInfo.bg};padding:3px 10px;border-radius:12px;">${rInfo.label}</span></td>
            <td style="text-align:right;white-space:nowrap;">
              ${p.telefono ? `<button class="btn-icon-sm" onclick="abrirWA('${escHtml(p.telefono)}','${escHtml(p.nombre_propietario||'')}')">💬</button>` : ''}
              <button class="btn-icon-sm" onclick="editarPropiedad('${p.id}')">✏️</button>
              <button class="btn-icon-sm danger" onclick="eliminarPropiedad('${p.id}')">🗑️</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}



// ══ LISTING ══
// Columnas: Dirección · Propietario · Teléfono · Tipología · Estado tasación · Acciones
function filtrarListing() { renderListing(); }

let _listingSeleccionados = new Set();

function toggleSeleccionListing(pid) {
  if (_listingSeleccionados.has(pid)) _listingSeleccionados.delete(pid);
  else _listingSeleccionados.add(pid);
  _actualizarBarraSeleccionListing();
}

function toggleSeleccionTodosListing(checked, pids) {
  if (checked) pids.forEach(id => _listingSeleccionados.add(id));
  else _listingSeleccionados.clear();
  _actualizarBarraSeleccionListing();
  // re-render checkboxes
  document.querySelectorAll('.listing-checkbox-row').forEach(cb => {
    cb.checked = checked;
  });
}

function _actualizarBarraSeleccionListing() {
  const barra = document.getElementById('barraSeleccionListing');
  if (!barra) return;
  if (_listingSeleccionados.size > 0) {
    barra.style.display = 'flex';
    document.getElementById('selCountListing').textContent = `${_listingSeleccionados.size} seleccionada(s)`;
  } else {
    barra.style.display = 'none';
  }
}

async function eliminarSeleccionadosListing() {
  if (_listingSeleccionados.size === 0) return;
  if (!confirmar(`¿Eliminar ${_listingSeleccionados.size} propiedad(es)? No se puede deshacer.`)) return;
  try {
    for (const pid of _listingSeleccionados) {
      await apiDelete(`/api/propiedades/${pid}`);
    }
    _listingSeleccionados.clear();
    showToast('Propiedades eliminadas ✓', 'success');
    await cargarPropiedades();
  } catch(e) { showToast(e.message, 'error'); }
}

function renderListing() {
  const q    = (document.getElementById('filtroListing')?.value || '').toLowerCase();
  const tipo = document.getElementById('filtroTipoListing')?.value || '';

  const listaCompleta = NEG.propiedades.filter(p =>
    (!q || (p.direccion||'').toLowerCase().includes(q) ||
           (p.nombre_propietario||'').toLowerCase().includes(q) ||
           (p.localidad||'').toLowerCase().includes(q)) &&
    (!tipo || p.tipologia === tipo)
  );

  // Separar aceptadas de las demás
  const listaAceptadas = listaCompleta.filter(p => p.respuesta_listing === 'aceptado');
  const lista = listaCompleta.filter(p => p.respuesta_listing !== 'aceptado');

  const container = document.getElementById('listingTable');
  if (!container) return;

  const RESP_MAP = {
    '':                   { label: '—',                  color:'#aaa',    bg:'#f9fafb' },
    'esperando_respuesta':{ label: '⏳ Esperando resp.', color:'#D97706', bg:'#FFFBEB' },
    'aceptado':           { label: '✅ Aceptado',        color:'#059669', bg:'#ECFDF5' },
    'rechazado':          { label: '❌ Rechazado',       color:'#DC2626', bg:'#FEF2F2' },
    'decide_esperar':     { label: '🕐 Decide esperar',  color:'#7C3AED', bg:'#F5F3FF' },
    'vendio_con_otro':    { label: '🔄 Vendió con otro', color:'#6B7280', bg:'#F3F4F6' },
    'completada':         { label: '✔️ Completada',      color:'#059669', bg:'#ECFDF5' },
  };

  const renderTabla = (items, showSelect = true) => {
    if (items.length === 0) return '';
    const pids = items.map(p => `'${p.id}'`).join(',');
    return `
      <table class="table">
        <thead><tr>
          ${showSelect ? `<th style="width:32px;padding:8px 6px;">
            <input type="checkbox" style="cursor:pointer;" onchange="toggleSeleccionTodosListing(this.checked,[${pids}])">
          </th>` : '<th style="width:32px;"></th>'}
          <th>Dirección</th>
          <th>Propietario</th>
          <th>Teléfono</th>
          <th>Tipología</th>
          <th>Estado tasación</th>
          <th>Respuesta propietario</th>
          <th style="text-align:right">Acciones</th>
        </tr></thead>
        <tbody>
          ${items.map(p => {
            const estVal = p.estado_tasacion || '';
            // Si la respuesta es "esperando_respuesta" → mostrar "Completada" en estado tasación si no es pendiente
            let estDisplay = estVal;
            if (p.respuesta_listing && p.respuesta_listing !== '' && p.respuesta_listing !== 'esperando_respuesta' && p.respuesta_listing !== 'pendiente') {
              estDisplay = 'completada';
            }
            const est   = ESTADIO_MAP[estDisplay] || ESTADIO_MAP[estVal] || { label: estDisplay || '—', color: '#888', bg: '#f3f4f6' };
            const resp  = p.respuesta_listing || '';
            const rInfo = RESP_MAP[resp] || RESP_MAP[''];
            const isSelected = _listingSeleccionados.has(p.id);
            return `<tr style="${isSelected ? 'background:#EFF6FF;' : ''}">
              <td style="padding:8px 6px;">
                <input type="checkbox" class="listing-checkbox-row" style="cursor:pointer;" ${isSelected?'checked':''} onchange="toggleSeleccionListing('${p.id}')">
              </td>
              <td>
                <div style="font-weight:600;color:var(--rx-blue);cursor:pointer;text-decoration:underline dotted;"
                  data-pid="${p.id}" onclick="editarPropiedad(this.dataset.pid)">${escHtml(p.direccion || '—')}</div>
                ${p.localidad ? `<div style="font-size:0.75rem;color:#888;">${escHtml(p.localidad)}${p.zona ? ' · ' + escHtml(p.zona) : ''}</div>` : ''}
              </td>
              <td>${escHtml(p.nombre_propietario || '—')}</td>
              <td>
                ${p.telefono
                  ? `<a href="tel:${escHtml(p.telefono)}" style="color:var(--text-primary);text-decoration:none;">${escHtml(p.telefono)}</a>`
                  : '—'}
              </td>
              <td>${escHtml(p.tipologia || '—')}</td>
              <td>
                <select class="estadio-inline-select" data-pid="${p.id}"
                  onchange="cambiarEstadioListing(this.dataset.pid, this.value)"
                  style="font-size:0.75rem;padding:3px 8px;border-radius:12px;border:1px solid ${est.color}44;background:${est.bg};color:${est.color};font-weight:600;cursor:pointer;outline:none;">
                  <option value="pendiente"           ${(estVal||'')==='pendiente'          ?'selected':''}>⏳ Pendiente</option>
                  <option value="esperando_respuesta" ${(estVal||'')==='esperando_respuesta'?'selected':''}>📋 Esperando resp.</option>
                  ${(estVal==='completada') ? '<option value="completada" selected>✔️ Completada</option>' : ''}
                </select>
              </td>
              <td>
                <select style="font-size:0.75rem;padding:3px 8px;height:auto;border-radius:12px;border:1.5px solid ${rInfo.color}55;background:${rInfo.bg};color:${rInfo.color};font-weight:600;cursor:pointer;outline:none;pointer-events:auto;min-width:130px;"
                  data-pid="${p.id}"
                  onchange="cambiarRespuestaListing(this.dataset.pid, this.value)">
                  <option value="" ${resp===''?'selected':''}>—</option>
                  <option value="esperando_respuesta" ${resp==='esperando_respuesta'?'selected':''}>⏳ Esperando resp.</option>
                  <option value="aceptado"        ${resp==='aceptado'       ?'selected':''}>✅ Aceptado</option>
                  <option value="rechazado"       ${resp==='rechazado'      ?'selected':''}>❌ Rechazado</option>
                  <option value="decide_esperar"  ${resp==='decide_esperar' ?'selected':''}>🕐 Decide esperar</option>
                  <option value="vendio_con_otro" ${resp==='vendio_con_otro'?'selected':''}>🔄 Vendió con otro</option>
                </select>
              </td>
              <td style="text-align:right;white-space:nowrap;">
                ${p.telefono ? `<button class="btn-icon-sm" title="WhatsApp" onclick="abrirWA('${escHtml(p.telefono)}','${escHtml(p.nombre_propietario||'')}')">💬</button>` : ''}
                <button class="btn-icon-sm" title="Editar" onclick="editarPropiedad('${p.id}')">✏️</button>
                <button class="btn-icon-sm danger" title="Eliminar" onclick="eliminarPropiedad('${p.id}')">🗑️</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  };

  let html = '';

  // Barra de selección múltiple
  html += `<div id="barraSeleccionListing" style="display:none;align-items:center;gap:10px;padding:8px 12px;background:#FEF9C3;border-radius:8px;margin-bottom:10px;border:1px solid #FDE047;">
    <span id="selCountListing" style="font-size:0.85rem;font-weight:600;color:#92400E;"></span>
    <button onclick="eliminarSeleccionadosListing()"
      style="padding:5px 14px;border-radius:8px;border:none;background:#DC2626;color:white;cursor:pointer;font-size:0.82rem;font-weight:600;">🗑️ Eliminar seleccionadas</button>
    <button onclick="_listingSeleccionados.clear();_actualizarBarraSeleccionListing();renderListing();"
      style="padding:5px 12px;border-radius:8px;border:1px solid #e5e7eb;background:white;cursor:pointer;font-size:0.82rem;">✕ Cancelar</button>
  </div>`;

  if (lista.length === 0 && listaAceptadas.length === 0) {
    html += `<div class="empty-state">No hay propiedades en el listing</div>`;
    container.innerHTML = html;
    return;
  }

  // Tabla principal (no aceptadas)
  if (lista.length > 0) {
    html += renderTabla(lista);
  }

  // Sección ACEPTADAS separada
  if (listaAceptadas.length > 0) {
    html += `
      <div style="margin-top:24px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:10px 14px;background:linear-gradient(135deg,#ECFDF5,#D1FAE5);border-radius:10px;border:1px solid #6EE7B7;">
          <span style="font-size:1rem;">✅</span>
          <span style="font-weight:700;font-size:0.92rem;color:#065F46;">Aceptadas</span>
          <span style="font-size:0.75rem;background:#059669;color:white;padding:1px 8px;border-radius:10px;font-weight:600;">${listaAceptadas.length}</span>
          <span style="font-size:0.75rem;color:#6B7280;margin-left:4px;">→ Pasadas a Propiedades automáticamente</span>
        </div>
        ${renderTabla(listaAceptadas, false)}
      </div>`;
  }

  container.innerHTML = html;
  _actualizarBarraSeleccionListing();
}



async function cambiarRespuestaListing(pid, valor) {
  const p = NEG.propiedades.find(x => x.id === pid);
  if (!p) return;
  try {
    const updates = { ...p, respuesta_listing: valor };
    if (valor === 'aceptado') {
      // Aceptado → mover a Captado
      const estActual = (p.estado_tasacion || '').toLowerCase();
      if (!['captado','publicado','reservado','cerrado'].includes(estActual)) {
        updates.estado_tasacion = 'captado';
        updates.estadio = 'captado';
        showToast('✅ Aceptado → movida automáticamente a Captado', 'success');
      } else {
        showToast('Respuesta: Aceptado ✓', 'success');
      }
    } else if (valor === 'esperando_respuesta') {
      // Sincronizar estado de tasación a esperando_respuesta también
      updates.estado_tasacion = 'esperando_respuesta';
      updates.estadio = 'esperando_respuesta';
      showToast('Respuesta actualizada ✓');
    } else if (valor !== '' && valor !== 'pendiente') {
      // Cualquier otra respuesta distinta a vacío/pendiente → estado tasación = "completada"
      // (se guarda como 'completada' para indicar que el proceso finalizó)
      updates.estado_tasacion = 'completada';
      updates.estadio = 'completada';
      showToast('Respuesta actualizada ✓');
    } else {
      showToast('Respuesta actualizada ✓');
    }
    await apiPut(`/api/propiedades/${pid}`, updates);
    p.respuesta_listing = valor;
    if (updates.estado_tasacion) p.estado_tasacion = updates.estado_tasacion;
    if (updates.estadio) p.estadio = updates.estadio;
    renderListing();
    renderEstado();
    actualizarStatsListing();
    actualizarContadoresEstado();
    if (valor === 'aceptado') {
      setTimeout(() => { window.location.href = '/propiedades'; }, 900);
    }
  } catch(e) { showToast(e.message, 'error'); }
}

async function cambiarEstadioListing(pid, nuevoEstadio) {
  const p = NEG.propiedades.find(x => x.id === pid);
  if (!p) return;
  try {
    const updates = { ...p, estado_tasacion: nuevoEstadio, estadio: nuevoEstadio };
    // Si cambia a esperando_respuesta → sincronizar respuesta_listing también
    if (nuevoEstadio === 'esperando_respuesta') {
      updates.respuesta_listing = 'esperando_respuesta';
      p.respuesta_listing = 'esperando_respuesta';
    }
    await apiPut(`/api/propiedades/${pid}`, updates);
    p.estado_tasacion = nuevoEstadio;
    p.estadio = nuevoEstadio;
    renderListing();
    renderEstado();
    actualizarStatsListing();
    actualizarContadoresEstado();
    showToast('Estado actualizado ✓');
    if (['en_tasacion','captado'].includes(nuevoEstadio)) {
      const label = ESTADIO_MAP[nuevoEstadio]?.label || nuevoEstadio;
      setTimeout(() => pedirAgendarEnCalendar({
        titulo: `${label} — ${p.direccion||'Propiedad'}`,
        descripcion: `📋 ${label} · ${p.direccion||''}${p.nombre_propietario ? ' · '+p.nombre_propietario : ''}`,
        hora: '10:00',
      }), 300);
    }
  } catch(e) { showToast(e.message, 'error'); }
}
function actualizarStatsListing() {
  const total = NEG.propiedades.length;
  const captadas = NEG.propiedades.filter(p => ['captado','publicado','reservado','cerrado'].includes(p.estado_tasacion)).length;
  const seguimiento = NEG.propiedades.filter(p => ['en_tasacion','nuevo'].includes(p.estado_tasacion) || !p.estado_tasacion).length;
  const s = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  s('lsTotalCartera', total);
  s('lsCaptadas', captadas);
  s('lsSeguimiento', seguimiento);
}

function actualizarContadoresEstado() {
  const s = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  s('cntPendientes',  NEG.propiedades.filter(p => (p.estado_tasacion||'pendiente') === 'pendiente').length);
  s('cntEsperando',   NEG.propiedades.filter(p => p.estado_tasacion === 'esperando_respuesta').length);
}

// ══ ESTADO DE PROPIEDADES ══
// Columnas: Dirección · Estadio · Próximo contacto · Último contacto · Observaciones · Acciones
let _estadioFiltro = 'todos';

function filtrarEstadioEstado(est, btn) {
  _estadioFiltro = est;
  document.querySelectorAll('#tabEstado .estadio-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderEstado();
}

function filtrarEstado() { renderEstado(); }

let _estadoSeleccionados = new Set();

function toggleSeleccionEstado(pid) {
  if (_estadoSeleccionados.has(pid)) _estadoSeleccionados.delete(pid);
  else _estadoSeleccionados.add(pid);
  _actualizarBarraSeleccionEstado();
}

function toggleSeleccionTodosEstado(checked, pids) {
  if (checked) pids.forEach(id => _estadoSeleccionados.add(id));
  else _estadoSeleccionados.clear();
  _actualizarBarraSeleccionEstado();
  document.querySelectorAll('.estado-checkbox-row').forEach(cb => { cb.checked = checked; });
}

function _actualizarBarraSeleccionEstado() {
  const barra = document.getElementById('barraSeleccionEstado');
  if (!barra) return;
  if (_estadoSeleccionados.size > 0) {
    barra.style.display = 'flex';
    document.getElementById('selCountEstado').textContent = `${_estadoSeleccionados.size} seleccionada(s)`;
  } else {
    barra.style.display = 'none';
  }
}

async function eliminarSeleccionadosEstado() {
  if (_estadoSeleccionados.size === 0) return;
  if (!confirmar(`¿Eliminar ${_estadoSeleccionados.size} propiedad(es)? No se puede deshacer.`)) return;
  try {
    for (const pid of _estadoSeleccionados) {
      await apiDelete(`/api/propiedades/${pid}`);
    }
    _estadoSeleccionados.clear();
    showToast('Propiedades eliminadas ✓', 'success');
    await cargarPropiedades();
  } catch(e) { showToast(e.message, 'error'); }
}

let _respuestaFiltroEstado = '';

function filtrarRespuestaEstado(resp) {
  _respuestaFiltroEstado = resp;
  // Update active button style
  document.querySelectorAll('#respFiltroEstadoBtns .resp-btn-est').forEach(b => {
    b.style.background = b.dataset.val === resp ? 'var(--rx-blue)' : 'white';
    b.style.color = b.dataset.val === resp ? 'white' : '#444';
  });
  renderEstado();
}

function renderEstado() {
  const q = (document.getElementById('filtroEstadoBuscar')?.value || '').toLowerCase();
  let lista = NEG.propiedades.filter(p => {
    const matchEst = _estadioFiltro === 'todos' || p.estado_tasacion === _estadioFiltro || p.estadio === _estadioFiltro;
    const matchQ   = !q || (p.direccion||'').toLowerCase().includes(q) ||
                          (p.nombre_propietario||'').toLowerCase().includes(q);
    const matchResp = !_respuestaFiltroEstado || (p.respuesta_listing||'') === _respuestaFiltroEstado;
    return matchEst && matchQ && matchResp;
  });

  // Separar aceptadas
  const listaAceptadas = lista.filter(p => p.respuesta_listing === 'aceptado');
  const listaNormal    = lista.filter(p => p.respuesta_listing !== 'aceptado');

  const container = document.getElementById('estadoTable');
  if (!container) return;

  const hoy = new Date().toISOString().split('T')[0];

  const RESP_MAP_E = {
    '':                   { label: '—',                  color:'#aaa' },
    'esperando_respuesta':{ label: '⏳ Esperando resp.', color:'#D97706' },
    'aceptado':           { label: '✅ Aceptado',        color:'#059669' },
    'rechazado':          { label: '❌ Rechazado',       color:'#DC2626' },
    'decide_esperar':     { label: '🕐 Decide esperar',  color:'#7C3AED' },
    'vendio_con_otro':    { label: '🔄 Vendió con otro', color:'#6B7280' },
    'completada':         { label: '✔️ Completada',      color:'#059669' },
  };

  const renderFilas = (items) => {
    const pids = items.map(p => `'${p.id}'`).join(',');
    return `
      <table class="table">
        <thead><tr>
          <th style="width:32px;padding:8px 6px;">
            <input type="checkbox" style="cursor:pointer;" onchange="toggleSeleccionTodosEstado(this.checked,[${pids}])">
          </th>
          <th>Dirección</th>
          <th>Estadio</th>
          <th>Respuesta prop.</th>
          <th>Próximo contacto</th>
          <th>Último contacto</th>
          <th>Observaciones</th>
          <th style="text-align:right">Acciones</th>
        </tr></thead>
        <tbody>
          ${items.map(p => {
            const estadio = p.estado_tasacion || p.estadio || '';
            const est = ESTADIO_MAP[estadio] || { label: estadio || '—', color: '#888', bg: '#f3f4f6' };
            const proximo = p.proximo_contacto || '';
            const vencido = proximo && proximo < hoy;
            const hoyFlag  = proximo === hoy;
            const resp = p.respuesta_listing || '';
            const rLabel = RESP_MAP_E[resp]?.label || '—';
            const rColor = RESP_MAP_E[resp]?.color || '#aaa';
            const isSelected = _estadoSeleccionados.has(p.id);
            return `<tr style="${isSelected ? 'background:#EFF6FF;' : ''}">
              <td style="padding:8px 6px;">
                <input type="checkbox" class="estado-checkbox-row" style="cursor:pointer;" ${isSelected?'checked':''} onchange="toggleSeleccionEstado('${p.id}')">
              </td>
              <td>
                <div style="font-weight:600;">${escHtml(p.direccion || '—')}</div>
                ${p.nombre_propietario ? `<div style="font-size:0.75rem;color:#888;">${escHtml(p.nombre_propietario)}</div>` : ''}
              </td>
              <td>
                <select class="estadio-inline-select" onchange="cambiarEstadio('${p.id}', this.value)"
                  style="font-size:0.78rem;padding:3px 8px;border-radius:20px;border:1px solid ${est.color}44;background:${est.bg};color:${est.color};font-weight:600;cursor:pointer;outline:none;">
                  <option value="pendiente" ${estadio==='pendiente'?'selected':''}>⏳ Pendiente</option>
                  <option value="esperando_respuesta" ${estadio==='esperando_respuesta'?'selected':''}>📋 Esperando respuesta</option>
                  ${estadio==='completada'?'<option value="completada" selected>✔️ Completada</option>':''}
                </select>
              </td>
              <td>
                <span style="font-size:0.75rem;font-weight:600;color:${rColor};">${rLabel}</span>
              </td>
              <td>
                ${proximo
                  ? `<span style="font-size:0.82rem;font-weight:${vencido||hoyFlag?'700':'400'};color:${vencido?'var(--danger)':hoyFlag?'var(--rx-blue)':'inherit'};">
                      ${vencido ? '⚠️ ' : hoyFlag ? '📌 ' : ''}${formatFecha(proximo)}
                    </span>`
                  : '<span style="color:#ccc;">—</span>'}
              </td>
              <td style="font-size:0.82rem;color:#666;">${formatFecha(p.ultimo_contacto)}</td>
              <td style="max-width:220px;">
                ${p.observaciones
                  ? `<div style="font-size:0.78rem;color:#666;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px;" title="${escHtml(p.observaciones)}">${escHtml(p.observaciones)}</div>`
                  : '<span style="color:#ccc;">—</span>'}
              </td>
              <td style="text-align:right;white-space:nowrap;">
                ${p.telefono ? `<button class="btn-icon-sm" onclick="abrirWA('${escHtml(p.telefono)}','${escHtml(p.nombre_propietario||'')}')">💬</button>` : ''}
                <button class="btn-icon-sm" onclick="editarPropiedad('${p.id}')">✏️</button>
                <button class="btn-icon-sm danger" onclick="eliminarPropiedad('${p.id}')">🗑️</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  };

  let html = '';

  // Barra de selección
  html += `<div id="barraSeleccionEstado" style="display:none;align-items:center;gap:10px;padding:8px 12px;background:#FEF9C3;border-radius:8px;margin-bottom:10px;border:1px solid #FDE047;">
    <span id="selCountEstado" style="font-size:0.85rem;font-weight:600;color:#92400E;"></span>
    <button onclick="eliminarSeleccionadosEstado()"
      style="padding:5px 14px;border-radius:8px;border:none;background:#DC2626;color:white;cursor:pointer;font-size:0.82rem;font-weight:600;">🗑️ Eliminar seleccionadas</button>
    <button onclick="_estadoSeleccionados.clear();_actualizarBarraSeleccionEstado();renderEstado();"
      style="padding:5px 12px;border-radius:8px;border:1px solid #e5e7eb;background:white;cursor:pointer;font-size:0.82rem;">✕ Cancelar</button>
  </div>`;

  if (lista.length === 0) {
    html += `<div class="empty-state">No hay propiedades en este estadio</div>`;
    container.innerHTML = html;
    return;
  }

  if (listaNormal.length > 0) html += renderFilas(listaNormal);

  if (listaAceptadas.length > 0) {
    html += `
      <div style="margin-top:24px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:10px 14px;background:linear-gradient(135deg,#ECFDF5,#D1FAE5);border-radius:10px;border:1px solid #6EE7B7;">
          <span style="font-size:1rem;">✅</span>
          <span style="font-weight:700;font-size:0.92rem;color:#065F46;">Aceptadas</span>
          <span style="font-size:0.75rem;background:#059669;color:white;padding:1px 8px;border-radius:10px;font-weight:600;">${listaAceptadas.length}</span>
        </div>
        ${renderFilas(listaAceptadas)}
      </div>`;
  }

  container.innerHTML = html;
  _actualizarBarraSeleccionEstado();
}

async function cambiarEstadio(id, nuevoEstadio) {
  const p = NEG.propiedades.find(x => x.id === id);
  if (!p) return;
  try {
    await apiPut(`/api/propiedades/${id}`, { ...p, estado_tasacion: nuevoEstadio });
    p.estado_tasacion = nuevoEstadio;
    actualizarStatsListing();
  } catch (e) { showToast('Error al actualizar estadio', 'error'); }
}

// ══ MODAL PROPIEDAD ══
function abrirNuevaPropiedad() {
  const campos = ['propId','propDireccion','propLocalidad','propZona','propNombre',
    'propTelefono','propEmail','propReferido','propUrl','propUltimo','propProximo',
    'propPrelisting','propObservaciones'];
  campos.forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
  document.getElementById('propTipologia').value = '';
  document.getElementById('propEstado').value    = 'pendiente';
  const selResp = document.getElementById('propRespuesta');
  if (selResp) selResp.value = '';
  // Inicializar listas (#6 y #7)
  _propietariosList = [];
  _documentosList   = [];
  renderPropietariosLista();
  renderDocumentosLista();
  document.querySelector('#modalPropiedad .modal-footer .btn-primary').textContent = 'Crear propiedad';
  document.getElementById('modalPropTitulo').textContent = 'Nueva propiedad';
  abrirModal('modalPropiedad');
}

function editarPropiedad(id) {
  const p = NEG.propiedades.find(x => x.id === id);
  if (!p) return;
  document.getElementById('propId').value            = p.id;
  document.getElementById('propDireccion').value     = p.direccion || '';
  document.getElementById('propLocalidad').value     = p.localidad || '';
  document.getElementById('propZona').value          = p.zona || '';
  document.getElementById('propTipologia').value     = p.tipologia || '';
  document.getElementById('propNombre').value        = p.nombre_propietario || '';
  document.getElementById('propTelefono').value      = p.telefono || '';
  document.getElementById('propEmail').value         = p.email || '';
  document.getElementById('propReferido').value      = p.referido || '';
  document.getElementById('propUrl').value           = p.url || '';
  document.getElementById('propUltimo').value        = p.ultimo_contacto || '';
  document.getElementById('propProximo').value       = p.proximo_contacto || '';
  document.getElementById('propPrelisting').value    = p.fecha_prelisting || '';
  document.getElementById('propObservaciones').value = p.observaciones || '';

  // Estado tasación
  const selEstado  = document.getElementById('propEstado');
  const valEstado  = p.estado_tasacion || 'pendiente';
  if (!Array.from(selEstado.options).find(o => o.value === valEstado)) {
    const opt = document.createElement('option');
    opt.value = valEstado; opt.text = valEstado; opt.hidden = true;
    selEstado.appendChild(opt);
  }
  selEstado.value = valEstado;

  // Respuesta propietario - carga valor real (vacío si no tiene)
  const selResp = document.getElementById('propRespuesta');
  if (selResp) selResp.value = p.respuesta_listing || '';

  // Cargar propietarios existentes (#6)
  _propietariosList = [];
  if (p.nombre_propietario) {
    _propietariosList.push({
      nombre:   p.nombre_propietario,
      telefono: p.telefono || '',
      email:    p.email    || '',
      referido: p.referido || '',
    });
  }
  // Intentar cargar lista JSON si existe
  try {
    const pj = p.propietarios_json;
    if (pj) _propietariosList = JSON.parse(pj);
  } catch(e) {}
  renderPropietariosLista();

  // Cargar documentos existentes (#7)
  _documentosList = [];
  try {
    const dj = p.documentos_json;
    if (dj) _documentosList = JSON.parse(dj);
  } catch(e) {}
  renderDocumentosLista();

  document.querySelector('#modalPropiedad .modal-footer .btn-primary').textContent = 'Guardar cambios';
  document.getElementById('modalPropTitulo').textContent = 'Editar propiedad';
  abrirModal('modalPropiedad');
}

async function guardarPropiedad() {
  const id  = document.getElementById('propId').value;
  const dir = document.getElementById('propDireccion').value.trim();
  if (!dir) { showToast('La dirección es requerida', 'error'); return; }

  // Sincronizar campos legacy desde propietarios (#6)
  const primerProp = _propietariosList[0] || {};

  const body = {
    direccion:          dir,
    localidad:          document.getElementById('propLocalidad').value,
    zona:               document.getElementById('propZona').value,
    tipologia:          document.getElementById('propTipologia').value,
    estado_tasacion:    document.getElementById('propEstado').value,
    estadio:            document.getElementById('propEstado').value,
    nombre_propietario: primerProp.nombre   || document.getElementById('propNombre')?.value   || '',
    telefono:           primerProp.telefono || document.getElementById('propTelefono')?.value || '',
    email:              primerProp.email    || document.getElementById('propEmail')?.value    || '',
    referido:           primerProp.referido || document.getElementById('propReferido')?.value || '',
    url:                document.getElementById('propUrl').value,
    ultimo_contacto:    document.getElementById('propUltimo').value,
    proximo_contacto:   document.getElementById('propProximo').value,
    fecha_prelisting:   document.getElementById('propPrelisting').value,
    observaciones:      document.getElementById('propObservaciones').value,
    respuesta_listing:  document.getElementById('propRespuesta')?.value || '',
    propietarios_json:  document.getElementById('propPropietariosJSON')?.value || '[]',
    documentos_json:    document.getElementById('propDocumentosJSON')?.value   || '[]',
  };

  try {
    if (id) await apiPut(`/api/propiedades/${id}`, body);
    else    await apiPost('/api/propiedades', body);
    cerrarModal('modalPropiedad');
    showToast(id ? 'Propiedad actualizada' : 'Propiedad creada');
    await cargarPropiedades();

    // 📅 Ofrecer agendar si hay fecha de prelisting o próximo contacto
    const fechaAgendar = body.fecha_prelisting || body.proximo_contacto;
    const estadio      = body.estadio || body.estado_tasacion || '';
    if (fechaAgendar || ['en_tasacion','captado'].includes(estadio)) {
      const tipo = body.fecha_prelisting ? 'Prelisting' : ['en_tasacion','captado'].includes(estadio) ? (ESTADIO_MAP[estadio]?.label || estadio) : 'Seguimiento';
      setTimeout(() => {
        pedirAgendarEnCalendar({
          titulo:      `${tipo} — ${dir}`,
          descripcion: `📋 ${tipo} · ${dir}${body.localidad ? ', ' + body.localidad : ''}${body.nombre_propietario ? ' · ' + body.nombre_propietario : ''}${body.telefono ? ' · ' + body.telefono : ''}`,
          fecha:       fechaAgendar || '',
          hora:        '10:00',
          notas:       body.observaciones || '',
        });
      }, 300);
    }
  } catch (e) { showToast(e.message, 'error'); }
}

async function eliminarPropiedad(id) {
  if (!confirmar('¿Eliminar esta propiedad? No se puede deshacer.')) return;
  try {
    await apiDelete(`/api/propiedades/${id}`);
    showToast('Propiedad eliminada');
    await cargarPropiedades();
  } catch (e) { showToast(e.message, 'error'); }
}

function abrirWA(tel, nombre) {
  window.open(buildWhatsAppUrl(tel, `Hola ${nombre}!`), '_blank');
}

function verMasNegocio(direccion) {
  // Ir a la tab Actividad Listing y filtrar por esa propiedad
  const tabBtn = document.querySelector('.tab-btn[data-tab="actividad"]') ||
                 [...document.querySelectorAll('.tab-btn')].find(b => b.textContent.includes('Actividad'));
  if (tabBtn) {
    switchTab('actividad', tabBtn);
    // Esperar render y luego filtrar
    setTimeout(() => {
      if (typeof ACT !== 'undefined' && ACT.propiedades && ACT.propiedades.length > 0) {
        const filtroEl = document.getElementById('filtroActividadEstado');
        // Scroll al card de esa propiedad
        const cards = document.querySelectorAll('#actividadGrid .card');
        cards.forEach(card => {
          const title = card.querySelector('[style*="font-weight:700"]');
          if (title && title.textContent.trim().toLowerCase().includes(direccion.toLowerCase())) {
            card.scrollIntoView({ behavior: 'smooth', block: 'start' });
            card.style.outline = '2.5px solid var(--rx-blue)';
            card.style.borderRadius = '14px';
            setTimeout(() => card.style.outline = '', 2500);
          }
        });
      }
    }, 400);
  } else {
    showToast('Actividad Listing: buscá "' + direccion + '"', 'info');
  }
}

// ══ CONTACTOS ══
async function cargarContactos() {
  try {
    const data = await apiGet('/api/contactos');
    NEG.contactos = data.contactos || [];
    renderContactos();
  } catch (e) { showToast('Error al cargar contactos', 'error'); }
}

function filtrarContactos() { renderContactos(); }

// Letra activa del filtro alfabético
let _ctcLetraFiltro = '';

function filtrarLetraContacto(letra) {
  _ctcLetraFiltro = (_ctcLetraFiltro === letra) ? '' : letra; // toggle
  renderContactos();
}

function limpiarFiltroAlfabeto() {
  _ctcLetraFiltro = '';
  renderContactos();
}

function renderContactos() {
  const q    = (document.getElementById('filtroContactos')?.value || '').toLowerCase();
  const tipo = document.getElementById('filtroTipoContacto')?.value || '';

  let lista = NEG.contactos.filter(c =>
    (!q || (c.nombre||'').toLowerCase().includes(q) || (c.telefono||'').includes(q) || (c.email||'').toLowerCase().includes(q)) &&
    (!tipo || c.tipo === tipo) &&
    (!_ctcLetraFiltro || (c.nombre||'')[0].toUpperCase() === _ctcLetraFiltro)
  );

  const container = document.getElementById('contactosGrid');
  if (!container) return;

  const TIPO_COLORS = {
    propietario: { bg:'#EEF2FF', color:'#1B3FE4' },
    cliente:     { bg:'#ECFDF5', color:'#059669' },
    broker:      { bg:'#FFF7ED', color:'#F97316' },
    proveedor:   { bg:'#F3F4F6', color:'#6B7280' },
    otro:        { bg:'#F3F4F6', color:'#6B7280' },
  };

  // Letras que tienen contactos (de toda la lista sin filtro alfabético)
  const todosNombres = NEG.contactos
    .filter(c => (!q || (c.nombre||'').toLowerCase().includes(q)) && (!tipo || c.tipo === tipo));
  const letrasConDatos = new Set(todosNombres.map(c => (c.nombre||'?')[0].toUpperCase()));

  // Índice alfabético — siempre completo, letras activas en azul
  const todasLetras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const indiceHtml = `
    <div style="margin-bottom:14px;">
      <div style="display:flex;flex-wrap:wrap;gap:4px;padding:10px 14px;background:var(--cream);border-radius:8px;border:1px solid var(--border);align-items:center;">
        ${todasLetras.map(l => {
          const tieneDatos = letrasConDatos.has(l);
          const esFiltro   = _ctcLetraFiltro === l;
          if (tieneDatos) {
            return `<button onclick="filtrarLetraContacto('${l}')"
              style="width:28px;height:28px;border-radius:6px;border:none;cursor:pointer;font-size:0.78rem;font-weight:700;
              background:${esFiltro ? 'var(--rx-blue)' : 'white'};
              color:${esFiltro ? 'white' : 'var(--rx-blue)'};
              border:1.5px solid var(--rx-blue);transition:all 0.1s;">${l}</button>`;
          } else {
            return `<span style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:0.78rem;color:#d1d5db;">${l}</span>`;
          }
        }).join('')}
        ${_ctcLetraFiltro
          ? `<button onclick="limpiarFiltroAlfabeto()"
              style="margin-left:8px;padding:4px 12px;border-radius:6px;border:1px solid #e0e0e0;background:white;color:#666;font-size:0.75rem;cursor:pointer;font-weight:600;">
              ✕ Limpiar (${_ctcLetraFiltro})
            </button>`
          : ''}
      </div>
      ${_ctcLetraFiltro ? `<div style="font-size:0.78rem;color:var(--rx-blue);margin-top:6px;padding-left:4px;">Mostrando contactos que empiezan con <strong>${_ctcLetraFiltro}</strong></div>` : ''}
    </div>`;

  if (lista.length === 0) {
    container.innerHTML = indiceHtml + `<div class="empty-state">${_ctcLetraFiltro ? 'No hay contactos con la letra ' + _ctcLetraFiltro : 'No hay contactos cargados'}</div>`;
    return;
  }

  // Agrupar por inicial (solo si no hay filtro de letra activo)
  let listaHtml = '';
  if (_ctcLetraFiltro) {
    // Sin agrupación cuando hay filtro activo
    listaHtml = lista.map(c => renderContactoRow(c, TIPO_COLORS)).join('');
  } else {
    const grupos = {};
    lista.forEach(c => {
      const inicial = (c.nombre || '?')[0].toUpperCase();
      if (!grupos[inicial]) grupos[inicial] = [];
      grupos[inicial].push(c);
    });
    const letrasUsadas = Object.keys(grupos).sort();
    listaHtml = letrasUsadas.map(letra => `
      <div style="margin-bottom:8px;">
        <div style="font-size:0.72rem;font-weight:700;color:var(--rx-blue);padding:6px 2px 4px;
          border-bottom:2px solid var(--rx-blue-light);margin-bottom:6px;letter-spacing:1px;">${letra}</div>
        ${grupos[letra].map(c => renderContactoRow(c, TIPO_COLORS)).join('')}
      </div>`).join('');
  }

  container.innerHTML = indiceHtml + listaHtml;
}

function renderContactoRow(ct, TIPO_COLORS) {
  const tc = TIPO_COLORS[ct.tipo] || TIPO_COLORS.otro;
  let cumpleBadge = '';
  if (ct.cumpleanos) {
    const hoy = new Date(); const cum = new Date(ct.cumpleanos);
    const proxCum = new Date(hoy.getFullYear(), cum.getMonth(), cum.getDate());
    if (proxCum < hoy) proxCum.setFullYear(hoy.getFullYear() + 1);
    const dias = Math.ceil((proxCum - hoy) / 86400000);
    if (dias <= 30) cumpleBadge = `<span style="font-size:0.68rem;background:#FFF7ED;color:#F97316;border-radius:8px;padding:1px 6px;font-weight:600;">🎂 ${dias === 0 ? '¡Hoy!' : 'en ' + dias + 'd'}</span>`;
  }
  const calColors = { 'A+':'#059669','B':'#2563EB','C':'#D97706','D':'#DC2626' };
  const calBadge  = ct.calificacion
    ? `<span style="font-size:0.68rem;padding:1px 7px;border-radius:8px;font-weight:700;background:${calColors[ct.calificacion]||'#888'}22;color:${calColors[ct.calificacion]||'#888'};border:1px solid ${calColors[ct.calificacion]||'#888'}44;">★ ${ct.calificacion}</span>`
    : '';
  return `
    <div class="card" style="padding:12px 16px;display:flex;align-items:center;gap:14px;margin-bottom:6px;cursor:pointer;"
      data-ctcid="${ct.id}" onclick="editarContacto(this.dataset.ctcid)" title="Click para editar">
      <div style="width:38px;height:38px;border-radius:50%;background:${tc.bg};color:${tc.color};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1rem;flex-shrink:0;">
        ${escHtml((ct.nombre||'?')[0].toUpperCase())}
      </div>
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <span style="font-weight:600;font-size:0.9rem;color:var(--rx-blue);text-decoration:underline dotted;">${escHtml(ct.nombre)}</span>
          <span style="font-size:0.68rem;padding:1px 7px;border-radius:10px;font-weight:600;background:${tc.bg};color:${tc.color};">${ct.tipo||'otro'}</span>
          ${calBadge}${cumpleBadge}
        </div>
        <div style="display:flex;gap:12px;margin-top:3px;font-size:0.79rem;color:#666;flex-wrap:wrap;">
          ${ct.profesion ? `<span>💼 ${escHtml(ct.profesion)}</span>` : ''}
          ${ct.telefono  ? `<span>📞 ${escHtml(ct.telefono)}</span>`  : ''}
          ${ct.email     ? `<span>✉️ ${escHtml(ct.email)}</span>`     : ''}
          ${ct.localidad ? `<span>📍 ${escHtml(ct.localidad)}</span>` : ''}
          ${ct.zona      ? `<span>🗺️ ${escHtml(ct.zona)}</span>`      : ''}
          ${ct.barrio    ? `<span>🏘️ ${escHtml(ct.barrio)}</span>`    : ''}
          ${ct.referido  ? `<span>🔗 Ref: ${escHtml(ct.referido)}</span>` : ''}
        </div>
        ${ct.hobbies ? `<div style="font-size:0.75rem;color:#aaa;margin-top:2px;">🎯 ${escHtml(ct.hobbies)}</div>` : ''}
        ${ct.notas   ? `<div style="font-size:0.74rem;color:#ccc;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:520px;">${escHtml(ct.notas)}</div>` : ''}
      </div>
      <div style="display:flex;gap:4px;flex-shrink:0;" onclick="event.stopPropagation()">
        ${ct.telefono ? `<button class="btn-icon-sm" data-tel="${escHtml(ct.telefono)}" onclick="event.stopPropagation();window.open(buildWhatsAppUrl(this.dataset.tel,''),'_blank')" title="WhatsApp">💬</button>` : ''}
        <button class="btn-icon-sm" data-id="${ct.id}" onclick="event.stopPropagation();editarContacto(this.dataset.id)" title="Editar">✏️</button>
        <button class="btn-icon-sm danger" data-id="${ct.id}" onclick="event.stopPropagation();eliminarContacto(this.dataset.id)" title="Eliminar">🗑️</button>
      </div>
    </div>`;
}

function abrirNuevoContacto() {
  ['ctcId','ctcNombre','ctcTelefono','ctcEmail','ctcLocalidad','ctcNotas',
   'ctcCumple','ctcProfesion','ctcHobbies','ctcBarrio','ctcReferido'].forEach(id => {
    const e = document.getElementById(id); if (e) e.value = '';
  });
  const z = document.getElementById('ctcZona');       if (z)   z.value   = '';
  const cal = document.getElementById('ctcCalificacion'); if (cal) cal.value = '';
  document.getElementById('ctcTipo').value = 'propietario';
  document.getElementById('modalCtcTitulo').textContent = 'Nuevo contacto';
  abrirModal('modalContacto');
}

function editarContacto(id) {
  const c = NEG.contactos.find(x => x.id === id);
  if (!c) return;
  document.getElementById('ctcId').value        = c.id;
  document.getElementById('ctcNombre').value    = c.nombre    || '';
  document.getElementById('ctcTipo').value      = c.tipo      || 'otro';
  document.getElementById('ctcTelefono').value  = c.telefono  || '';
  document.getElementById('ctcEmail').value     = c.email     || '';
  document.getElementById('ctcLocalidad').value = c.localidad || '';
  document.getElementById('ctcNotas').value     = c.notas     || '';
  document.getElementById('ctcCumple').value    = c.cumpleanos || '';
  document.getElementById('ctcProfesion').value = c.profesion  || '';
  document.getElementById('ctcHobbies').value   = c.hobbies    || '';
  const bEl = document.getElementById('ctcBarrio');      if (bEl) bEl.value = c.barrio    || '';
  const rEl = document.getElementById('ctcReferido');    if (rEl) rEl.value = c.referido  || '';
  const zEl = document.getElementById('ctcZona');        if (zEl) zEl.value = c.zona      || '';
  const cEl = document.getElementById('ctcCalificacion');if (cEl) cEl.value = c.calificacion || '';
  document.getElementById('modalCtcTitulo').textContent = 'Editar contacto';
  abrirModal('modalContacto');
}

async function guardarContacto() {
  const id     = document.getElementById('ctcId').value;
  const nombre = document.getElementById('ctcNombre').value.trim();
  if (!nombre) { showToast('El nombre es requerido', 'error'); return; }
  const cumple = document.getElementById('ctcCumple').value;
  const body = {
    nombre,
    tipo:          document.getElementById('ctcTipo').value,
    telefono:      document.getElementById('ctcTelefono').value,
    email:         document.getElementById('ctcEmail').value,
    localidad:     document.getElementById('ctcLocalidad').value,
    notas:         document.getElementById('ctcNotas').value,
    cumpleanos:    cumple,
    profesion:     document.getElementById('ctcProfesion').value,
    hobbies:       document.getElementById('ctcHobbies').value,
    barrio:        document.getElementById('ctcBarrio')?.value       || '',
    referido:      document.getElementById('ctcReferido')?.value     || '',
    zona:          document.getElementById('ctcZona')?.value         || '',
    calificacion:  document.getElementById('ctcCalificacion')?.value || '',
  };
  try {
    if (id) await apiPut(`/api/contactos/${id}`, body);
    else    await apiPost('/api/contactos', body);
    cerrarModal('modalContacto');
    showToast('Contacto guardado');
    await cargarContactos();

    // 📅 Si tiene cumpleaños, ofrecer agendar recordatorio anual
    if (cumple) {
      setTimeout(() => {
        // Armar la próxima fecha de cumpleaños
        const hoy = new Date();
        const cum = new Date(cumple);
        const proxAnio = hoy.getFullYear();
        let proxCum = `${proxAnio}-${String(cum.getMonth()+1).padStart(2,'0')}-${String(cum.getDate()).padStart(2,'0')}`;
        if (proxCum < hoy.toISOString().split('T')[0]) {
          proxCum = `${proxAnio+1}-${String(cum.getMonth()+1).padStart(2,'0')}-${String(cum.getDate()).padStart(2,'0')}`;
        }
        pedirAgendarEnCalendar({
          titulo:      `🎂 Cumpleaños — ${nombre}`,
          descripcion: `🎂 Cumpleaños de ${nombre}${body.telefono ? ' · 📞 ' + body.telefono : ''}${body.profesion ? ' · ' + body.profesion : ''}`,
          fecha:       proxCum,
          hora:        '09:00',
          notas:       `Recordatorio anual cumpleaños de ${nombre}`,
        });
      }, 300);
    }
  } catch (e) { showToast(e.message, 'error'); }
}

async function eliminarContacto(id) {
  if (!confirmar('¿Eliminar este contacto?')) return;
  try {
    await apiDelete(`/api/contactos/${id}`);
    showToast('Contacto eliminado');
    await cargarContactos();
  } catch (e) { showToast(e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════
// ── ACTIVIDAD DE PROPIEDADES ──
// ══════════════════════════════════════════════════════════

const ACT = { consultas: [], propiedades: [] };


function abrirWAActividadNeg(cid) {
  // Si LEADS está disponible (mismo contexto), usar overlay
  if (typeof abrirWAConMensajes === 'function' && typeof LEADS !== 'undefined') {
    const c = LEADS.consultas.find(x => x.id === cid);
    if (c) { abrirWAConMensajes(cid); return; }
  }
  // Fallback: abrir directo
  const c = ACT.consultas.find(x => x.id === cid);
  if (c && c.telefono) window.open(buildWhatsAppUrl(c.telefono, `Hola ${c.nombre||''}!`), '_blank');
}

function abrirWALead(tel, nombre, direccion) {
  const msg = nombre
    ? `Hola ${nombre}, te contacto por la propiedad ${direccion}`
    : `Te contacto por la propiedad ${direccion}`;
  window.open(buildWhatsAppUrl(tel, msg), '_blank');
}

async function cargarActividad() {
  try {
    const [dataProp, dataLeads] = await Promise.all([
      apiGet('/api/propiedades'),
      apiGet('/api/consultas'),
    ]);
    ACT.propiedades = dataProp.propiedades || [];
    ACT.consultas   = dataLeads.consultas  || [];
    renderActividad();
  } catch(e) { showToast('Error al cargar actividad', 'error'); }
}

function renderActividad() {
  const filtroEst = (document.getElementById('filtroActividadEstado')?.value || '').toLowerCase();

  // Solo publicadas/reservadas
  let props = ACT.propiedades.filter(p => {
    const est = (p.estado_tasacion || p.estadio || '').toLowerCase().trim();
    return ['publicado','reservado','publicada','reservada'].includes(est);
  });
  if (filtroEst) props = props.filter(p => (p.estado_tasacion || p.estadio || '').toLowerCase().includes(filtroEst));

  // Stats globales
  const todasProps = ACT.propiedades; // para stats de respuesta (incluye todas)
  const totalLeads   = ACT.consultas.filter(c => props.some(p => p.direccion && c.propiedad_nombre === p.direccion)).length;
  const totalVisitas = ACT.consultas.filter(c => ['visito','visitó'].includes((c.estado||'').toLowerCase()) && props.some(p => p.direccion && c.propiedad_nombre === p.direccion)).length;
  const pendVisita   = ACT.consultas.filter(c => c.estado === 'pendiente_visita' && props.some(p => p.direccion && c.propiedad_nombre === p.direccion)).length;
  // Respuesta propietario stats
  const nAceptadas  = todasProps.filter(p => p.respuesta_listing === 'aceptado').length;
  const nRechazadas = todasProps.filter(p => p.respuesta_listing === 'rechazado').length;
  const nEsperando  = todasProps.filter(p => (p.respuesta_listing||'esperando_respuesta') === 'esperando_respuesta').length;

  const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setEl('actTotalProps',  props.length);
  setEl('actTotalLeads',  totalLeads);
  setEl('actTotalVisitas',totalVisitas);
  setEl('actPendVisita',  pendVisita);
  setEl('actRespAcept',   nAceptadas);
  setEl('actRespRech',    nRechazadas);
  setEl('actRespEsp',     nEsperando);

  const container = document.getElementById('actividadGrid');
  if (!container) return;

  if (props.length === 0) {
    container.innerHTML = `<div class="empty-state">No hay propiedades publicadas o reservadas en cartera.<br>
      <span style="font-size:0.8rem;color:#aaa;">Cambiá el estado de una propiedad a Publicado o Reservado en el Listing.</span></div>`;
    return;
  }

  const ESTADIO_LABELS = {
    'nuevo':            { label:'Nuevo',            color:'#6B7280', bg:'#F3F4F6' },
    'pendiente_visita': { label:'Pendiente visita',  color:'#7C3AED', bg:'#F5F3FF' },
    'contesto':         { label:'Contestó',          color:'#D97706', bg:'#FFFBEB' },
    'seguimiento':      { label:'Seguimiento',       color:'#2563EB', bg:'#EFF6FF' },
    'visito':           { label:'Visitó ✓',          color:'#059669', bg:'#ECFDF5' },
  };

  container.innerHTML = props.map(p => {
    const est = (p.estado_tasacion || p.estadio || '').toLowerCase();
    const esPublicado = est.includes('publ');
    const badgeColor = esPublicado ? '#059669' : '#DC2626';
    const badgeBg    = esPublicado ? '#ECFDF5' : '#FEF2F2';
    const badgeLabel = esPublicado ? '🟢 Publicado' : '🔴 Reservado';

    // Consultas asociadas a esta propiedad
    const consultas = ACT.consultas.filter(c =>
      c.propiedad_nombre && p.direccion &&
      c.propiedad_nombre.trim().toLowerCase() === p.direccion.trim().toLowerCase()
    );

    const nVisitas  = consultas.filter(c => ['visito','visitó'].includes((c.estado||'').toLowerCase())).length;
    const nPendVis  = consultas.filter(c => c.estado === 'pendiente_visita').length;
    const nSeguim   = consultas.filter(c => c.estado === 'seguimiento').length;
    const nNuevos   = consultas.filter(c => c.estado === 'nuevo').length;

    return `
    <div class="card" style="padding:0;margin-bottom:16px;overflow:hidden;">

      <!-- Header propiedad -->
      <div style="padding:14px 18px;background:linear-gradient(135deg,#f8f9ff,#f0f4ff);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
            <span style="font-weight:700;font-size:0.95rem;color:var(--rx-blue);cursor:pointer;text-decoration:underline dotted;"
              data-pid="${p.id}" onclick="abrirModalInfoPropiedad(this.dataset.pid)">${escHtml(p.direccion || '—')}</span>
            <span style="font-size:0.7rem;padding:2px 9px;border-radius:12px;font-weight:700;background:${badgeBg};color:${badgeColor};">${badgeLabel}</span>
            ${p.tipologia ? `<span style="font-size:0.72rem;color:#888;background:#f3f4f6;padding:2px 7px;border-radius:8px;">${escHtml(p.tipologia)}</span>` : ''}
          </div>
          <div style="font-size:0.79rem;color:#888;display:flex;gap:12px;flex-wrap:wrap;">
            ${p.localidad ? `<span>📍 ${escHtml(p.localidad)}</span>` : ''}
            ${p.nombre_propietario ? `<span>👤 ${escHtml(p.nombre_propietario)}</span>` : ''}
            ${p.url ? `<a href="${escHtml(p.url)}" target="_blank" style="color:var(--rx-blue);text-decoration:none;font-size:0.78rem;">🔗 Ver ficha</a>` : ''}
          </div>
        </div>
        <!-- Contadores rápidos -->
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <div style="text-align:center;padding:6px 12px;background:white;border-radius:8px;border:1px solid var(--border);min-width:52px;">
            <div style="font-size:1.1rem;font-weight:700;color:var(--rx-blue);">${consultas.length}</div>
            <div style="font-size:0.62rem;color:#888;white-space:nowrap;">Consultas</div>
          </div>
          <div style="text-align:center;padding:6px 12px;background:white;border-radius:8px;border:1px solid var(--border);min-width:52px;">
            <div style="font-size:1.1rem;font-weight:700;color:#059669;">${nVisitas}</div>
            <div style="font-size:0.62rem;color:#888;">Visitaron</div>
          </div>
          <div style="text-align:center;padding:6px 12px;background:white;border-radius:8px;border:1px solid var(--border);min-width:52px;">
            <div style="font-size:1.1rem;font-weight:700;color:#7C3AED;">${nPendVis}</div>
            <div style="font-size:0.62rem;color:#888;white-space:nowrap;">Pend. visita</div>
          </div>
          <div style="text-align:center;padding:6px 12px;background:white;border-radius:8px;border:1px solid var(--border);min-width:52px;">
            <div style="font-size:1.1rem;font-weight:700;color:#2563EB;">${nSeguim}</div>
            <div style="font-size:0.62rem;color:#888;">Seguim.</div>
          </div>
        </div>
      </div>

      <!-- Lista de consultas -->
      ${consultas.length === 0
        ? `<div style="padding:18px 18px;text-align:center;color:#bbb;font-size:0.82rem;">Sin consultas asociadas todavía</div>`
        : `<div style="padding:10px 18px 14px;">
            <div style="font-size:0.72rem;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">
              Consultas (${consultas.length})
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;">
              ${consultas.map(c => {
                const estadio = ESTADIO_LABELS[c.estado] || { label: c.estado, color:'#888', bg:'#f3f4f6' };
                return `
                  <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;background:${estadio.bg}22;border:1px solid ${estadio.color}22;flex-wrap:wrap;">
                  <div style="flex:1;min-width:0;">
                      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                        <span style="font-weight:600;font-size:0.85rem;color:var(--rx-blue);cursor:pointer;text-decoration:underline dotted;"
                          data-cid="${c.id}" onclick="abrirFichaDesdeActividad(this.dataset.cid)">${escHtml(c.nombre || 'Sin nombre')}</span>
                        <span style="font-size:0.68rem;padding:1px 7px;border-radius:10px;font-weight:600;background:${estadio.bg};color:${estadio.color};">${estadio.label}</span>
                        ${c.fecha_visita ? `<span style="font-size:0.68rem;background:#EDE9FE;color:#7C3AED;border-radius:8px;padding:1px 6px;">📅 ${formatFecha(c.fecha_visita)}</span>` : ''}
                      </div>
                      <div style="font-size:0.75rem;color:#888;margin-top:2px;display:flex;gap:10px;flex-wrap:wrap;">
                        ${c.telefono   ? `<span>📞 ${escHtml(c.telefono)}</span>` : ''}
                        ${c.presupuesto? `<span>💰 ${escHtml(c.presupuesto)}</span>` : ''}
                        ${c.operacion  ? `<span>🔑 ${escHtml(c.operacion)}</span>` : ''}
                        <span style="color:#ccc;">${formatFecha(c.created_at)}</span>
                      </div>
                      ${c.mensaje || c.notas ? `<div style="font-size:0.73rem;color:#555;margin-top:5px;padding:6px 9px;background:#f8f9fa;border-radius:6px;border-left:3px solid #d1d5db;white-space:pre-line;">${escHtml(c.mensaje || c.notas)}</div>` : ''}
                    </div>
                    <!-- Acciones rápidas -->
                    <div style="display:flex;gap:4px;flex-shrink:0;">
                      ${c.telefono ? `<button class="btn-icon-sm" onclick="abrirWAActividadNeg('${escHtml(c.id)}')" title="WhatsApp"
                        style="background:#25D366;color:white;border:none;border-radius:8px;width:28px;height:28px;font-size:0.9rem;cursor:pointer;display:flex;align-items:center;justify-content:center;">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="14" height="14"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.556 4.121 1.526 5.851L.057 23.868c-.11.415.271.802.687.702l6.225-1.634A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.027-1.384l-.36-.214-3.714.975.992-3.621-.235-.372A9.818 9.818 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/></svg>
                        </button>` : ''}
                      <select class="input-base" style="font-size:0.72rem;padding:3px 6px;height:auto;width:130px;"
                        onchange="cambiarEstadioActividad('${c.id}', this.value, this)">
                        ${Object.entries(ESTADIO_LABELS).map(([k,v]) =>
                          `<option value="${k}" ${c.estado===k?'selected':''}>${v.label}</option>`
                        ).join('')}
                      </select>
                    </div>
                  </div>`;
              }).join('')}
            </div>
          </div>`
      }
    </div>`;
  }).join('');
}

function abrirModalInfoPropiedad(pid) {
  const p = ACT.propiedades.find(x => x.id === pid) || NEG.propiedades.find(x => x.id === pid);
  if (!p) return;
  let ov = document.getElementById('_propInfoOverlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = '_propInfoOverlay';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9100;display:flex;align-items:center;justify-content:center;padding:16px;';
    document.body.appendChild(ov);
  }
  const ESTADIO_MAP2 = { captado:'Captado', publicado:'Publicado', reservado:'Reservado', cerrado:'Cerrado ✓', pendiente:'Pendiente', esperando_respuesta:'Esperando respuesta' };
  ov.innerHTML = `
    <div style="background:white;border-radius:14px;max-width:480px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 12px 40px rgba(0,0,0,0.22);">
      <div style="padding:18px 20px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;">
        <div style="font-weight:700;font-size:1rem;">📋 ${escHtml(p.direccion||'Propiedad')}</div>
        <button onclick="document.getElementById('_propInfoOverlay').style.display='none'"
          style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:#888;">✕</button>
      </div>
      <div style="padding:16px 20px;display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        ${p.localidad    ? `<div><div style="font-size:0.65rem;color:#aaa;font-weight:600;text-transform:uppercase;margin-bottom:2px;">Localidad</div><div style="font-size:0.84rem;">📍 ${escHtml(p.localidad)}${p.zona?' · '+escHtml(p.zona):''}</div></div>` : ''}
        ${p.tipologia    ? `<div><div style="font-size:0.65rem;color:#aaa;font-weight:600;text-transform:uppercase;margin-bottom:2px;">Tipología</div><div style="font-size:0.84rem;">${escHtml(p.tipologia)}</div></div>` : ''}
        ${p.nombre_propietario ? `<div><div style="font-size:0.65rem;color:#aaa;font-weight:600;text-transform:uppercase;margin-bottom:2px;">Propietario</div><div style="font-size:0.84rem;">👤 ${escHtml(p.nombre_propietario)}</div></div>` : ''}
        ${p.telefono     ? `<div><div style="font-size:0.65rem;color:#aaa;font-weight:600;text-transform:uppercase;margin-bottom:2px;">Teléfono</div><div style="font-size:0.84rem;">📞 ${escHtml(p.telefono)}</div></div>` : ''}
        ${p.estado_tasacion ? `<div><div style="font-size:0.65rem;color:#aaa;font-weight:600;text-transform:uppercase;margin-bottom:2px;">Estado</div><div style="font-size:0.84rem;">${ESTADIO_MAP2[p.estado_tasacion]||p.estado_tasacion}</div></div>` : ''}
        ${p.url          ? `<div style="grid-column:span 2;"><div style="font-size:0.65rem;color:#aaa;font-weight:600;text-transform:uppercase;margin-bottom:2px;">Ficha/Portal</div><a href="${escHtml(p.url)}" target="_blank" style="font-size:0.84rem;color:var(--rx-blue);">🔗 Ver ficha</a></div>` : ''}
        ${p.observaciones? `<div style="grid-column:span 2;"><div style="font-size:0.65rem;color:#aaa;font-weight:600;text-transform:uppercase;margin-bottom:4px;">Observaciones</div><div style="font-size:0.82rem;background:#f8f9fa;padding:8px;border-radius:6px;border-left:3px solid #d1d5db;white-space:pre-line;">${escHtml(p.observaciones)}</div></div>` : ''}
      </div>
      <div style="padding:12px 20px;border-top:1px solid #e5e7eb;display:flex;gap:8px;justify-content:flex-end;">
        <button onclick="document.getElementById('_propInfoOverlay').style.display='none';editarPropiedad('${p.id}')"
          style="padding:7px 16px;border-radius:8px;border:1px solid #e5e7eb;background:white;cursor:pointer;font-size:0.84rem;font-weight:600;">✏️ Editar</button>
        <button onclick="document.getElementById('_propInfoOverlay').style.display='none'"
          style="padding:7px 16px;border-radius:8px;border:none;background:var(--rx-blue);color:white;cursor:pointer;font-size:0.84rem;font-weight:600;">Cerrar</button>
      </div>
    </div>`;
  ov.style.display = 'flex';
  ov.onclick = e => { if (e.target === ov) ov.style.display = 'none'; };
}

function abrirFichaDesdeActividad(cid) {
  // Intentar abrir ficha desde LEADS (si está disponible) o mostrar modal simple
  if (typeof abrirFichaLead === 'function' && typeof LEADS !== 'undefined') {
    const c = LEADS.consultas.find(x => x.id === cid);
    if (c) { abrirFichaLead(cid); return; }
  }
  // Buscar en ACT
  const c = ACT.consultas.find(x => x.id === cid);
  if (!c) return;
  let ov = document.getElementById('_leadInfoOverlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = '_leadInfoOverlay';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9100;display:flex;align-items:center;justify-content:center;padding:16px;';
    document.body.appendChild(ov);
  }
  ov.innerHTML = `
    <div style="background:white;border-radius:14px;max-width:460px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 12px 40px rgba(0,0,0,0.22);">
      <div style="padding:18px 20px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;">
        <div style="font-weight:700;font-size:1rem;">👤 ${escHtml(c.nombre||'Lead')}</div>
        <button onclick="document.getElementById('_leadInfoOverlay').style.display='none'"
          style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:#888;">✕</button>
      </div>
      <div style="padding:16px 20px;display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        ${c.telefono    ? `<div><div style="font-size:0.65rem;color:#aaa;font-weight:600;text-transform:uppercase;margin-bottom:2px;">Teléfono</div><div style="font-size:0.84rem;">📞 ${escHtml(c.telefono)}</div></div>` : ''}
        ${c.operacion   ? `<div><div style="font-size:0.65rem;color:#aaa;font-weight:600;text-transform:uppercase;margin-bottom:2px;">Operación</div><div style="font-size:0.84rem;">${escHtml(c.operacion)}</div></div>` : ''}
        ${c.presupuesto ? `<div><div style="font-size:0.65rem;color:#aaa;font-weight:600;text-transform:uppercase;margin-bottom:2px;">Presupuesto</div><div style="font-size:0.84rem;">💰 ${escHtml(c.presupuesto)}</div></div>` : ''}
        ${c.propiedad_nombre ? `<div><div style="font-size:0.65rem;color:#aaa;font-weight:600;text-transform:uppercase;margin-bottom:2px;">Propiedad</div><div style="font-size:0.84rem;">🏠 ${escHtml(c.propiedad_nombre)}</div></div>` : ''}
        ${c.zona_interes? `<div><div style="font-size:0.65rem;color:#aaa;font-weight:600;text-transform:uppercase;margin-bottom:2px;">Zona</div><div style="font-size:0.84rem;">📍 ${escHtml(c.zona_interes)}</div></div>` : ''}
        ${c.fecha_visita? `<div><div style="font-size:0.65rem;color:#aaa;font-weight:600;text-transform:uppercase;margin-bottom:2px;">Fecha visita</div><div style="font-size:0.84rem;color:#7C3AED;font-weight:600;">📅 ${formatFecha(c.fecha_visita)}</div></div>` : ''}
        ${c.mensaje||c.notas ? `<div style="grid-column:span 2;"><div style="font-size:0.65rem;color:#aaa;font-weight:600;text-transform:uppercase;margin-bottom:4px;">Notas / Observaciones</div><div style="font-size:0.82rem;background:#f8f9fa;padding:8px;border-radius:6px;border-left:3px solid #d1d5db;white-space:pre-line;">${escHtml(c.mensaje||c.notas)}</div></div>` : ''}
      </div>
      <div style="padding:12px 20px;border-top:1px solid #e5e7eb;text-align:right;">
        <button onclick="document.getElementById('_leadInfoOverlay').style.display='none'"
          style="padding:7px 16px;border-radius:8px;border:none;background:var(--rx-blue);color:white;cursor:pointer;font-size:0.84rem;font-weight:600;">Cerrar</button>
      </div>
    </div>`;
  ov.style.display = 'flex';
  ov.onclick = e => { if (e.target === ov) ov.style.display = 'none'; };
}

async function cambiarEstadioActividad(id, nuevoEstado, selectEl) {
  const c = ACT.consultas.find(x => x.id === id);
  if (!c) return;
  const estadoAnterior = c.estado;
  try {
    await apiPut(`/api/consultas/${id}`, { ...c, estado: nuevoEstado });
    c.estado = nuevoEstado;
    renderActividad();
    showToast('Estado actualizado ✓');

    // Si pasa a pendiente visita, ofrecer agendar
    if (nuevoEstado === 'pendiente_visita') {
      setTimeout(() => {
        pedirAgendarEnCalendar({
          titulo:      `Visita — ${c.nombre || 'Lead'}`,
          descripcion: `🏠 Visita con ${c.nombre || 'lead'}${c.propiedad_nombre ? ' · ' + c.propiedad_nombre : ''}${c.telefono ? ' · 📞 ' + c.telefono : ''}`,
          fecha:       c.fecha_visita || '',
          hora:        '10:00',
        });
      }, 300);
    }
  } catch(e) {
    if (selectEl) selectEl.value = estadoAnterior;
    showToast(e.message, 'error');
  }
}

// ══════════════════════════════════════════════════════════
// ── #6 PROPIETARIOS MÚLTIPLES CON BASE DE CONTACTOS ──
// ══════════════════════════════════════════════════════════

let _propietariosList = [];  // lista de propietarios de la propiedad actual

function renderPropietariosLista() {
  const cont = document.getElementById('propietariosLista');
  if (!cont) return;
  if (_propietariosList.length === 0) {
    cont.innerHTML = `<div style="font-size:0.8rem;color:#aaa;text-align:center;padding:12px;">Sin propietarios agregados todavía</div>`;
    return;
  }
  cont.innerHTML = `<div style="display:flex;flex-direction:column;gap:6px;">` +
    _propietariosList.map((p, i) => `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;border:1px solid #e5e7eb;background:#f8f9ff;">
        <div style="width:32px;height:32px;border-radius:50%;background:#EFF6FF;color:#2563EB;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;">
          ${escHtml((p.nombre||'?')[0].toUpperCase())}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;font-size:0.85rem;">${escHtml(p.nombre||'—')}</div>
          <div style="font-size:0.75rem;color:#888;display:flex;gap:10px;flex-wrap:wrap;">
            ${p.telefono ? `<span>📞 ${escHtml(p.telefono)}</span>` : ''}
            ${p.email    ? `<span>✉️ ${escHtml(p.email)}</span>`    : ''}
          </div>
        </div>
        <button onclick="quitarPropietario(${i})"
          style="background:none;border:none;cursor:pointer;color:#DC2626;font-size:1rem;padding:4px;" title="Quitar">✕</button>
      </div>`).join('') + `</div>`;
  document.getElementById('propPropietariosJSON').value = JSON.stringify(_propietariosList);
  // Sincronizar campos legacy con el primero
  if (_propietariosList[0]) {
    document.getElementById('propNombre').value   = _propietariosList[0].nombre || '';
    document.getElementById('propTelefono').value = _propietariosList[0].telefono || '';
    document.getElementById('propEmail').value    = _propietariosList[0].email || '';
    document.getElementById('propReferido').value = _propietariosList[0].referido || '';
  }
}

function quitarPropietario(idx) {
  _propietariosList.splice(idx, 1);
  renderPropietariosLista();
}

function abrirAgregarPropietario() {
  document.getElementById('buscarContactoProp').value = '';
  document.getElementById('resultadosBusquedaProp').innerHTML = '';
  ['newPropNombre','newPropTelefono','newPropEmail','newPropReferido'].forEach(id => {
    const e = document.getElementById(id); if (e) e.value = '';
  });
  switchModoAgregarProp('base');
  abrirModal('modalAgregarProp');
}

function switchModoAgregarProp(modo) {
  document.getElementById('modoBaseContacto').style.display = modo === 'base'  ? '' : 'none';
  document.getElementById('modoNuevoProp').style.display    = modo === 'nuevo' ? '' : 'none';
  const btnBase  = document.getElementById('btnDesdeBase');
  const btnNuevo = document.getElementById('btnNuevoProp');
  if (btnBase)  { btnBase.style.background  = modo==='base'  ? 'var(--rx-blue)' : 'white'; btnBase.style.color  = modo==='base'  ? 'white' : '#374151'; }
  if (btnNuevo) { btnNuevo.style.background = modo==='nuevo' ? 'var(--rx-blue)' : 'white'; btnNuevo.style.color = modo==='nuevo' ? 'white' : '#374151'; }
  if (modo === 'base') setTimeout(() => document.getElementById('buscarContactoProp')?.focus(), 100);
}

function buscarContactosParaProp(q) {
  const cont = document.getElementById('resultadosBusquedaProp');
  if (!cont) return;
  const term = q.toLowerCase().trim();
  if (!term) { cont.innerHTML = ''; return; }
  const resultados = NEG.contactos.filter(c =>
    (c.nombre||'').toLowerCase().includes(term) ||
    (c.telefono||'').includes(term) ||
    (c.email||'').toLowerCase().includes(term)
  ).slice(0, 8);
  if (resultados.length === 0) {
    cont.innerHTML = `<div style="padding:12px;font-size:0.82rem;color:#aaa;text-align:center;">No se encontraron contactos</div>`;
    return;
  }
  cont.innerHTML = resultados.map(c => `
    <div onclick="seleccionarContactoProp('${c.id}')"
      style="padding:10px 14px;cursor:pointer;border-bottom:1px solid #f3f4f6;display:flex;gap:10px;align-items:center;"
      onmouseover="this.style.background='#EFF6FF'" onmouseout="this.style.background='white'">
      <div style="width:30px;height:30px;border-radius:50%;background:#EFF6FF;color:#2563EB;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.85rem;flex-shrink:0;">
        ${escHtml((c.nombre||'?')[0].toUpperCase())}
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:0.84rem;">${escHtml(c.nombre)}</div>
        <div style="font-size:0.73rem;color:#888;">
          ${c.telefono ? escHtml(c.telefono) : ''}${c.email ? ' · ' + escHtml(c.email) : ''}
        </div>
      </div>
    </div>`).join('');
}

function seleccionarContactoProp(ctcId) {
  const c = NEG.contactos.find(x => x.id === ctcId);
  if (!c) return;
  const yaExiste = _propietariosList.find(p => p.contacto_id === ctcId);
  if (yaExiste) { showToast('Este contacto ya fue agregado', 'error'); return; }
  _propietariosList.push({
    contacto_id: c.id,
    nombre:      c.nombre,
    telefono:    c.telefono,
    email:       c.email,
    referido:    c.referido,
  });
  renderPropietariosLista();
  cerrarModal('modalAgregarProp');
  showToast(`${c.nombre} agregado como propietario ✓`);
}

async function confirmarNuevoPropietario() {
  const nombre = document.getElementById('newPropNombre')?.value.trim();
  if (!nombre) { showToast('El nombre es requerido', 'error'); return; }
  const nuevo = {
    nombre,
    telefono: document.getElementById('newPropTelefono')?.value || '',
    email:    document.getElementById('newPropEmail')?.value    || '',
    referido: document.getElementById('newPropReferido')?.value || '',
  };
  // Guardar en base de contactos
  try {
    const res = await apiPost('/api/contactos', { ...nuevo, tipo: 'propietario' });
    if (res.id) nuevo.contacto_id = res.id;
    await cargarContactos(); // refrescar lista
  } catch(e) { console.warn('No se pudo guardar en contactos:', e); }
  _propietariosList.push(nuevo);
  renderPropietariosLista();
  cerrarModal('modalAgregarProp');
  showToast(`${nombre} agregado como propietario ✓`);
}

// ══════════════════════════════════════════════════════════
// ── #7 DOCUMENTACIÓN MÚLTIPLE ──
// ══════════════════════════════════════════════════════════

let _documentosList = [];

function renderDocumentosLista() {
  const cont = document.getElementById('documentosLista');
  if (!cont) return;
  if (_documentosList.length === 0) {
    cont.innerHTML = `<div style="font-size:0.78rem;color:#aaa;text-align:center;padding:8px;">Sin documentación cargada</div>`;
    document.getElementById('propDocumentosJSON').value = '[]';
    return;
  }
  const ESTADOS_DOC = ['Pendiente','En trámite','Recibido','Observado'];
  const ICONOS = { pdf:'📄', doc:'📝', docx:'📝', xls:'📊', xlsx:'📊', jpg:'🖼️', jpeg:'🖼️', png:'🖼️', gif:'🖼️', txt:'📋', zip:'🗜️' };
  cont.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:0.8rem;">
    <thead><tr style="background:#f3f4f6;">
      <th style="padding:6px 8px;text-align:left;font-weight:600;color:#374151;">Documento</th>
      <th style="padding:6px 8px;text-align:left;font-weight:600;color:#374151;">Estado</th>
      <th style="padding:6px 8px;text-align:left;font-weight:600;color:#374151;">Notas</th>
      <th style="padding:6px 4px;text-align:center;font-weight:600;color:#374151;">Archivo</th>
      <th style="padding:6px 4px;"></th>
    </tr></thead>
    <tbody>
      ${_documentosList.map((d, i) => {
        const ext = (d.tipo || (d.nombre||'').split('.').pop() || '').toLowerCase();
        const icono = ICONOS[ext] || '📎';
        const hasFile = !!d.dataUrl;
        return `
        <tr style="border-bottom:1px solid #f3f4f6;">
          <td style="padding:6px 8px;">
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="font-size:1rem;">${icono}</span>
              <input type="text" value="${escHtml(d.nombre||'')}" placeholder="Nombre doc."
                onchange="_documentosList[${i}].nombre=this.value;syncDocJSON()"
                style="border:none;background:transparent;width:100%;font-size:0.8rem;outline:none;color:var(--text-primary);">
            </div>
          </td>
          <td style="padding:6px 8px;">
            <select onchange="_documentosList[${i}].estado=this.value;syncDocJSON()"
              style="border:none;background:transparent;font-size:0.78rem;cursor:pointer;color:#2563EB;font-weight:600;">
              ${ESTADOS_DOC.map(s=>`<option ${d.estado===s?'selected':''}>${s}</option>`).join('')}
            </select>
          </td>
          <td style="padding:6px 8px;">
            <input type="text" value="${escHtml(d.notas||'')}" placeholder="Notas..."
              onchange="_documentosList[${i}].notas=this.value;syncDocJSON()"
              style="border:none;background:transparent;width:100%;font-size:0.78rem;outline:none;color:#888;">
          </td>
          <td style="padding:4px;text-align:center;white-space:nowrap;">
            ${hasFile
              ? `<a href="${d.dataUrl}" download="${escHtml(d.nombre||'documento')}"
                  style="font-size:0.78rem;color:#059669;font-weight:600;text-decoration:none;padding:2px 7px;border-radius:6px;border:1px solid #059669;background:#ECFDF5;" title="Descargar">⬇️</a>`
              : `<span style="font-size:0.72rem;color:#ccc;">Sin archivo</span>`}
          </td>
          <td style="padding:4px;">
            <button onclick="quitarDocumento(${i})"
              style="background:none;border:none;cursor:pointer;color:#DC2626;font-size:0.9rem;">✕</button>
          </td>
        </tr>`}).join('')}
    </tbody>
  </table>`;
  syncDocJSON();
}

function onCambioRespuestaPropModal(valor) {
  // Sincronizar estado oculto
  const selEstado = document.getElementById('propEstado');
  if (!selEstado) return;
  if (valor === 'esperando_respuesta') {
    selEstado.value = 'esperando_respuesta';
  } else if (valor === 'pendiente' || valor === '') {
    selEstado.value = 'pendiente';
  } else if (valor === 'aceptado') {
    selEstado.value = 'captado';
  } else {
    selEstado.value = 'completada';
  }
}

function cargarArchivosDocumentacion(files) {
  Array.from(files).forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const ext = file.name.split('.').pop().toLowerCase();
      _documentosList.push({
        nombre: file.name,
        estado: 'Pendiente',
        notas: '',
        dataUrl: dataUrl,
        tipo: ext,
        tamano: file.size,
      });
      renderDocumentosLista();
    };
    reader.readAsDataURL(file);
  });
  // Reset input para poder subir el mismo archivo de nuevo
  document.getElementById('inputArchivoDoc').value = '';
}


function syncDocJSON() {
  const el = document.getElementById('propDocumentosJSON');
  if (el) el.value = JSON.stringify(_documentosList);
}

function agregarDocumento() {
  _documentosList.push({ nombre: '', estado: 'Pendiente', notas: '' });
  renderDocumentosLista();
}

function quitarDocumento(idx) {
  _documentosList.splice(idx, 1);
  renderDocumentosLista();
}
