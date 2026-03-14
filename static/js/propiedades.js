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
  const est = (p.estado_tasacion||'').toLowerCase();
  document.getElementById('editPropEstadio').value = ['publicado','reservado','cerrado'].includes(est) ? est : 'publicado';
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
            <span style="font-weight:700;font-size:0.95rem;">${escHtml(p.direccion||'—')}</span>
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
                  <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;background:${estadio.bg}22;border:1px solid ${estadio.color}22;flex-wrap:wrap;">
                    <div style="flex:1;min-width:0;">
                      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                        <span style="font-weight:600;font-size:0.85rem;">${escHtml(c.nombre||'Sin nombre')}</span>
                        <span style="font-size:0.68rem;padding:1px 7px;border-radius:10px;font-weight:600;background:${estadio.bg};color:${estadio.color};">${estadio.label}</span>
                        ${c.fecha_visita ? `<span style="font-size:0.68rem;background:#EDE9FE;color:#7C3AED;border-radius:8px;padding:1px 6px;">📅 ${formatFecha(c.fecha_visita)}</span>` : ''}
                      </div>
                      <div style="font-size:0.75rem;color:#888;margin-top:2px;display:flex;gap:10px;flex-wrap:wrap;">
                        ${c.telefono    ? `<span>📞 ${escHtml(c.telefono)}</span>` : ''}
                        ${c.presupuesto ? `<span>💰 ${escHtml(c.presupuesto)}</span>` : ''}
                        ${c.operacion   ? `<span>🔑 ${escHtml(c.operacion)}</span>` : ''}
                        <span style="color:#ccc;">${formatFecha(c.created_at)}</span>
                      </div>
                    </div>
                    <div style="display:flex;gap:4px;flex-shrink:0;">
                      ${c.telefono ? `<button class="btn-icon-sm" data-tel="${escHtml(c.telefono)}" data-nom="${escHtml(c.nombre||'')}" data-dir="${escHtml(p.direccion||'')}"
                        onclick="window.open(buildWhatsAppUrl(this.dataset.tel,'Hola '+this.dataset.nom+', te contacto por '+this.dataset.dir),'_blank')">💬</button>` : ''}
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
