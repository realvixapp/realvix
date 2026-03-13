/**
 * negocio.js — Listing, Contactos, Estados
 */
const NEG = { propiedades: [], contactos: [], estados: [], vistaActual: 'listing', estadioFiltro: null };

async function initNegocio() {
  await Promise.all([cargarPropiedades(), cargarContactos(), cargarEstados()]);
}

// ── TABS ──
function switchTab(tab, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('tabListing').style.display = tab === 'listing' ? '' : 'none';
  document.getElementById('tabContactos').style.display = tab === 'contactos' ? '' : 'none';
}

function cambiarVista(v, btn) {
  NEG.vistaActual = v;
  document.querySelectorAll('.tab-sm').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderListing();
}

// ── PROPIEDADES ──
async function cargarPropiedades() {
  try {
    const data = await apiGet('/api/propiedades');
    NEG.propiedades = data.propiedades || [];
    renderListing();
  } catch (e) { showToast('Error al cargar propiedades', 'error'); }
}

async function cargarEstados() {
  try {
    const data = await apiGet('/api/estados');
    NEG.estados = data.estados || [];
    // Llenar selects de estado
    const sel = document.getElementById('filtroEstado');
    const selProp = document.getElementById('propEstado');
    NEG.estados.forEach(e => {
      if (sel) sel.innerHTML += `<option value="${escHtml(e.nombre)}">${escHtml(e.nombre)}</option>`;
      if (selProp) selProp.innerHTML += `<option value="${escHtml(e.nombre)}">${escHtml(e.nombre)}</option>`;
    });
  } catch (e) { console.error(e); }
}

function filtrarListing() {
  renderListing();
}

function renderListing() {
  const q = (document.getElementById('filtroListing')?.value || '').toLowerCase();
  const est = document.getElementById('filtroEstado')?.value || '';

  // Filtrar por vista actual
  let vistaEstados = NEG.estados.filter(e => e.vista === NEG.vistaActual).map(e => e.nombre);
  if (NEG.estados.length === 0) vistaEstados = null; // sin estados cargados, mostrar todo

  let lista = NEG.propiedades.filter(p => {
    const matchQ = !q || (p.direccion || '').toLowerCase().includes(q) ||
      (p.nombre_propietario || '').toLowerCase().includes(q) ||
      (p.localidad || '').toLowerCase().includes(q);
    const matchEst = !est || p.estado_tasacion === est;
    const matchVista = !vistaEstados || vistaEstados.includes(p.estado_tasacion);
    return matchQ && matchEst && matchVista;
  });

  const container = document.getElementById('listingTable');
  if (!container) return;

  if (lista.length === 0) {
    container.innerHTML = `<div class="empty-state">No hay propiedades en esta vista</div>`;
    return;
  }

  container.innerHTML = `
    <table class="table">
      <thead><tr>
        <th>Dirección</th><th>Propietario</th><th>Tipo</th><th>Estado</th>
        <th>Próx. contacto</th><th style="text-align:right">Acciones</th>
      </tr></thead>
      <tbody>
        ${lista.map(p => `
          <tr>
            <td><strong>${escHtml(p.direccion || '—')}</strong><br><small style="color:#888;">${escHtml(p.localidad || '')}</small></td>
            <td>${escHtml(p.nombre_propietario || '—')}</td>
            <td>${escHtml(p.tipologia || '—')}</td>
            <td><span class="badge badge-gray">${escHtml(p.estado_tasacion || '—')}</span></td>
            <td>${formatFecha(p.proximo_contacto)}</td>
            <td style="text-align:right;white-space:nowrap;">
              ${p.telefono ? `<button class="btn-icon-sm" title="WhatsApp" onclick="abrirWA('${escHtml(p.telefono)}','${escHtml(p.nombre_propietario||'')}')">💬</button>` : ''}
              <button class="btn-icon-sm" title="Editar" onclick="editarPropiedad('${p.id}')">✏️</button>
              <button class="btn-icon-sm danger" title="Eliminar" onclick="eliminarPropiedad('${p.id}')">🗑️</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
}

function abrirNuevaPropiedad() {
  document.getElementById('propId').value = '';
  document.getElementById('propDireccion').value = '';
  document.getElementById('propLocalidad').value = '';
  document.getElementById('propZona').value = '';
  document.getElementById('propTipologia').value = '';
  document.getElementById('propEstado').value = '';
  document.getElementById('propNombre').value = '';
  document.getElementById('propTelefono').value = '';
  document.getElementById('propEmail').value = '';
  document.getElementById('propReferido').value = '';
  document.getElementById('propUrl').value = '';
  document.getElementById('propUltimo').value = '';
  document.getElementById('propProximo').value = '';
  document.getElementById('propObservaciones').value = '';
  document.getElementById('modalPropTitulo').textContent = 'Nueva propiedad';
  abrirModal('modalPropiedad');
}

function editarPropiedad(id) {
  const p = NEG.propiedades.find(x => x.id === id);
  if (!p) return;
  document.getElementById('propId').value = p.id;
  document.getElementById('propDireccion').value = p.direccion || '';
  document.getElementById('propLocalidad').value = p.localidad || '';
  document.getElementById('propZona').value = p.zona || '';
  document.getElementById('propTipologia').value = p.tipologia || '';
  document.getElementById('propEstado').value = p.estado_tasacion || '';
  document.getElementById('propNombre').value = p.nombre_propietario || '';
  document.getElementById('propTelefono').value = p.telefono || '';
  document.getElementById('propEmail').value = p.email || '';
  document.getElementById('propReferido').value = p.referido || '';
  document.getElementById('propUrl').value = p.url || '';
  document.getElementById('propUltimo').value = p.ultimo_contacto || '';
  document.getElementById('propProximo').value = p.proximo_contacto || '';
  document.getElementById('propObservaciones').value = p.observaciones || '';
  document.getElementById('modalPropTitulo').textContent = 'Editar propiedad';
  abrirModal('modalPropiedad');
}

async function guardarPropiedad() {
  const id = document.getElementById('propId').value;
  const body = {
    id: id || undefined,
    direccion: document.getElementById('propDireccion').value,
    localidad: document.getElementById('propLocalidad').value,
    zona: document.getElementById('propZona').value,
    tipologia: document.getElementById('propTipologia').value,
    estado_tasacion: document.getElementById('propEstado').value,
    nombre_propietario: document.getElementById('propNombre').value,
    telefono: document.getElementById('propTelefono').value,
    email: document.getElementById('propEmail').value,
    referido: document.getElementById('propReferido').value,
    url: document.getElementById('propUrl').value,
    ultimo_contacto: document.getElementById('propUltimo').value,
    proximo_contacto: document.getElementById('propProximo').value,
    observaciones: document.getElementById('propObservaciones').value,
  };
  try {
    if (id) {
      await apiPut(`/api/propiedades/${id}`, body);
    } else {
      await apiPost('/api/propiedades', body);
    }
    cerrarModal('modalPropiedad');
    showToast('Propiedad guardada');
    await cargarPropiedades();
  } catch (e) { showToast(e.message, 'error'); }
}

async function eliminarPropiedad(id) {
  if (!confirmar('¿Eliminar esta propiedad?')) return;
  try {
    await apiDelete(`/api/propiedades/${id}`);
    showToast('Propiedad eliminada');
    await cargarPropiedades();
  } catch (e) { showToast(e.message, 'error'); }
}

function abrirWA(tel, nombre) {
  const url = buildWhatsAppUrl(tel, `Hola ${nombre || ''}!`);
  window.open(url, '_blank');
}

// ── CONTACTOS ──
async function cargarContactos() {
  try {
    const data = await apiGet('/api/contactos');
    NEG.contactos = data.contactos || [];
    renderContactos();
  } catch (e) { showToast('Error al cargar contactos', 'error'); }
}

function filtrarContactos() {
  renderContactos();
}

function renderContactos() {
  const q = (document.getElementById('filtroContactos')?.value || '').toLowerCase();
  const lista = NEG.contactos.filter(c =>
    !q || (c.nombre || '').toLowerCase().includes(q) ||
    (c.telefono || '').includes(q) ||
    (c.email || '').toLowerCase().includes(q)
  );
  const container = document.getElementById('contactosGrid');
  if (!container) return;
  if (lista.length === 0) {
    container.innerHTML = `<div class="empty-state">No hay contactos cargados</div>`;
    return;
  }
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;">
      ${lista.map(c => `
        <div class="card" style="padding:14px;">
          <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;">
            <div>
              <div style="font-weight:600;font-size:0.9rem;">${escHtml(c.nombre)}</div>
              <div style="font-size:0.72rem;color:#888;text-transform:uppercase;letter-spacing:.5px;">${escHtml(c.tipo || 'otro')}</div>
            </div>
            <div style="display:flex;gap:4px;">
              ${c.telefono ? `<button class="btn-icon-sm" onclick="window.open('${buildWhatsAppUrl(c.telefono,'')}','_blank')">💬</button>` : ''}
              <button class="btn-icon-sm" onclick="editarContacto('${c.id}')">✏️</button>
              <button class="btn-icon-sm danger" onclick="eliminarContacto('${c.id}')">🗑️</button>
            </div>
          </div>
          ${c.telefono ? `<div style="font-size:0.82rem;color:#555;">📞 ${escHtml(c.telefono)}</div>` : ''}
          ${c.email ? `<div style="font-size:0.82rem;color:#555;">✉️ ${escHtml(c.email)}</div>` : ''}
          ${c.notas ? `<div style="font-size:0.78rem;color:#888;margin-top:6px;border-top:1px solid var(--border);padding-top:6px;">${escHtml(c.notas)}</div>` : ''}
        </div>
      `).join('')}
    </div>`;
}

function abrirNuevoContacto() {
  ['ctcId','ctcNombre','ctcTelefono','ctcEmail','ctcLocalidad','ctcNotas'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('ctcTipo').value = 'cliente';
  document.getElementById('modalCtcTitulo').textContent = 'Nuevo contacto';
  abrirModal('modalContacto');
}

function editarContacto(id) {
  const c = NEG.contactos.find(x => x.id === id);
  if (!c) return;
  document.getElementById('ctcId').value = c.id;
  document.getElementById('ctcNombre').value = c.nombre || '';
  document.getElementById('ctcTipo').value = c.tipo || 'otro';
  document.getElementById('ctcTelefono').value = c.telefono || '';
  document.getElementById('ctcEmail').value = c.email || '';
  document.getElementById('ctcLocalidad').value = c.localidad || '';
  document.getElementById('ctcNotas').value = c.notas || '';
  document.getElementById('modalCtcTitulo').textContent = 'Editar contacto';
  abrirModal('modalContacto');
}

async function guardarContacto() {
  const id = document.getElementById('ctcId').value;
  const nombre = document.getElementById('ctcNombre').value.trim();
  if (!nombre) { showToast('El nombre es requerido', 'error'); return; }
  const body = {
    nombre,
    tipo: document.getElementById('ctcTipo').value,
    telefono: document.getElementById('ctcTelefono').value,
    email: document.getElementById('ctcEmail').value,
    localidad: document.getElementById('ctcLocalidad').value,
    notas: document.getElementById('ctcNotas').value,
  };
  try {
    if (id) await apiPut(`/api/contactos/${id}`, body);
    else await apiPost('/api/contactos', body);
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
