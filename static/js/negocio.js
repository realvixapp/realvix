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
  document.getElementById('tabListing').style.display  = tab === 'listing'   ? '' : 'none';
  document.getElementById('tabEstado').style.display   = tab === 'estado'    ? '' : 'none';
  document.getElementById('tabContactos').style.display = tab === 'contactos' ? '' : 'none';
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

  container.innerHTML = `
    <table class="table">
      <thead><tr>
        <th>Dirección</th>
        <th>Propietario</th>
        <th>Teléfono</th>
        <th>Tipología</th>
        <th>Estado tasación</th>
        <th style="text-align:right">Acciones</th>
      </tr></thead>
      <tbody>
        ${lista.map(p => {
          const est = ESTADIO_MAP[p.estado_tasacion] || { label: p.estado_tasacion || '—', color: '#888', bg: '#f3f4f6' };
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
              <span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:0.72rem;font-weight:600;background:${est.bg};color:${est.color};">
                ${est.label}
              </span>
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

    // 📅 Ofrecer agendar si es un estadio de acción
    if (['en_tasacion','captado'].includes(nuevoEstadio)) {
      const label = ESTADIO_MAP[nuevoEstadio]?.label || nuevoEstadio;
      setTimeout(() => {
        pedirAgendarEnCalendar({
          titulo: `${label} — ${p.direccion || 'Propiedad'}`,
          descripcion: `📋 ${label} · ${p.direccion || ''}${p.localidad ? ', ' + p.localidad : ''}${p.nombre_propietario ? ' · ' + p.nombre_propietario : ''}${p.telefono ? ' · ' + p.telefono : ''}`,
          hora: '10:00',
          tipo: 'visita'
        });
      }, 300);
    }
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
  };

  try {
    if (id) await apiPut(`/api/propiedades/${id}`, body);
    else    await apiPost('/api/propiedades', body);
    cerrarModal('modalPropiedad');
    showToast(id ? 'Propiedad actualizada' : 'Propiedad creada');
    await cargarPropiedades();

    // 📅 Si hay fecha de prelisting o próximo contacto, ofrecer agendar en Calendar
    const fechaAgendar = body.fecha_prelisting || body.proximo_contacto;
    const estadio      = body.estadio || body.estado_tasacion || '';
    const esListing    = ['en_tasacion','captado','publicado'].includes(estadio);

    if (fechaAgendar || esListing) {
      setTimeout(() => {
        const tipoEvento = body.fecha_prelisting ? 'Prelisting' : esListing ? 'Visita / Tasación' : 'Seguimiento';
        pedirAgendarEnCalendar({
          titulo: `${tipoEvento} — ${dir}`,
          descripcion: `📋 ${tipoEvento} · ${dir}${body.localidad ? ', ' + body.localidad : ''}${body.nombre_propietario ? ' · Propietario: ' + body.nombre_propietario : ''}${body.telefono ? ' · ' + body.telefono : ''}`,
          fecha: fechaAgendar || '',
          hora: '10:00',
          tipo: 'visita'
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

function renderContactos() {
  const q    = (document.getElementById('filtroContactos')?.value || '').toLowerCase();
  const tipo = document.getElementById('filtroTipoContacto')?.value || '';
  const lista = NEG.contactos.filter(c =>
    (!q || (c.nombre||'').toLowerCase().includes(q) || (c.telefono||'').includes(q) || (c.email||'').toLowerCase().includes(q)) &&
    (!tipo || c.tipo === tipo)
  );
  const container = document.getElementById('contactosGrid');
  if (!container) return;
  if (lista.length === 0) {
    container.innerHTML = `<div class="empty-state">No hay contactos cargados</div>`; return;
  }
  const TIPO_COLORS = {
    propietario: { bg:'#EEF2FF', color:'#1B3FE4' },
    cliente:     { bg:'#ECFDF5', color:'#059669' },
    broker:      { bg:'#FFF7ED', color:'#F97316' },
    proveedor:   { bg:'#F3F4F6', color:'#6B7280' },
    otro:        { bg:'#F3F4F6', color:'#6B7280' },
  };
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;">
      ${lista.map(c => {
        const tc = TIPO_COLORS[c.tipo] || TIPO_COLORS.otro;
        return `
          <div class="card" style="padding:14px;">
            <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;">
              <div>
                <div style="font-weight:600;font-size:0.9rem;">${escHtml(c.nombre)}</div>
                <span style="font-size:0.7rem;padding:2px 8px;border-radius:10px;font-weight:600;background:${tc.bg};color:${tc.color};">${c.tipo||'otro'}</span>
              </div>
              <div style="display:flex;gap:4px;">
                ${c.telefono ? `<button class="btn-icon-sm" onclick="window.open('${buildWhatsAppUrl(c.telefono,'')}','_blank')">💬</button>` : ''}
                <button class="btn-icon-sm" onclick="editarContacto('${c.id}')">✏️</button>
                <button class="btn-icon-sm danger" onclick="eliminarContacto('${c.id}')">🗑️</button>
              </div>
            </div>
            ${c.telefono ? `<div style="font-size:0.81rem;color:#555;margin-top:6px;">📞 ${escHtml(c.telefono)}</div>` : ''}
            ${c.email    ? `<div style="font-size:0.81rem;color:#555;">✉️ ${escHtml(c.email)}</div>` : ''}
            ${c.notas    ? `<div style="font-size:0.76rem;color:#888;margin-top:6px;padding-top:6px;border-top:1px solid var(--border);">${escHtml(c.notas)}</div>` : ''}
          </div>`;
      }).join('')}
    </div>`;
}

function abrirNuevoContacto() {
  ['ctcId','ctcNombre','ctcTelefono','ctcEmail','ctcLocalidad','ctcNotas'].forEach(id => {
    const e = document.getElementById(id); if (e) e.value = '';
  });
  document.getElementById('ctcTipo').value = 'propietario';
  document.getElementById('modalCtcTitulo').textContent = 'Nuevo contacto';
  abrirModal('modalContacto');
}

function editarContacto(id) {
  const c = NEG.contactos.find(x => x.id === id);
  if (!c) return;
  document.getElementById('ctcId').value       = c.id;
  document.getElementById('ctcNombre').value   = c.nombre || '';
  document.getElementById('ctcTipo').value     = c.tipo || 'otro';
  document.getElementById('ctcTelefono').value = c.telefono || '';
  document.getElementById('ctcEmail').value    = c.email || '';
  document.getElementById('ctcLocalidad').value= c.localidad || '';
  document.getElementById('ctcNotas').value    = c.notas || '';
  document.getElementById('modalCtcTitulo').textContent = 'Editar contacto';
  abrirModal('modalContacto');
}

async function guardarContacto() {
  const id     = document.getElementById('ctcId').value;
  const nombre = document.getElementById('ctcNombre').value.trim();
  if (!nombre) { showToast('El nombre es requerido', 'error'); return; }
  const body = {
    nombre,
    tipo:      document.getElementById('ctcTipo').value,
    telefono:  document.getElementById('ctcTelefono').value,
    email:     document.getElementById('ctcEmail').value,
    localidad: document.getElementById('ctcLocalidad').value,
    notas:     document.getElementById('ctcNotas').value,
  };
  try {
    if (id) await apiPut(`/api/contactos/${id}`, body);
    else    await apiPost('/api/contactos', body);
    cerrarModal('modalContacto');
    showToast('Contacto guardado');
    await cargarContactos();
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
