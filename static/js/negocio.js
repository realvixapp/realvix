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
  nuevo:       { label: 'Nuevo',       color: '#6B7280', bg: '#F3F4F6' },
  en_tasacion: { label: 'En tasación', color: '#7C3AED', bg: '#F5F3FF' },
  captado:     { label: 'Captado',     color: '#2563EB', bg: '#EFF6FF' },
  publicado:   { label: 'Publicado',   color: '#D97706', bg: '#FFFBEB' },
  reservado:   { label: 'Reservado',   color: '#DC2626', bg: '#FEF2F2' },
  cerrado:     { label: 'Cerrado ✓',   color: '#059669', bg: '#ECFDF5' },
};

async function initNegocio() {
  await Promise.all([cargarPropiedades(), cargarContactos()]);
}

// ── TABS ──
function switchTab(tab, btn) {
  NEG.tabActual = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('tabListing').style.display   = tab === 'listing'   ? '' : 'none';
  const tabEst = document.getElementById('tabEstado');
  if (tabEst) tabEst.style.display = 'none'; // removed
  document.getElementById('tabContactos').style.display = tab === 'contactos' ? '' : 'none';
  // actividad moved to propiedades.html
  const tabAct = document.getElementById('tabActividad');
  if (tabAct) tabAct.style.display = 'none';
}

// ══ PROPIEDADES (datos comunes) ══
async function cargarPropiedades() {
  try {
    const data = await apiGet('/api/propiedades');
    NEG.propiedades = data.propiedades || [];
    renderListing();
    renderEstado();
    actualizarStatsListing();
  } catch (e) { showToast('Error al cargar propiedades', 'error'); }
}

// ══ LISTING ══
// Columnas: Dirección · Propietario · Teléfono · Tipología · Estado tasación · Acciones
function filtrarListing() { renderListing(); }

function renderListing() {
  const q    = (document.getElementById('filtroListing')?.value || '').toLowerCase();
  const tipo = document.getElementById('filtroTipoListing')?.value || '';

  const lista = NEG.propiedades.filter(p =>
    (!q || (p.direccion||'').toLowerCase().includes(q) ||
           (p.nombre_propietario||'').toLowerCase().includes(q) ||
           (p.localidad||'').toLowerCase().includes(q)) &&
    (!tipo || p.tipologia === tipo)
  );

  const container = document.getElementById('listingTable');
  if (!container) return;
  if (lista.length === 0) {
    container.innerHTML = `<div class="empty-state">No hay propiedades en el listing</div>`; return;
  }

  const RESP_MAP = {
    'esperando_respuesta':{ label: '⏳ Esperando respuesta', color:'#D97706', bg:'#FFFBEB' },
    'aceptado':           { label: '✅ Aceptado',             color:'#059669', bg:'#ECFDF5' },
    'rechazado':          { label: '❌ Rechazado',            color:'#DC2626', bg:'#FEF2F2' },
    'decide_esperar':     { label: '🕐 Decide esperar',       color:'#7C3AED', bg:'#F5F3FF' },
    'vendio_con_otro':    { label: '🔄 Vendió con otro',      color:'#6B7280', bg:'#F3F4F6' },
  };

  container.innerHTML = `
    <table class="table">
      <thead><tr>
        <th>Dirección</th>
        <th>Propietario</th>
        <th>Teléfono</th>
        <th>Tipología</th>
        <th>Estado tasación</th>
        <th>Respuesta propietario</th>
        <th style="text-align:right">Acciones</th>
      </tr></thead>
      <tbody>
        ${lista.map(p => {
          const est   = ESTADIO_MAP[p.estado_tasacion] || { label: p.estado_tasacion || '—', color: '#888', bg: '#f3f4f6' };
          const resp  = p.respuesta_listing || '';
          const rInfo = RESP_MAP[resp] || RESP_MAP[''];
          return `<tr>
            <td>
              <div style="font-weight:600;">${escHtml(p.direccion || '—')}</div>
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
                ${Object.entries(ESTADIO_MAP).map(([k,v]) =>
                  `<option value="${k}" ${(p.estado_tasacion||'')=== k?'selected':''}>${v.label}</option>`
                ).join('')}
              </select>
            </td>
            <td>
              <select class="input-base" style="font-size:0.75rem;padding:3px 8px;height:auto;border-radius:12px;border-color:${rInfo.color}44;background:${rInfo.bg};color:${rInfo.color};font-weight:600;"
                data-pid="${p.id}"
                onchange="cambiarRespuestaListing(this.dataset.pid, this.value)">
                ${Object.entries(RESP_MAP).map(([k,v]) =>
                  `<option value="${k}" ${resp===k?'selected':''}>${v.label}</option>`
                ).join('')}
              </select>
            </td>
            <td style="text-align:right;white-space:nowrap;">
              ${p.url ? `<a class="btn-icon-sm" href="${escHtml(p.url)}" target="_blank" title="Ver portal">🔗</a>` : ''}
              ${p.telefono ? `<button class="btn-icon-sm" title="WhatsApp" onclick="abrirWA('${escHtml(p.telefono)}','${escHtml(p.nombre_propietario||'')}')">💬</button>` : ''}
              <button class="btn-icon-sm" title="Editar" onclick="editarPropiedad('${p.id}')">✏️</button>
              <button class="btn-icon-sm danger" title="Eliminar" onclick="eliminarPropiedad('${p.id}')">🗑️</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}



async function cambiarRespuestaListing(pid, valor) {
  const p = NEG.propiedades.find(x => x.id === pid);
  if (!p) return;
  try {
    const updates = { ...p, respuesta_listing: valor };
    // Si acepta → auto-mover a Captado (si no estaba ya en captado/publicado/reservado)
    if (valor === 'aceptado') {
      const estActual = (p.estado_tasacion || '').toLowerCase();
      if (!['captado','publicado','reservado','cerrado'].includes(estActual)) {
        updates.estado_tasacion = 'captado';
        updates.estadio = 'captado';
        showToast('✅ Aceptado → movida automáticamente a Captado', 'success');
      } else {
        showToast('Respuesta: Aceptado ✓', 'success');
      }
    } else {
      showToast('Respuesta actualizada ✓');
    }
    await apiPut(`/api/propiedades/${pid}`, updates);
    p.respuesta_listing = valor;
    if (updates.estado_tasacion) p.estado_tasacion = updates.estado_tasacion;
    renderListing();
    actualizarStatsListing();
  } catch(e) { showToast(e.message, 'error'); }
}

async function cambiarEstadioListing(pid, nuevoEstadio) {
  const p = NEG.propiedades.find(x => x.id === pid);
  if (!p) return;
  try {
    await apiPut(`/api/propiedades/${pid}`, { ...p, estado_tasacion: nuevoEstadio, estadio: nuevoEstadio });
    p.estado_tasacion = nuevoEstadio;
    p.estadio = nuevoEstadio;
    actualizarStatsListing();
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

function renderEstado() {
  const q = (document.getElementById('filtroEstadoBuscar')?.value || '').toLowerCase();
  const lista = NEG.propiedades.filter(p => {
    const matchEst = _estadioFiltro === 'todos' || p.estado_tasacion === _estadioFiltro || p.estadio === _estadioFiltro;
    const matchQ   = !q || (p.direccion||'').toLowerCase().includes(q) ||
                          (p.nombre_propietario||'').toLowerCase().includes(q);
    return matchEst && matchQ;
  });

  const container = document.getElementById('estadoTable');
  if (!container) return;
  if (lista.length === 0) {
    container.innerHTML = `<div class="empty-state">No hay propiedades en este estadio</div>`; return;
  }

  const hoy = new Date().toISOString().split('T')[0];

  container.innerHTML = `
    <table class="table">
      <thead><tr>
        <th>Dirección</th>
        <th>Estadio</th>
        <th>Próximo contacto</th>
        <th>Último contacto</th>
        <th>Observaciones</th>
        <th style="text-align:right">Acciones</th>
      </tr></thead>
      <tbody>
        ${lista.map(p => {
          const estadio = p.estado_tasacion || p.estadio || '';
          const est = ESTADIO_MAP[estadio] || { label: estadio || '—', color: '#888', bg: '#f3f4f6' };
          const proximo = p.proximo_contacto || '';
          const vencido = proximo && proximo < hoy;
          const hoyFlag  = proximo === hoy;
          return `<tr>
            <td>
              <div style="font-weight:600;">${escHtml(p.direccion || '—')}</div>
              ${p.nombre_propietario ? `<div style="font-size:0.75rem;color:#888;">${escHtml(p.nombre_propietario)}</div>` : ''}
            </td>
            <td>
              <select class="estadio-inline-select" onchange="cambiarEstadio('${p.id}', this.value)"
                style="font-size:0.78rem;padding:3px 8px;border-radius:20px;border:1px solid ${est.color}44;background:${est.bg};color:${est.color};font-weight:600;cursor:pointer;outline:none;">
                ${Object.entries(ESTADIO_MAP).map(([k,v]) =>
                  `<option value="${k}" ${estadio===k?'selected':''}>${v.label}</option>`
                ).join('')}
              </select>
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
  document.getElementById('propEstado').value = '';
  document.getElementById('propEstadio').value = '';
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
  document.getElementById('propEstado').value        = p.estado_tasacion || '';
  document.getElementById('propEstadio').value       = p.estadio || p.estado_tasacion || '';
  document.getElementById('propNombre').value        = p.nombre_propietario || '';
  document.getElementById('propTelefono').value      = p.telefono || '';
  document.getElementById('propEmail').value         = p.email || '';
  document.getElementById('propReferido').value      = p.referido || '';
  document.getElementById('propUrl').value           = p.url || '';
  document.getElementById('propUltimo').value        = p.ultimo_contacto || '';
  document.getElementById('propProximo').value       = p.proximo_contacto || '';
  document.getElementById('propPrelisting').value    = p.fecha_prelisting || '';
  document.getElementById('propObservaciones').value = p.observaciones || '';
  document.querySelector('#modalPropiedad .modal-footer .btn-primary').textContent = 'Guardar cambios';
  document.getElementById('modalPropTitulo').textContent = 'Editar propiedad';
  abrirModal('modalPropiedad');
}

async function guardarPropiedad() {
  const id  = document.getElementById('propId').value;
  const dir = document.getElementById('propDireccion').value.trim();
  if (!dir) { showToast('La dirección es requerida', 'error'); return; }

  const body = {
    direccion:          dir,
    localidad:          document.getElementById('propLocalidad').value,
    zona:               document.getElementById('propZona').value,
    tipologia:          document.getElementById('propTipologia').value,
    estado_tasacion:    document.getElementById('propEstado').value || document.getElementById('propEstadio').value,
    estadio:            document.getElementById('propEstadio').value,
    nombre_propietario: document.getElementById('propNombre').value,
    telefono:           document.getElementById('propTelefono').value,
    email:              document.getElementById('propEmail').value,
    referido:           document.getElementById('propReferido').value,
    url:                document.getElementById('propUrl').value,
    ultimo_contacto:    document.getElementById('propUltimo').value,
    proximo_contacto:   document.getElementById('propProximo').value,
    fecha_prelisting:   document.getElementById('propPrelisting').value,
    observaciones:      document.getElementById('propObservaciones').value,
    respuesta_listing:  id ? (NEG.propiedades.find(x=>x.id===id)?.respuesta_listing||'esperando_respuesta') : 'esperando_respuesta',
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
  // Use data-id attribute to avoid quote nesting issues
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
          ${cumpleBadge}
        </div>
        <div style="display:flex;gap:14px;margin-top:3px;font-size:0.79rem;color:#666;flex-wrap:wrap;">
          ${ct.profesion ? `<span>💼 ${escHtml(ct.profesion)}</span>` : ''}
          ${ct.telefono  ? `<span>📞 ${escHtml(ct.telefono)}</span>`  : ''}
          ${ct.email     ? `<span>✉️ ${escHtml(ct.email)}</span>`     : ''}
          ${ct.localidad ? `<span>📍 ${escHtml(ct.localidad)}</span>` : ''}
        </div>
        ${ct.hijos || ct.hobbies ? `<div style="font-size:0.75rem;color:#aaa;margin-top:2px;">${ct.hijos ? '👨‍👧‍👦 ' + escHtml(ct.hijos) : ''}${ct.hijos && ct.hobbies ? ' · ' : ''}${ct.hobbies ? '🎯 ' + escHtml(ct.hobbies) : ''}</div>` : ''}
        ${ct.gustos ? `<div style="font-size:0.75rem;color:#aaa;">🏠 ${escHtml(ct.gustos)}</div>` : ''}
        ${ct.notas  ? `<div style="font-size:0.74rem;color:#ccc;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:520px;">${escHtml(ct.notas)}</div>` : ''}
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
   'ctcCumple','ctcProfesion','ctcHijos','ctcHobbies','ctcGustos'].forEach(id => {
    const e = document.getElementById(id); if (e) e.value = '';
  });
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
  document.getElementById('ctcHijos').value     = c.hijos      || '';
  document.getElementById('ctcHobbies').value   = c.hobbies    || '';
  document.getElementById('ctcGustos').value    = c.gustos     || '';
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
    tipo:       document.getElementById('ctcTipo').value,
    telefono:   document.getElementById('ctcTelefono').value,
    email:      document.getElementById('ctcEmail').value,
    localidad:  document.getElementById('ctcLocalidad').value,
    notas:      document.getElementById('ctcNotas').value,
    cumpleanos: cumple,
    profesion:  document.getElementById('ctcProfesion').value,
    hijos:      document.getElementById('ctcHijos').value,
    hobbies:    document.getElementById('ctcHobbies').value,
    gustos:     document.getElementById('ctcGustos').value,
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
            <span style="font-weight:700;font-size:0.95rem;">${escHtml(p.direccion || '—')}</span>
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
                    <!-- Nombre + estado -->
                    <div style="flex:1;min-width:0;">
                      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                        <span style="font-weight:600;font-size:0.85rem;">${escHtml(c.nombre || 'Sin nombre')}</span>
                        <span style="font-size:0.68rem;padding:1px 7px;border-radius:10px;font-weight:600;background:${estadio.bg};color:${estadio.color};">${estadio.label}</span>
                        ${c.fecha_visita ? `<span style="font-size:0.68rem;background:#EDE9FE;color:#7C3AED;border-radius:8px;padding:1px 6px;">📅 ${formatFecha(c.fecha_visita)}</span>` : ''}
                      </div>
                      <div style="font-size:0.75rem;color:#888;margin-top:2px;display:flex;gap:10px;flex-wrap:wrap;">
                        ${c.telefono   ? `<span>📞 ${escHtml(c.telefono)}</span>` : ''}
                        ${c.presupuesto? `<span>💰 ${escHtml(c.presupuesto)}</span>` : ''}
                        ${c.operacion  ? `<span>🔑 ${escHtml(c.operacion)}</span>` : ''}
                        <span style="color:#ccc;">${formatFecha(c.created_at)}</span>
                      </div>
                      ${c.mensaje ? `<div style="font-size:0.73rem;color:#aaa;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:420px;">${escHtml(c.mensaje)}</div>` : ''}
                    </div>
                    <!-- Acciones rápidas -->
                    <div style="display:flex;gap:4px;flex-shrink:0;">
                      ${c.telefono ? `<button class="btn-icon-sm" onclick="abrirWALead('${escHtml(c.telefono)}','${escHtml(c.nombre||'')}','${escHtml(p.direccion||'')}')">💬</button>` : ''}
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
