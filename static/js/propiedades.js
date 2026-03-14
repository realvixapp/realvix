/**
 * propiedades.js — Estado de Propiedades + Actividad con filtro por nombre
 */
const PROPS = {
  propiedades: [],
  consultas:   [],
  estadioFiltro: 'todos',
  propFiltroActividad: '',
  respFiltro: '', // filtro por respuesta propietario
};

async function initPropiedades() {
  await cargarActividadProp();
}

function switchPropTab(tab, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('tabEstadoProp').style.display    = tab === 'estado'    ? '' : 'none';
  document.getElementById('tabActividadProp').style.display = tab === 'actividad' ? '' : 'none';
  if (tab === 'actividad') renderActividadProp();
  if (tab === 'estado')    renderEstadoProp();
}

// ══ CARGAR DATOS ══
async function cargarActividadProp() {
  try {
    const [dataProp, dataLeads] = await Promise.all([
      apiGet('/api/propiedades'),
      apiGet('/api/consultas'),
    ]);
    PROPS.propiedades = dataProp.propiedades || [];
    PROPS.consultas   = dataLeads.consultas  || [];
    renderEstadoProp();
    renderActividadProp();
  } catch(e) { showToast('Error al cargar propiedades', 'error'); }
}

// ══ ESTADO DE PROPIEDADES ══
const ESTADIO_MAP_P = {
  captado:   { label:'Captado',    color:'#2563EB', bg:'#EFF6FF' },
  publicado: { label:'Publicado',  color:'#059669', bg:'#ECFDF5' },
  reservado: { label:'Reservado',  color:'#DC2626', bg:'#FEF2F2' },
  cerrado:   { label:'Cerrado ✓',  color:'#374151', bg:'#F3F4F6' },
  nuevo:        { label:'Nuevo',        color:'#6B7280', bg:'#F3F4F6' },
  en_tasacion:  { label:'En tasación',  color:'#7C3AED', bg:'#F5F3FF' },
};

function filtrarEstadioProps(est, btn) {
  PROPS.estadioFiltro = est;
  document.querySelectorAll('.estadio-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderEstadoProp();
}

function renderEstadoProp() {
  const q   = (document.getElementById('filtroEstadoProp')?.value || '').toLowerCase();
  const est = PROPS.estadioFiltro;

  // Stats
  const s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  s('stCaptadas',   PROPS.propiedades.filter(p => (p.estado_tasacion||'').toLowerCase() === 'captado').length);
  s('stPublicadas', PROPS.propiedades.filter(p => (p.estado_tasacion||'').toLowerCase() === 'publicado').length);
  s('stReservadas', PROPS.propiedades.filter(p => (p.estado_tasacion||'').toLowerCase() === 'reservado').length);
  s('stCerradas',   PROPS.propiedades.filter(p => (p.estado_tasacion||'').toLowerCase() === 'cerrado').length);

  // Filtrar captado/publicado/reservado/cerrado + filtro usuario
  let lista = PROPS.propiedades.filter(p => {
    const pEst = (p.estado_tasacion || p.estadio || '').toLowerCase();
    const enEstados = ['captado','publicado','reservado','cerrado'].includes(pEst);
    const matchEst  = est === 'todos' || pEst === est;
    const matchQ    = !q || (p.direccion||'').toLowerCase().includes(q) || (p.nombre_propietario||'').toLowerCase().includes(q);
    return enEstados && matchEst && matchQ;
  });

  const container = document.getElementById('estadoPropsTable');
  if (!container) return;
  if (lista.length === 0) {
    container.innerHTML = `<div class="empty-state">No hay propiedades en estos estadios</div>`; return;
  }

  const hoy = new Date().toISOString().split('T')[0];
  container.innerHTML = `
    <table class="table">
      <thead><tr>
        <th>Dirección</th>
        <th>Estadio</th>
        <th>Propietario</th>
        <th>Observaciones</th>
        <th style="text-align:right">Acciones</th>
      </tr></thead>
      <tbody>
        ${lista.map(p => {
          const pEst = (p.estado_tasacion || p.estadio || '').toLowerCase();
          const estInfo = ESTADIO_MAP_P[pEst] || { label: p.estado_tasacion || '—', color:'#888', bg:'#f3f4f6' };
          return `<tr>
            <td>
              <div style="font-weight:600;cursor:pointer;color:var(--rx-blue);"
                data-pid="${p.id}" onclick="abrirEditarPropModal(this.dataset.pid)">${escHtml(p.direccion||'—')}</div>
              ${p.localidad ? `<div style="font-size:0.74rem;color:#888;">${escHtml(p.localidad)}</div>` : ''}
              ${p.url ? `<a href="${escHtml(p.url)}" target="_blank" style="font-size:0.72rem;color:var(--rx-blue);">🔗 Ver ficha</a>` : ''}
            </td>
            <td>
              <select class="estadio-inline-select" data-pid="${p.id}"
                onchange="cambiarEstadioProp(this.dataset.pid, this.value)"
                style="font-size:0.75rem;padding:3px 8px;border-radius:12px;border:1px solid ${estInfo.color}44;background:${estInfo.bg};color:${estInfo.color};font-weight:700;cursor:pointer;outline:none;">
                <option value="captado"   ${'captado'===pEst?'selected':''}>🔷 Captado</option>
                <option value="publicado" ${'publicado'===pEst?'selected':''}>🟢 Publicado</option>
                <option value="reservado" ${'reservado'===pEst?'selected':''}>🔴 Reservado</option>
                <option value="cerrado"   ${'cerrado'===pEst?'selected':''}>⬛ Cerrado</option>
              </select>
            </td>
            <td>
              <div style="font-size:0.84rem;">${escHtml(p.nombre_propietario||'—')}</div>
              ${p.telefono ? `<div style="font-size:0.74rem;color:#888;">📞 ${escHtml(p.telefono)}</div>` : ''}
            </td>

            <td style="max-width:180px;">
              ${p.observaciones
                ? `<div style="font-size:0.77rem;color:#666;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:170px;" title="${escHtml(p.observaciones)}">${escHtml(p.observaciones)}</div>`
                : '<span style="color:#ccc;">—</span>'}
            </td>
            <td style="text-align:right;white-space:nowrap;">
              ${p.telefono ? `<button class="btn-icon-sm" data-tel="${escHtml(p.telefono)}" data-nom="${escHtml(p.nombre_propietario||'')}" onclick="window.open(buildWhatsAppUrl(this.dataset.tel,'Hola '+this.dataset.nom),'_blank')">💬</button>` : ''}
              <button class="btn-icon-sm" data-pid="${p.id}" onclick="verMasProp(this.dataset.pid)" title="Ver toda la información">👁️</button>
              <button class="btn-icon-sm" data-pid="${p.id}" onclick="abrirEditarPropModal(this.dataset.pid)" title="Editar">✏️</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}


async function cambiarEstadioProp(pid, nuevoEstadio) {
  const p = PROPS.propiedades.find(x => x.id === pid);
  if (!p) return;
  try {
    await apiPut(`/api/propiedades/${pid}`, { ...p, estado_tasacion: nuevoEstadio, estadio: nuevoEstadio });
    p.estado_tasacion = nuevoEstadio;
    p.estadio = nuevoEstadio;
    renderEstadoProp();
    showToast('Estado actualizado ✓');
  } catch(e) { showToast(e.message, 'error'); }
}

function abrirEditarPropModal(pid) {
  // Store pid and open a simple edit modal
  PROPS.editandoId = pid;
  const p = PROPS.propiedades.find(x => x.id === pid);
  if (!p) return;
  document.getElementById('editPropId').value = pid;
  document.getElementById('editPropDireccion').value = p.direccion || '';
  document.getElementById('editPropLocalidad').value = p.localidad || '';
  document.getElementById('editPropTipologia').value = p.tipologia || '';
  document.getElementById('editPropNombre').value = p.nombre_propietario || '';
  document.getElementById('editPropTelefono').value = p.telefono || '';
  document.getElementById('editPropUrl').value = p.url || '';
  document.getElementById('editPropObs').value = p.observaciones || '';
  const est = (p.estado_tasacion || p.estadio || '').toLowerCase();
  const selE = document.getElementById('editPropEstadio');
  if (selE) {
    const val = p.estado_tasacion || p.estadio || 'captado';
    if (!Array.from(selE.options).find(o => o.value === val)) {
      const opt = document.createElement('option');
      opt.value = val; opt.text = val; selE.appendChild(opt);
    }
    selE.value = val;
  }
  abrirModal('modalEditarProp');
}

async function guardarEditarProp() {
  const pid = document.getElementById('editPropId').value;
  const p   = PROPS.propiedades.find(x => x.id === pid);
  if (!p) return;
  const nuevoEstadio = document.getElementById('editPropEstadio').value;
  const body = { ...p,
    direccion:          document.getElementById('editPropDireccion').value,
    localidad:          document.getElementById('editPropLocalidad').value,
    tipologia:          document.getElementById('editPropTipologia').value,
    nombre_propietario: document.getElementById('editPropNombre').value,
    telefono:           document.getElementById('editPropTelefono').value,
    url:                document.getElementById('editPropUrl').value,
    observaciones:      document.getElementById('editPropObs').value,
    estado_tasacion:    nuevoEstadio,
    estadio:            nuevoEstadio,
  };
  try {
    await apiPut(`/api/propiedades/${pid}`, body);
    Object.assign(p, body);
    cerrarModal('modalEditarProp');
    showToast('Propiedad actualizada ✓');
    renderEstadoProp();
  } catch(e) { showToast(e.message, 'error'); }
}

// ══ ACTIVIDAD CON ÍNDICE POR PROPIEDAD ══
function renderActividadProp() {
  const filtroEst  = (document.getElementById('filtroActividadEstadoProp')?.value || '').toLowerCase();

  let props = PROPS.propiedades.filter(p => {
    const est = (p.estado_tasacion || p.estadio || '').toLowerCase().trim();
    return ['publicado','reservado','publicada','reservada'].includes(est);
  });
  if (filtroEst) props = props.filter(p => (p.estado_tasacion||'').toLowerCase().includes(filtroEst));

  // Contar consultas por propiedad
  const conPorProp = (p) => PROPS.consultas.filter(c =>
    c.propiedad_nombre && p.direccion &&
    c.propiedad_nombre.trim().toLowerCase() === p.direccion.trim().toLowerCase()
  );

  // Stats globales
  const todosLeads   = props.flatMap(p => conPorProp(p));
  const totalVisitas = todosLeads.filter(c => ['visito','visitó'].includes((c.estado||'').toLowerCase())).length;
  const pendVisita   = todosLeads.filter(c => c.estado === 'pendiente_visita').length;
  const s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  s('actPTotalProps',  props.length);
  s('actPTotalLeads',  todosLeads.length);
  s('actPTotalVisitas',totalVisitas);
  s('actPPendVisita',  pendVisita);

  // ── TOP 5 MÁS CONSULTADAS ──
  const propsConConteo = props.map(p => ({ ...p, consultas: conPorProp(p) }))
    .sort((a, b) => b.consultas.length - a.consultas.length);

  const top5El = document.getElementById('top5Section');
  const top5Grid = document.getElementById('top5Grid');
  if (top5El && top5Grid && propsConConteo.length > 0) {
    top5El.style.display = '';
    const top5 = propsConConteo.slice(0, Math.min(5, propsConConteo.length));
    const medals = ['🥇','🥈','🥉','4️⃣','5️⃣'];
    top5Grid.innerHTML = top5.map((p, i) => {
      const visitaron = p.consultas.filter(c => ['visito','visitó'].includes((c.estado||'').toLowerCase())).length;
      const isActive  = PROPS.propFiltroActividad === p.direccion;
      return `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 14px;border-radius:8px;cursor:pointer;
          background:${isActive ? 'var(--rx-blue-light)' : 'white'};
          border:1.5px solid ${isActive ? 'var(--rx-blue)' : 'var(--border)'};
          transition:all 0.1s;"
          onclick="filtrarPropActividad('${escHtml(p.direccion)}')">
          <span style="font-size:1rem;flex-shrink:0;">${medals[i]}</span>
          <span style="font-weight:600;font-size:0.83rem;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${isActive ? 'var(--rx-blue)' : 'inherit'};">${escHtml(p.direccion)}</span>
          <span style="font-size:0.72rem;background:var(--rx-blue-light);color:var(--rx-blue);padding:1px 7px;border-radius:8px;font-weight:600;flex-shrink:0;">${p.consultas.length}</span>
          <span style="font-size:0.72rem;background:var(--success-bg);color:var(--success);padding:1px 7px;border-radius:8px;font-weight:600;flex-shrink:0;">${visitaron}🏠</span>
        </div>`;
    }).join('');
  }

  // Resp index hidden per user request
  const respIndexEl = document.getElementById('propRespIndex');
  if (respIndexEl) respIndexEl.innerHTML = '';

  // Apply respuesta filter
  let propsParaMostrar = PROPS.respFiltro
    ? propsConConteo.filter(p => (p.respuesta_listing||'esperando_respuesta') === PROPS.respFiltro)
    : propsConConteo;

  // ── ÍNDICE POR NOMBRE DE PROPIEDAD ──
  const indexEl = document.getElementById('propNombreIndex');
  if (indexEl && props.length > 0) {
    indexEl.innerHTML = `
      <div style="background:var(--cream);border:1px solid var(--border);border-radius:8px;padding:10px 14px;">
        <div style="font-size:0.72rem;font-weight:600;color:#888;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px;">Filtrar por propiedad</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
          <button onclick="filtrarPropActividad('')"
            style="padding:4px 12px;border-radius:20px;border:1.5px solid ${!PROPS.propFiltroActividad ? 'var(--rx-blue)' : 'var(--border)'};
            background:${!PROPS.propFiltroActividad ? 'var(--rx-blue)' : 'white'};
            color:${!PROPS.propFiltroActividad ? 'white' : '#666'};font-size:0.75rem;font-weight:600;cursor:pointer;">
            Todas (${props.length})
          </button>
          ${propsConConteo.map(p => `
            <button onclick="filtrarPropActividad('${escHtml(p.direccion)}')"
              style="padding:4px 12px;border-radius:20px;border:1.5px solid ${PROPS.propFiltroActividad === p.direccion ? 'var(--rx-blue)' : 'var(--border)'};
              background:${PROPS.propFiltroActividad === p.direccion ? 'var(--rx-blue)' : 'white'};
              color:${PROPS.propFiltroActividad === p.direccion ? 'white' : '#444'};
              font-size:0.75rem;font-weight:600;cursor:pointer;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
              title="${escHtml(p.direccion)}">
              ${escHtml(p.direccion.length > 22 ? p.direccion.substring(0,22)+'…' : p.direccion)}
              <span style="opacity:0.75;">(${p.consultas.length})</span>
            </button>`).join('')}
        </div>
      </div>`;
  }

  // ── RENDER PANELES ──
  let propsMostrar = PROPS.propFiltroActividad
    ? propsParaMostrar.filter(p => p.direccion === PROPS.propFiltroActividad)
    : propsParaMostrar;

  const container = document.getElementById('actividadPropGrid');
  if (!container) return;

  if (propsMostrar.length === 0) {
    container.innerHTML = `<div class="empty-state">No hay propiedades publicadas o reservadas.<br><span style="font-size:0.8rem;color:#aaa;">Cambiá el estado de una propiedad a Publicado o Reservado en Negocio → Listing.</span></div>`;
    return;
  }

  const ESTADIO_LABELS = {
    'nuevo':            { label:'Nuevo',            color:'#6B7280', bg:'#F3F4F6' },
    'pendiente_visita': { label:'Pend. visita',      color:'#7C3AED', bg:'#F5F3FF' },
    'contesto':         { label:'Contestó',          color:'#D97706', bg:'#FFFBEB' },
    'seguimiento':      { label:'Seguimiento',       color:'#2563EB', bg:'#EFF6FF' },
    'visito':           { label:'Visitó ✓',          color:'#059669', bg:'#ECFDF5' },
  };

  container.innerHTML = propsMostrar.map(p => {
    const est = (p.estado_tasacion || p.estadio || '').toLowerCase();
    const esPublicado = est.includes('publ');
    const badgeColor = esPublicado ? '#059669' : '#DC2626';
    const badgeBg    = esPublicado ? '#ECFDF5' : '#FEF2F2';
    const badgeLabel = esPublicado ? '🟢 Publicado' : '🔴 Reservado';
    const consultas  = p.consultas;
    const nVisitas   = consultas.filter(c => ['visito','visitó'].includes((c.estado||'').toLowerCase())).length;
    const nPendVis   = consultas.filter(c => c.estado === 'pendiente_visita').length;
    const nSeguim    = consultas.filter(c => c.estado === 'seguimiento').length;

    return `
    <div class="card" style="padding:0;margin-bottom:16px;overflow:hidden;">
      <div style="padding:14px 18px;background:linear-gradient(135deg,#f8f9ff,#f0f4ff);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
            <span style="font-weight:700;font-size:0.95rem;color:var(--rx-blue);cursor:pointer;text-decoration:underline dotted;"
              data-pid="${p.id}" onclick="abrirModalInfoPropActividad(this.dataset.pid)">${escHtml(p.direccion||'—')}</span>
            <span style="font-size:0.7rem;padding:2px 9px;border-radius:12px;font-weight:700;background:${badgeBg};color:${badgeColor};">${badgeLabel}</span>
            ${p.tipologia ? `<span style="font-size:0.72rem;color:#888;background:#f3f4f6;padding:2px 7px;border-radius:8px;">${escHtml(p.tipologia)}</span>` : ''}
          </div>
          <div style="font-size:0.79rem;color:#888;display:flex;gap:12px;flex-wrap:wrap;">
            ${p.localidad ? `<span>📍 ${escHtml(p.localidad)}</span>` : ''}
            ${p.nombre_propietario ? `<span>👤 ${escHtml(p.nombre_propietario)}</span>` : ''}
            ${p.url ? `<a href="${escHtml(p.url)}" target="_blank" style="color:var(--rx-blue);text-decoration:none;">🔗 Ver ficha</a>` : ''}
          </div>
        </div>
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
      ${consultas.length === 0
        ? `<div style="padding:18px;text-align:center;color:#bbb;font-size:0.82rem;">Sin consultas asociadas todavía</div>`
        : `<div style="padding:10px 18px 14px;">
            <div style="font-size:0.72rem;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">Consultas (${consultas.length})</div>
            <div style="display:flex;flex-direction:column;gap:6px;">
              ${consultas.map(c => {
                const estadio = ESTADIO_LABELS[c.estado] || { label: c.estado, color:'#888', bg:'#f3f4f6' };
                return `
                  <div style="display:flex;align-items:flex-start;gap:10px;padding:8px 12px;border-radius:8px;background:${estadio.bg}22;border:1px solid ${estadio.color}22;flex-wrap:wrap;">
                    <div style="flex:1;min-width:0;">
                      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                        <span style="font-weight:600;font-size:0.85rem;color:var(--rx-blue);cursor:pointer;text-decoration:underline dotted;"
                          data-cid="${c.id}" onclick="abrirFichaLeadDesdeProp(this.dataset.cid)">${escHtml(c.nombre||'Sin nombre')}</span>
                        <span style="font-size:0.68rem;padding:1px 7px;border-radius:10px;font-weight:600;background:${estadio.bg};color:${estadio.color};">${estadio.label}</span>
                        ${c.fecha_visita ? `<span style="font-size:0.68rem;background:#EDE9FE;color:#7C3AED;border-radius:8px;padding:1px 6px;">📅 ${formatFecha(c.fecha_visita)}</span>` : ''}
                      </div>
                      <div style="font-size:0.75rem;color:#888;margin-top:2px;display:flex;gap:10px;flex-wrap:wrap;">
                        ${c.telefono  ? `<span>📞 ${escHtml(c.telefono)}</span>` : ''}
                        ${c.operacion ? `<span>🔑 ${escHtml(c.operacion)}</span>` : ''}
                        <span style="color:#ccc;">${formatFecha(c.created_at)}</span>
                      </div>
                      ${(c.notas||c.mensaje) ? `<div style="font-size:0.76rem;color:#555;margin-top:5px;background:#f8f9fa;padding:6px 9px;border-radius:6px;border-left:3px solid #d1d5db;white-space:pre-line;">${escHtml(c.notas||c.mensaje)}</div>` : ''}
                    </div>
                    <div style="display:flex;gap:4px;flex-shrink:0;align-items:center;">
                      ${c.telefono ? `<button
                        data-cid="${c.id}"
                        onclick="abrirWADesdeActividad(this.dataset.cid)"
                        style="width:30px;height:30px;border-radius:50%;border:none;background:#25D366;color:white;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;" title="WhatsApp">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="14" height="14"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.556 4.121 1.526 5.851L.057 23.868c-.11.415.271.802.687.702l6.225-1.634A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.027-1.384l-.36-.214-3.714.975.992-3.621-.235-.372A9.818 9.818 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/></svg>
                        </button>` : ''}
                      <select class="input-base" style="font-size:0.72rem;padding:3px 6px;height:auto;width:130px;"
                        data-cid="${c.id}"
                        onchange="cambiarEstadioActProp(this.dataset.cid, this.value, this)">
                        ${Object.entries(ESTADIO_LABELS).map(([k,v]) =>
                          `<option value="${k}" ${c.estado===k?'selected':''}>${v.label}</option>`
                        ).join('')}
                      </select>
                    </div>
                  </div>`;
              }).join('')}
            </div>
          </div>`}
    </div>`;
  }).join('');
}

function filtrarPropActividad(nombre) {
  PROPS.propFiltroActividad = nombre;
  renderActividadProp();
}

function filtrarRespActividad(resp) {
  PROPS.respFiltro = resp;
  PROPS.propFiltroActividad = ''; // reset prop filter
  renderActividadProp();
}

async function cambiarEstadioActProp(id, nuevoEstado, selEl) {
  const c = PROPS.consultas.find(x => x.id === id);
  if (!c) return;
  const anterior = c.estado;
  try {
    await apiPut(`/api/consultas/${id}`, { ...c, estado: nuevoEstado });
    c.estado = nuevoEstado;
    renderActividadProp();
    showToast('Estado actualizado ✓');
    if (nuevoEstado === 'pendiente_visita') {
      setTimeout(() => pedirAgendarEnCalendar({
        titulo:      `Visita — ${c.nombre||'Lead'}`,
        descripcion: `🏠 Visita con ${c.nombre||'lead'}${c.propiedad_nombre ? ' · '+c.propiedad_nombre : ''}${c.telefono ? ' · 📞 '+c.telefono : ''}`,
        fecha: c.fecha_visita || '', hora: '10:00',
      }), 300);
    }
  } catch(e) {
    if (selEl) selEl.value = anterior;
    showToast(e.message, 'error');
  }
}

// ══ WHATSAPP MODAL DESDE ACTIVIDAD PROPIEDADES ══
let _propActTextosWA = [];

async function abrirWADesdeActividad(consultaId) {
  const c = PROPS.consultas.find(x => x.id === consultaId);
  if (!c || !c.telefono) return;

  if (_propActTextosWA.length === 0) {
    try {
      const data = await apiGet('/api/textos');
      _propActTextosWA = (data.textos || []).filter(t => t.tipo === 'whatsapp');
    } catch(e) { console.error(e); }
  }

  // Buscar propiedad para {propiedad} y {ficha_propiedad}
  const propObj = PROPS.propiedades.find(p => p.direccion === c.propiedad_nombre);
  const propPartes = [c.propiedad_nombre||''];
  if (propObj?.localidad) propPartes.push(propObj.localidad);
  if (propObj?.zona)      propPartes.push(propObj.zona);
  const propTexto    = propPartes.filter(Boolean).join(', ');
  const fichaUrl     = propObj?.url || '';
  const propietario  = propObj?.nombre_propietario || '';

  const atributos = [
    { key: '{nombre}',             label: 'Nombre lead',              valor: c.nombre || '' },
    { key: '{propiedad}',          label: 'Nombre + localidad + zona', valor: propTexto },
    { key: '{ficha_propiedad}',    label: 'Link ficha propiedad',     valor: fichaUrl },
    { key: '{nombre_propietario}', label: 'Nombre propietario',       valor: propietario },
  ];

  let ov = document.getElementById('_waPropActOv');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = '_waPropActOv';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9500;display:flex;align-items:center;justify-content:center;padding:16px;';
    document.body.appendChild(ov);
  }

  const todos = _propActTextosWA;

  ov.innerHTML = `
    <div style="background:white;border-radius:14px;max-width:660px;width:100%;max-height:90vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 12px 40px rgba(0,0,0,0.25);">
      <div style="padding:14px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;">
        <div style="width:36px;height:36px;border-radius:50%;background:#25D366;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="20" height="20"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.556 4.121 1.526 5.851L.057 23.868c-.11.415.271.802.687.702l6.225-1.634A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.027-1.384l-.36-.214-3.714.975.992-3.621-.235-.372A9.818 9.818 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/></svg>
        </div>
        <div style="flex:1;">
          <div style="font-weight:700;font-size:0.95rem;">Enviar WhatsApp</div>
          <div style="font-size:0.75rem;color:#888;">📞 ${escHtml(c.telefono)} · ${escHtml(c.nombre||'Lead')}${c.propiedad_nombre?' · 🏠 '+escHtml(c.propiedad_nombre):''}</div>
        </div>
        <button onclick="document.getElementById('_waPropActOv').style.display='none'"
          style="background:none;border:none;font-size:1.3rem;cursor:pointer;color:#888;">✕</button>
      </div>
      <div style="display:flex;flex:1;overflow:hidden;min-height:0;">
        <div style="flex:1;padding:14px 16px;display:flex;flex-direction:column;gap:12px;overflow-y:auto;">
          <div>
            <div style="font-size:0.7rem;font-weight:600;color:#888;text-transform:uppercase;margin-bottom:6px;">Textos predeterminados</div>
            <select id="waPropActDropdown"
              onchange="seleccionarTextoWAPropAct(this.value,'${consultaId}')"
              style="width:100%;padding:8px 10px;border-radius:8px;border:1.5px solid #e5e7eb;font-size:0.84rem;cursor:pointer;outline:none;background:white;">
              <option value="">— Elegir texto predeterminado —</option>
              ${todos.map(t => `<option value="${escHtml(t.id)}">${escHtml(t.titulo)}</option>`).join('')}
              ${todos.length === 0 ? '<option value="" disabled style="color:#aaa;">No hay textos guardados</option>' : ''}
            </select>
          </div>
          <div style="flex:1;display:flex;flex-direction:column;">
            <div style="font-size:0.7rem;font-weight:600;color:#888;text-transform:uppercase;margin-bottom:5px;">Mensaje a enviar</div>
            <textarea id="waPropActMsg" rows="6"
              style="width:100%;border:1.5px solid #e5e7eb;border-radius:8px;padding:10px;font-size:0.85rem;resize:vertical;font-family:inherit;box-sizing:border-box;outline:none;"
              placeholder="Seleccioná un texto o escribí directamente..."></textarea>
          </div>
        </div>
        <div style="width:175px;flex-shrink:0;border-left:1px solid var(--border);padding:14px 12px;background:#f8f9fa;overflow-y:auto;">
          <div style="font-size:0.68rem;color:#888;font-weight:600;text-transform:uppercase;margin-bottom:6px;">Atributos</div>
          <div style="font-size:0.68rem;color:#aaa;margin-bottom:10px;">Click para insertar</div>
          ${atributos.map(a=>`
            <button onclick="insertarAtribWAPropAct('${a.key}')"
              style="display:block;width:100%;text-align:left;padding:7px 9px;border-radius:7px;border:1px solid #e5e7eb;background:white;cursor:pointer;margin-bottom:6px;"
              onmouseover="this.style.borderColor='#2563EB'" onmouseout="this.style.borderColor='#e5e7eb'">
              <div style="font-weight:700;color:#2563EB;font-size:0.78rem;">${a.key}</div>
              <div style="color:#888;font-size:0.67rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(a.valor||'(vacío)')}</div>
            </button>`).join('')}
        </div>
      </div>
      <div style="padding:12px 20px;border-top:1px solid var(--border);display:flex;gap:10px;justify-content:flex-end;align-items:center;">
        <div style="flex:1;font-size:0.75rem;color:#aaa;">El mensaje se abrirá en WhatsApp Web</div>
        <button onclick="document.getElementById('_waPropActOv').style.display='none'"
          style="padding:8px 16px;border-radius:8px;border:1px solid #e5e7eb;background:white;cursor:pointer;font-size:0.84rem;">Cancelar</button>
        <button onclick="enviarWAPropAct('${escHtml(c.telefono)}')"
          style="padding:8px 22px;border-radius:8px;border:none;background:#25D366;color:white;cursor:pointer;font-size:0.84rem;font-weight:700;display:flex;align-items:center;gap:7px;">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="16" height="16"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.556 4.121 1.526 5.851L.057 23.868c-.11.415.271.802.687.702l6.225-1.634A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.027-1.384l-.36-.214-3.714.975.992-3.621-.235-.372A9.818 9.818 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/></svg>
          Abrir WhatsApp
        </button>
      </div>
    </div>`;
  ov.style.display = 'flex';
  ov.onclick = e => { if (e.target === ov) ov.style.display = 'none'; };
}

function seleccionarTextoWAPropAct(textoId, cid) {
  if (!textoId) return;
  usarTextoWAPropAct(textoId, cid);
  const sel = document.getElementById('waPropActDropdown');
  if (sel) setTimeout(() => sel.value = '', 100);
}

function filtrarWAPropActTitulo(q, cid) {
  // Kept for compatibility — now using dropdown
}

function abrirModalInfoPropActividad(pid) {
  const p = PROPS.propiedades.find(x => x.id === pid);
  if (!p) return;
  const RESP_LABELS = {
    '':'—','esperando_respuesta':'⏳ Esperando respuesta','aceptado':'✅ Aceptado',
    'rechazado':'❌ Rechazado','decide_esperar':'🕐 Decide esperar','vendio_con_otro':'🔄 Vendió con otro',
  };
  let ov = document.getElementById('_propInfoActOv');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = '_propInfoActOv';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9100;display:flex;align-items:center;justify-content:center;padding:16px;';
    document.body.appendChild(ov);
  }
  ov.innerHTML = `
    <div style="background:white;border-radius:14px;max-width:480px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 12px 40px rgba(0,0,0,0.22);">
      <div style="padding:18px 20px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;">
        <div style="font-weight:700;font-size:1rem;">📋 ${escHtml(p.direccion||'Propiedad')}</div>
        <button onclick="document.getElementById('_propInfoActOv').style.display='none'"
          style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:#888;">✕</button>
      </div>
      <div style="padding:16px 20px;display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        ${p.localidad    ? `<div><div style="font-size:0.65rem;color:#aaa;font-weight:600;text-transform:uppercase;margin-bottom:2px;">Localidad</div><div style="font-size:0.84rem;">📍 ${escHtml(p.localidad)}${p.zona?' · '+escHtml(p.zona):''}</div></div>` : ''}
        ${p.tipologia    ? `<div><div style="font-size:0.65rem;color:#aaa;font-weight:600;text-transform:uppercase;margin-bottom:2px;">Tipología</div><div style="font-size:0.84rem;">${escHtml(p.tipologia)}</div></div>` : ''}
        ${p.nombre_propietario ? `<div><div style="font-size:0.65rem;color:#aaa;font-weight:600;text-transform:uppercase;margin-bottom:2px;">Propietario</div><div style="font-size:0.84rem;">👤 ${escHtml(p.nombre_propietario)}</div></div>` : ''}
        ${p.telefono     ? `<div><div style="font-size:0.65rem;color:#aaa;font-weight:600;text-transform:uppercase;margin-bottom:2px;">Teléfono</div><div style="font-size:0.84rem;">📞 ${escHtml(p.telefono)}</div></div>` : ''}
        ${p.estado_tasacion ? `<div><div style="font-size:0.65rem;color:#aaa;font-weight:600;text-transform:uppercase;margin-bottom:2px;">Estado</div><div style="font-size:0.84rem;">${escHtml(p.estado_tasacion)}</div></div>` : ''}
        ${p.url          ? `<div style="grid-column:span 2;"><div style="font-size:0.65rem;color:#aaa;font-weight:600;text-transform:uppercase;margin-bottom:2px;">Ficha/Portal</div><a href="${escHtml(p.url)}" target="_blank" style="font-size:0.84rem;color:var(--rx-blue);">🔗 Ver ficha</a></div>` : ''}
        ${p.observaciones? `<div style="grid-column:span 2;"><div style="font-size:0.65rem;color:#aaa;font-weight:600;text-transform:uppercase;margin-bottom:4px;">Observaciones</div><div style="font-size:0.82rem;background:#f8f9fa;padding:8px;border-radius:6px;border-left:3px solid #d1d5db;white-space:pre-line;">${escHtml(p.observaciones)}</div></div>` : ''}
      </div>
      <div style="padding:12px 20px;border-top:1px solid #e5e7eb;display:flex;gap:8px;justify-content:flex-end;">
        <button onclick="document.getElementById('_propInfoActOv').style.display='none';abrirEditarPropModal('${p.id}')"
          style="padding:7px 16px;border-radius:8px;border:1px solid #e5e7eb;background:white;cursor:pointer;font-size:0.84rem;font-weight:600;">✏️ Editar</button>
        <button onclick="document.getElementById('_propInfoActOv').style.display='none'"
          style="padding:7px 16px;border-radius:8px;border:none;background:var(--rx-blue);color:white;cursor:pointer;font-size:0.84rem;font-weight:600;">Cerrar</button>
      </div>
    </div>`;
  ov.style.display = 'flex';
  ov.onclick = e => { if (e.target === ov) ov.style.display = 'none'; };
}

function abrirFichaLeadDesdeProp(cid) {
  const c = PROPS.consultas.find(x => x.id === cid);
  if (!c) return;
  const ESTADIO_LABELS = {
    'nuevo':{ label:'Nuevo',color:'#6B7280',bg:'#F3F4F6' },
    'pendiente_visita':{ label:'Pendiente Visita',color:'#7C3AED',bg:'#F5F3FF' },
    'contesto':{ label:'Contestó',color:'#D97706',bg:'#FFFBEB' },
    'seguimiento':{ label:'Seguimiento',color:'#2563EB',bg:'#EFF6FF' },
    'visito':{ label:'Visitó ✓',color:'#059669',bg:'#ECFDF5' },
  };
  const est = ESTADIO_LABELS[c.estado] || { label:c.estado, color:'#888', bg:'#f3f4f6' };
  let ov = document.getElementById('_leadFichaActOv');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = '_leadFichaActOv';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9100;display:flex;align-items:center;justify-content:center;padding:16px;';
    document.body.appendChild(ov);
  }
  ov.innerHTML = `
    <div style="background:white;border-radius:14px;max-width:460px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 12px 40px rgba(0,0,0,0.22);">
      <div style="padding:18px 20px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div style="font-weight:700;font-size:1rem;">👤 ${escHtml(c.nombre||'Lead')}</div>
          <div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap;">
            <span style="font-size:0.72rem;padding:2px 9px;border-radius:12px;font-weight:600;background:${est.bg};color:${est.color};">${est.label}</span>
            ${c.propiedad_nombre ? `<span style="font-size:0.72px;padding:2px 9px;border-radius:12px;background:#EFF6FF;color:#2563EB;font-weight:600;">🏠 ${escHtml(c.propiedad_nombre)}</span>` : ''}
          </div>
        </div>
        <button onclick="document.getElementById('_leadFichaActOv').style.display='none'"
          style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:#888;">✕</button>
      </div>
      <div style="padding:16px 20px;display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        ${c.telefono    ? `<div><div style="font-size:0.65rem;color:#aaa;font-weight:600;text-transform:uppercase;margin-bottom:2px;">Teléfono</div><div style="font-size:0.84rem;">📞 ${escHtml(c.telefono)}</div></div>` : ''}
        ${c.operacion   ? `<div><div style="font-size:0.65rem;color:#aaa;font-weight:600;text-transform:uppercase;margin-bottom:2px;">Operación</div><div style="font-size:0.84rem;">${escHtml(c.operacion)}</div></div>` : ''}
        ${c.presupuesto ? `<div><div style="font-size:0.65rem;color:#aaa;font-weight:600;text-transform:uppercase;margin-bottom:2px;">Presupuesto</div><div style="font-size:0.84rem;">💰 ${escHtml(c.presupuesto)}</div></div>` : ''}
        ${c.zona_interes? `<div><div style="font-size:0.65rem;color:#aaa;font-weight:600;text-transform:uppercase;margin-bottom:2px;">Zona</div><div style="font-size:0.84rem;">📍 ${escHtml(c.zona_interes)}</div></div>` : ''}
        ${c.fecha_visita? `<div style="grid-column:span 2;"><div style="font-size:0.65rem;color:#aaa;font-weight:600;text-transform:uppercase;margin-bottom:2px;">Fecha visita</div><div style="font-size:0.84rem;color:#7C3AED;font-weight:600;">📅 ${formatFecha(c.fecha_visita)}</div></div>` : ''}
        ${c.notas||c.mensaje ? `<div style="grid-column:span 2;"><div style="font-size:0.65rem;color:#aaa;font-weight:600;text-transform:uppercase;margin-bottom:4px;">Notas / Observaciones</div><div style="font-size:0.82rem;background:#f8f9fa;padding:8px;border-radius:6px;border-left:3px solid #d1d5db;white-space:pre-line;">${escHtml(c.notas||c.mensaje)}</div></div>` : ''}
      </div>
      <div style="padding:12px 20px;border-top:1px solid #e5e7eb;display:flex;gap:8px;justify-content:flex-end;">
        ${c.telefono ? `<button onclick="document.getElementById('_leadFichaActOv').style.display='none';abrirWADesdeActividad('${c.id}')"
          style="padding:7px 16px;border-radius:8px;border:none;background:#25D366;color:white;cursor:pointer;font-size:0.84rem;font-weight:600;display:flex;align-items:center;gap:6px;">
          <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='white' width='13' height='13'><path d='M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z'/><path d='M12 0C5.373 0 0 5.373 0 12c0 2.127.556 4.121 1.526 5.851L.057 23.868c-.11.415.271.802.687.702l6.225-1.634A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.027-1.384l-.36-.214-3.714.975.992-3.621-.235-.372A9.818 9.818 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z'/></svg>
          WhatsApp</button>` : ''}
        <button onclick="document.getElementById('_leadFichaActOv').style.display='none'"
          style="padding:7px 16px;border-radius:8px;border:none;background:var(--rx-blue);color:white;cursor:pointer;font-size:0.84rem;font-weight:600;">Cerrar</button>
      </div>
    </div>`;
  ov.style.display = 'flex';
  ov.onclick = e => { if (e.target === ov) ov.style.display = 'none'; };
}

function usarTextoWAPropAct(textoId, cid) {
  const t = _propActTextosWA.find(x => x.id === textoId);
  const c = PROPS.consultas.find(x => x.id === cid);
  if (!t || !c) return;
  const propObj = PROPS.propiedades.find(p => p.direccion === c.propiedad_nombre);
  const propPartes = [c.propiedad_nombre||''];
  if (propObj?.localidad) propPartes.push(propObj.localidad);
  if (propObj?.zona)      propPartes.push(propObj.zona);
  let msg = t.contenido || '';
  msg = msg
    .replace(/\{nombre\}/gi,             c.nombre || '')
    .replace(/\{propiedad\}/gi,          propPartes.filter(Boolean).join(', '))
    .replace(/\{ficha_propiedad\}/gi,    propObj?.url || '')
    .replace(/\{nombre_propietario\}/gi, propObj?.nombre_propietario || '');
  const ta = document.getElementById('waPropActMsg');
  if (ta) { ta.value = msg; ta.focus(); }
}

function insertarAtribWAPropAct(attr) {
  const ta = document.getElementById('waPropActMsg');
  if (!ta) return;
  const s = ta.selectionStart, e = ta.selectionEnd;
  ta.value = ta.value.substring(0,s) + attr + ta.value.substring(e);
  ta.selectionStart = ta.selectionEnd = s + attr.length;
  ta.focus();
}

function enviarWAPropAct(tel) {
  const msg = document.getElementById('waPropActMsg')?.value || '';
  window.open(buildWhatsAppUrl(tel, msg), '_blank');
  const ov = document.getElementById('_waPropActOv');
  if (ov) ov.style.display = 'none';
}

// ══ VER MÁS INFORMACIÓN DE PROPIEDAD ══
function verMasProp(pid) {
  const p = PROPS.propiedades.find(x => x.id === pid);
  if (!p) return;

  const RESP_LABELS = {
    '':                   '—',
    'esperando_respuesta':'⏳ Esperando respuesta',
    'aceptado':           '✅ Aceptado',
    'rechazado':          '❌ Rechazado',
    'decide_esperar':     '🕐 Decide esperar',
    'vendio_con_otro':    '🔄 Vendió con otro',
  };

  let propietarios = [];
  try { if (p.propietarios_json) propietarios = JSON.parse(p.propietarios_json); } catch(e) {}
  if (propietarios.length === 0 && p.nombre_propietario) {
    propietarios = [{ nombre: p.nombre_propietario, telefono: p.telefono||'', email: p.email||'', referido: p.referido||'' }];
  }

  let docs = [];
  try { if (p.documentos_json) docs = JSON.parse(p.documentos_json); } catch(e) {}

  const fila = (label, valor) => valor
    ? `<div style="display:flex;gap:8px;padding:7px 0;border-bottom:1px solid #f3f4f6;">
        <div style="font-size:0.72rem;font-weight:600;color:#888;text-transform:uppercase;min-width:130px;flex-shrink:0;">${label}</div>
        <div style="font-size:0.85rem;color:#374151;flex:1;">${valor}</div>
       </div>` : '';

  let ov = document.getElementById('_verMasPropOv');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = '_verMasPropOv';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px;';
    document.body.appendChild(ov);
  }

  ov.innerHTML = `
    <div style="background:white;border-radius:14px;max-width:580px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 12px 40px rgba(0,0,0,0.2);">
      <div style="padding:18px 22px;border-bottom:1px solid #f3f4f6;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:white;z-index:1;">
        <div>
          <div style="font-weight:700;font-size:1.05rem;">${escHtml(p.direccion||'—')}</div>
          <div style="font-size:0.78rem;color:#888;">${p.localidad||''}${p.zona?' · '+p.zona:''}</div>
        </div>
        <button onclick="document.getElementById('_verMasPropOv').style.display='none'"
          style="background:none;border:none;font-size:1.3rem;cursor:pointer;color:#888;">✕</button>
      </div>
      <div style="padding:16px 22px;">
        <div style="font-size:0.7rem;font-weight:700;color:var(--rx-blue);text-transform:uppercase;margin-bottom:8px;">📍 Datos del inmueble</div>
        ${fila('Dirección',   escHtml(p.direccion||''))}
        ${fila('Localidad',   escHtml(p.localidad||''))}
        ${fila('Zona',        escHtml(p.zona||''))}
        ${fila('Tipología',   escHtml(p.tipologia||''))}
        ${fila('Estado',      escHtml(p.estado_tasacion||''))}
        ${fila('Respuesta',   RESP_LABELS[p.respuesta_listing||'']||'—')}
        ${p.url ? fila('Ficha / Portal', `<a href="${escHtml(p.url)}" target="_blank" style="color:var(--rx-blue);">🔗 ${escHtml(p.url)}</a>`) : ''}

        <div style="font-size:0.7rem;font-weight:700;color:var(--rx-blue);text-transform:uppercase;margin:14px 0 8px;">📅 Seguimiento</div>
        ${fila('Próximo contacto', p.proximo_contacto ? formatFecha(p.proximo_contacto) : '')}
        ${fila('Último contacto',  p.ultimo_contacto  ? formatFecha(p.ultimo_contacto)  : '')}
        ${fila('Fecha prelisting', p.fecha_prelisting ? formatFecha(p.fecha_prelisting) : '')}
        ${p.observaciones ? fila('Observaciones', `<span style="white-space:pre-wrap;">${escHtml(p.observaciones)}</span>`) : ''}

        ${propietarios.length > 0 ? `
        <div style="font-size:0.7rem;font-weight:700;color:var(--rx-blue);text-transform:uppercase;margin:14px 0 8px;">👤 Propietarios</div>
        ${propietarios.map(pr=>`
          <div style="padding:10px 12px;background:#f8f9fa;border-radius:8px;margin-bottom:6px;">
            <div style="font-weight:600;font-size:0.88rem;">${escHtml(pr.nombre||'')}</div>
            <div style="font-size:0.78rem;color:#666;display:flex;gap:12px;flex-wrap:wrap;margin-top:3px;">
              ${pr.telefono?`<span>📞 ${escHtml(pr.telefono)}</span>`:''}
              ${pr.email?`<span>✉️ ${escHtml(pr.email)}</span>`:''}
              ${pr.referido?`<span>🔗 Ref: ${escHtml(pr.referido)}</span>`:''}
            </div>
          </div>`).join('')}` : ''}

        ${docs.length > 0 ? `
        <div style="font-size:0.7rem;font-weight:700;color:var(--rx-blue);text-transform:uppercase;margin:14px 0 8px;">📁 Documentación</div>
        ${docs.map(d=>`
          <div style="display:flex;align-items:center;gap:8px;padding:7px 12px;background:#f8f9fa;border-radius:8px;margin-bottom:5px;">
            <span>${(d.tipo||'').includes('pdf')?'📄':'📎'}</span>
            <span style="font-size:0.83rem;font-weight:600;flex:1;">${escHtml(d.nombre||'Documento')}</span>
            ${d.notas?`<span style="font-size:0.75rem;color:#888;">${escHtml(d.notas)}</span>`:''}
            ${d.dataUrl?`<a href="${d.dataUrl}" target="_blank" style="font-size:0.75rem;color:var(--rx-blue);">👁️</a>`:''}
            ${d.dataUrl?`<a href="${d.dataUrl}" download="${escHtml(d.nombre||'doc')}" style="font-size:0.75rem;color:#059669;">⬇️</a>`:''}
          </div>`).join('')}` : ''}
      </div>
      <div style="padding:14px 22px;border-top:1px solid #f3f4f6;display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="document.getElementById('_verMasPropOv').style.display='none';abrirEditarPropModal('${p.id}')"
          style="padding:8px 18px;border-radius:8px;border:1px solid var(--rx-blue);background:white;color:var(--rx-blue);cursor:pointer;font-size:0.85rem;font-weight:600;">✏️ Editar</button>
        <button onclick="document.getElementById('_verMasPropOv').style.display='none'"
          style="padding:8px 18px;border-radius:8px;border:none;background:var(--rx-blue);color:white;cursor:pointer;font-size:0.85rem;font-weight:600;">Cerrar</button>
      </div>
    </div>`;
  ov.style.display = 'flex';
  ov.onclick = e => { if (e.target === ov) ov.style.display = 'none'; };
}
