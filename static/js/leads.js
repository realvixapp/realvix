/**
 * leads.js — Consultas con estadios + Muestras
 */
const LEADS = { consultas: [], estadioFiltro: 'todos', propiedades: [] };

async function initLeads() {
  await Promise.all([cargarConsultas(), cargarPropiedadesLead()]);
  setBadge('badgeLeads', LEADS.consultas.filter(c => c.estado === 'nuevo').length);
}

// Carga las propiedades de la cartera para el dropdown
async function cargarPropiedadesLead() {
  try {
    const data = await apiGet('/api/propiedades');
    LEADS.propiedades = data.propiedades || [];
    poblarSelectPropiedad();
  } catch (e) { console.error('No se pudieron cargar propiedades', e); }
}

function poblarSelectPropiedad(valorActual) {
  const sel   = document.getElementById('leadPropiedadSelect');
  const input = document.getElementById('leadPropiedad');
  if (!sel) return;

  // Solo publicadas o reservadas (case-insensitive)
  const activas = LEADS.propiedades.filter(p => {
    const est = (p.estado_tasacion || p.estadio || '').toLowerCase().trim();
    return ['publicado','reservado','publicada','reservada'].includes(est);
  });

  sel.innerHTML = '<option value="">— Seleccionar propiedad —</option>'
    + activas.map(p => {
        const est = (p.estado_tasacion || p.estadio || '').toLowerCase();
        const badge = est.includes('publ') ? '🟢' : '🔴';
        const label = `${badge} ${p.direccion}${p.tipologia ? ' · ' + p.tipologia : ''}${p.localidad ? ', ' + p.localidad : ''}`;
        const val   = p.direccion;
        const sel2  = (valorActual && valorActual === val) ? ' selected' : '';
        return `<option value="${escHtml(val)}"${sel2}>${escHtml(label)}</option>`;
      }).join('');

  if (activas.length === 0) {
    sel.innerHTML += '<option value="" disabled style="color:#aaa;">⚠ No hay propiedades publicadas/reservadas en cartera</option>';
  }

  // Sync hidden input with current select value
  if (valorActual) {
    sel.value = valorActual;
    if (input) input.value = valorActual;
  }
}

function onSelectPropiedad(sel) {
  const input = document.getElementById('leadPropiedad');
  if (input) input.value = sel.value || '';
}

// Mostrar/ocultar campo fecha visita según estadio
function onEstadioChange(val) {
  const campo = document.getElementById('campoFechaVisita');
  if (campo) campo.style.display = val === 'pendiente_visita' ? '' : 'none';
}

function switchLeadsTab(tab, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('tabConsultas').style.display = tab === 'consultas' ? '' : 'none';
  document.getElementById('tabMuestras').style.display  = tab === 'muestras'  ? '' : 'none';
  const tabAct = document.getElementById('tabActividad');
  if (tabAct) tabAct.style.display = tab === 'actividad' ? '' : 'none';
  if (tab === 'muestras')   renderMuestras();
  if (tab === 'actividad')  cargarActividadLeads();
}

function filtrarEstadio(est, btn) {
  LEADS.estadioFiltro = est;
  document.querySelectorAll('.estadio-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderLeads();
}

async function cargarConsultas() {
  try {
    const data = await apiGet('/api/consultas');
    LEADS.consultas = data.consultas || [];
    renderLeads();
  } catch (e) { showToast('Error al cargar leads', 'error'); }
}

function filtrarLeads() { renderLeads(); }

let _leadsSeleccionados = new Set();

function toggleSeleccionLead(cid) {
  if (_leadsSeleccionados.has(cid)) _leadsSeleccionados.delete(cid);
  else _leadsSeleccionados.add(cid);
  _actualizarBarraLeads();
}

function toggleSeleccionTodosLeads(checked, cids) {
  if (checked) cids.forEach(id => _leadsSeleccionados.add(id));
  else _leadsSeleccionados.clear();
  _actualizarBarraLeads();
  document.querySelectorAll('.lead-checkbox-row').forEach(cb => { cb.checked = checked; });
}

function _actualizarBarraLeads() {
  const barra = document.getElementById('barraSeleccionLeads');
  if (!barra) return;
  if (_leadsSeleccionados.size > 0) {
    barra.style.display = 'flex';
    document.getElementById('selCountLeads').textContent = `${_leadsSeleccionados.size} seleccionado(s)`;
  } else {
    barra.style.display = 'none';
  }
}

async function eliminarSeleccionadosLeads() {
  if (_leadsSeleccionados.size === 0) return;
  if (!confirmar(`¿Eliminar ${_leadsSeleccionados.size} lead(s)? No se puede deshacer.`)) return;
  try {
    for (const cid of _leadsSeleccionados) {
      await apiDelete(`/api/consultas/${cid}`);
    }
    _leadsSeleccionados.clear();
    showToast('Leads eliminados ✓', 'success');
    await cargarConsultas();
  } catch(e) { showToast(e.message, 'error'); }
}

function renderLeads() {
  const q = (document.getElementById('filtroLeads')?.value || '').toLowerCase();
  let lista = LEADS.consultas.filter(c => {
    const matchEst = LEADS.estadioFiltro === 'todos' || c.estado === LEADS.estadioFiltro;
    const matchQ   = !q || (c.nombre||'').toLowerCase().includes(q) ||
      (c.telefono||'').includes(q) || (c.propiedad_nombre||'').toLowerCase().includes(q);
    return matchEst && matchQ;
  });

  const ESTADIO_LABELS = {
    'nuevo':            { label:'Nuevo',            color:'#6B7280', bg:'#F3F4F6' },
    'pendiente_visita': { label:'Pendiente Visita',  color:'#7C3AED', bg:'#F5F3FF' },
    'contesto':         { label:'Contestó',          color:'#D97706', bg:'#FFFBEB' },
    'seguimiento':      { label:'Seguimiento',       color:'#2563EB', bg:'#EFF6FF' },
    'visito':           { label:'Visitó ✓',          color:'#059669', bg:'#ECFDF5' },
  };

  const container = document.getElementById('leadsGrid');
  if (!container) return;

  const cids = lista.map(c => `'${c.id}'`).join(',');

  let html = `
    <div id="barraSeleccionLeads" style="display:none;align-items:center;gap:10px;padding:8px 12px;background:#FEF9C3;border-radius:8px;margin-bottom:10px;border:1px solid #FDE047;">
      <span id="selCountLeads" style="font-size:0.85rem;font-weight:600;color:#92400E;"></span>
      <button onclick="eliminarSeleccionadosLeads()"
        style="padding:5px 14px;border-radius:8px;border:none;background:#DC2626;color:white;cursor:pointer;font-size:0.82rem;font-weight:600;">🗑️ Eliminar seleccionados</button>
      <button onclick="_leadsSeleccionados.clear();_actualizarBarraLeads();renderLeads();"
        style="padding:5px 12px;border-radius:8px;border:1px solid #e5e7eb;background:white;cursor:pointer;font-size:0.82rem;">✕ Cancelar</button>
    </div>`;

  if (lista.length === 0) {
    html += `<div class="empty-state">No hay leads en este estadio</div>`;
    container.innerHTML = html;
    return;
  }

  html += `<div style="display:flex;flex-direction:column;gap:8px;">
    <div style="display:flex;align-items:center;gap:8px;padding:4px 10px 4px 6px;">
      <input type="checkbox" style="cursor:pointer;" onchange="toggleSeleccionTodosLeads(this.checked,[${cids}])">
      <span style="font-size:0.75rem;color:#888;font-weight:600;">Seleccionar todos</span>
    </div>
    ${lista.map(c => {
      const est = ESTADIO_LABELS[c.estado] || { label:c.estado, color:'#888', bg:'#f8f9fa' };
      const tieneVisita = c.estado === 'pendiente_visita' && c.fecha_visita;
      const isSelected = _leadsSeleccionados.has(c.id);
      return `
        <div class="card" style="padding:14px;display:flex;align-items:center;gap:14px;${isSelected?'background:#EFF6FF;border-color:var(--rx-blue);':''}" >
          <input type="checkbox" class="lead-checkbox-row" style="cursor:pointer;flex-shrink:0;" ${isSelected?'checked':''} onchange="toggleSeleccionLead('${c.id}')">
          <div style="flex:1;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
              <strong style="font-size:0.9rem;color:var(--rx-blue);cursor:pointer;text-decoration:underline dotted;"
                data-lid="${c.id}" onclick="editarConsulta(this.dataset.lid)">${escHtml(c.nombre || 'Sin nombre')}</strong>
              <span style="font-size:0.72rem;padding:2px 8px;border-radius:12px;font-weight:600;background:${est.bg};color:${est.color};">${est.label}</span>
              ${tieneVisita ? `<span style="font-size:0.72rem;background:#EDE9FE;color:#7C3AED;border-radius:12px;padding:2px 8px;font-weight:600;">📅 ${formatFecha(c.fecha_visita)}</span>` : ''}
            </div>
            <div style="font-size:0.8rem;color:#888;display:flex;gap:12px;flex-wrap:wrap;">
              ${c.telefono          ? `<span>📞 ${escHtml(c.telefono)}</span>`          : ''}
              ${c.propiedad_nombre  ? `<span>🏠 ${escHtml(c.propiedad_nombre)}</span>`  : ''}
              ${c.presupuesto       ? `<span>💰 ${escHtml(c.presupuesto)}</span>`       : ''}
              <span style="color:#ccc;">${formatFecha(c.created_at)}</span>
            </div>
          </div>
          <div style="display:flex;gap:6px;align-items:center;">
            <select class="input-base" style="font-size:0.78rem;padding:4px 8px;height:auto;width:150px;"
              data-cid="${c.id}" onchange="cambiarEstadio(this.dataset.cid, this.value)">
              ${Object.entries(ESTADIO_LABELS).map(([k,v]) =>
                `<option value="${k}" ${c.estado===k?'selected':''}>${v.label}</option>`
              ).join('')}
            </select>
            ${c.telefono ? `<button class="btn-icon-sm" data-lid="${c.id}" onclick="abrirWAConMensajes(this.dataset.lid)" title="WhatsApp"
              style="background:#25D366;color:white;border:none;border-radius:8px;width:30px;height:30px;cursor:pointer;display:flex;align-items:center;justify-content:center;">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="14" height="14"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.556 4.121 1.526 5.851L.057 23.868c-.11.415.271.802.687.702l6.225-1.634A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.027-1.384l-.36-.214-3.714.975.992-3.621-.235-.372A9.818 9.818 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/></svg>
              </button>` : ''}
            <button class="btn-icon-sm" data-cid="${c.id}" onclick="editarConsulta(this.dataset.cid)" title="Editar">✏️</button>
            <button class="btn-icon-sm danger" data-cid="${c.id}" onclick="eliminarConsulta(this.dataset.cid)" title="Eliminar">🗑️</button>
          </div>
        </div>`;
    }).join('')}
  </div>`;

  container.innerHTML = html;
  _actualizarBarraLeads();
}

async function cambiarEstadio(id, nuevoEstado) {
  const c = LEADS.consultas.find(x => x.id === id);
  if (!c) return;
  try {
    await apiPut(`/api/consultas/${id}`, { ...c, estado: nuevoEstado });
    c.estado = nuevoEstado;
    if (nuevoEstado === 'visito') showToast('Lead marcado como Visitó → aparece en Muestras ✓', 'success');
    renderLeads();

    // 📅 Ofrecer agendar si es pendiente visita
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
  } catch (e) { showToast(e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════
// ── FICHA LEAD EN MODAL (#16) ──
// ══════════════════════════════════════════════════════════

const LEADS_TEXTOS_WA = [];  // caché de textos de Contenido

async function cargarTextosWA() {
  if (LEADS_TEXTOS_WA.length > 0) return;
  try {
    const data = await apiGet('/api/textos');
    const textos = (data.textos || []).filter(t => t.tipo === 'whatsapp');
    LEADS_TEXTOS_WA.push(...textos);
  } catch(e) { console.error('No se pudieron cargar textos WA', e); }
}

function abrirFichaLead(id) {
  const c = LEADS.consultas.find(x => x.id === id);
  if (!c) return;
  cargarTextosWA();

  const ESTADIO_LABELS = {
    'nuevo':            { label:'Nuevo',           color:'#6B7280', bg:'#F3F4F6' },
    'pendiente_visita': { label:'Pendiente Visita', color:'#7C3AED', bg:'#F5F3FF' },
    'contesto':         { label:'Contestó',         color:'#D97706', bg:'#FFFBEB' },
    'seguimiento':      { label:'Seguimiento',      color:'#2563EB', bg:'#EFF6FF' },
    'visito':           { label:'Visitó ✓',         color:'#059669', bg:'#ECFDF5' },
  };
  const est = ESTADIO_LABELS[c.estado] || { label: c.estado, color:'#888', bg:'#f3f4f6' };

  let overlay = document.getElementById('_fichaLeadOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = '_fichaLeadOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px;';
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = `
    <div style="background:var(--bg-card,white);border-radius:14px;max-width:520px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 12px 40px rgba(0,0,0,0.2);">
      <!-- Header -->
      <div style="padding:18px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div style="font-weight:700;font-size:1rem;">${escHtml(c.nombre || 'Sin nombre')}</div>
          <div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap;">
            <span style="font-size:0.72rem;padding:2px 9px;border-radius:12px;font-weight:600;background:${est.bg};color:${est.color};">${est.label}</span>
            ${c.propiedad_nombre ? `<span style="font-size:0.72rem;padding:2px 9px;border-radius:12px;background:#EFF6FF;color:#2563EB;font-weight:600;">🏠 ${escHtml(c.propiedad_nombre)}</span>` : ''}
          </div>
        </div>
        <button onclick="document.getElementById('_fichaLeadOverlay').style.display='none'"
          style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:#888;padding:4px;">✕</button>
      </div>
      <!-- Datos -->
      <div style="padding:16px 20px;display:grid;grid-template-columns:1fr 1fr;gap:10px;border-bottom:1px solid var(--border);">
        ${c.telefono    ? `<div><div style="font-size:0.68rem;color:#aaa;font-weight:600;text-transform:uppercase;margin-bottom:2px;">Teléfono</div><div style="font-size:0.85rem;">📞 ${escHtml(c.telefono)}</div></div>` : ''}
        ${c.email       ? `<div><div style="font-size:0.68rem;color:#aaa;font-weight:600;text-transform:uppercase;margin-bottom:2px;">Email</div><div style="font-size:0.85rem;">✉️ ${escHtml(c.email)}</div></div>` : ''}
        ${c.presupuesto ? `<div><div style="font-size:0.68rem;color:#aaa;font-weight:600;text-transform:uppercase;margin-bottom:2px;">Presupuesto</div><div style="font-size:0.85rem;">💰 ${escHtml(c.presupuesto)}</div></div>` : ''}
        ${c.zona_interes? `<div><div style="font-size:0.68rem;color:#aaa;font-weight:600;text-transform:uppercase;margin-bottom:2px;">Zona interés</div><div style="font-size:0.85rem;">📍 ${escHtml(c.zona_interes)}</div></div>` : ''}
        ${c.operacion   ? `<div><div style="font-size:0.68rem;color:#aaa;font-weight:600;text-transform:uppercase;margin-bottom:2px;">Operación</div><div style="font-size:0.85rem;">${escHtml(c.operacion)}</div></div>` : ''}
        ${c.canal       ? `<div><div style="font-size:0.68rem;color:#aaa;font-weight:600;text-transform:uppercase;margin-bottom:2px;">Canal</div><div style="font-size:0.85rem;">${escHtml(c.canal)}</div></div>` : ''}
        ${c.fecha_visita? `<div><div style="font-size:0.68rem;color:#aaa;font-weight:600;text-transform:uppercase;margin-bottom:2px;">Fecha visita</div><div style="font-size:0.85rem;color:#7C3AED;font-weight:600;">📅 ${formatFecha(c.fecha_visita)}</div></div>` : ''}
        <div><div style="font-size:0.68rem;color:#aaa;font-weight:600;text-transform:uppercase;margin-bottom:2px;">Ingresó</div><div style="font-size:0.85rem;">${formatFecha(c.created_at)}</div></div>
      </div>
      ${c.notas ? `
      <div style="padding:14px 20px;border-bottom:1px solid var(--border);">
        <div style="font-size:0.68rem;color:#aaa;font-weight:600;text-transform:uppercase;margin-bottom:6px;">Notas</div>
        <div style="font-size:0.84rem;color:#444;white-space:pre-line;background:#f8f9fa;padding:10px;border-radius:8px;">${escHtml(c.notas)}</div>
      </div>` : ''}
      <!-- Acciones rápidas -->
      <div style="padding:14px 20px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
        <div style="font-size:0.72rem;color:#888;font-weight:600;text-transform:uppercase;width:100%;margin-bottom:4px;">Acciones rápidas</div>
        ${c.telefono ? `
          <button onclick="abrirWAConMensajes('${escHtml(c.id)}')"
            style="display:flex;align-items:center;gap:6px;padding:8px 16px;border-radius:10px;border:none;background:#25D366;color:white;cursor:pointer;font-size:0.84rem;font-weight:600;">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="15" height="15"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.556 4.121 1.526 5.851L.057 23.868c-.11.415.271.802.687.702l6.225-1.634A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.027-1.384l-.36-.214-3.714.975.992-3.621-.235-.372A9.818 9.818 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/></svg>
            WhatsApp
          </button>` : ''}
        <button onclick="cerrarFichaAbrirEditar('${escHtml(c.id)}')"
          style="padding:8px 14px;border-radius:10px;border:1px solid #e5e7eb;background:white;cursor:pointer;font-size:0.84rem;font-weight:600;color:#374151;">
          ✏️ Editar lead
        </button>
        <div style="flex:1;"></div>
        <select style="font-size:0.8rem;padding:6px 10px;border-radius:10px;border:1px solid #e5e7eb;cursor:pointer;background:white;"
          onchange="cambiarEstadioDesdeficha('${escHtml(c.id)}',this.value)">
          ${Object.entries(ESTADIO_LABELS).map(([k,v])=>`<option value="${k}" ${c.estado===k?'selected':''}>${v.label}</option>`).join('')}
        </select>
      </div>
    </div>`;

  overlay.style.display = 'flex';
  overlay.onclick = (e) => { if (e.target === overlay) overlay.style.display = 'none'; };
}

function cerrarFichaAbrirEditar(id) {
  document.getElementById('_fichaLeadOverlay').style.display = 'none';
  editarConsulta(id);
}

async function cambiarEstadioDesdeficha(id, nuevoEstado) {
  const c = LEADS.consultas.find(x => x.id === id);
  if (!c) return;
  try {
    await apiPut(`/api/consultas/${id}`, { ...c, estado: nuevoEstado });
    c.estado = nuevoEstado;
    renderLeads();
    abrirFichaLead(id); // refrescar ficha
    showToast('Estado actualizado ✓');
  } catch(e) { showToast(e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════
// ── WHATSAPP CON MENSAJES PREDETERMINADOS (#17) ──
// ══════════════════════════════════════════════════════════

function abrirWAConMensajes(leadId) {
  // Try LEADS first, then LACT
  let c = LEADS.consultas.find(x => x.id === leadId);
  if (!c && typeof LACT !== 'undefined') c = LACT.consultas.find(x => x.id === leadId);
  if (!c || !c.telefono) return;
  // Ensure the consulta is in LEADS for overlay to work
  if (!LEADS.consultas.find(x => x.id === leadId)) LEADS.consultas.push(c);
  if (LEADS_TEXTOS_WA.length === 0) {
    cargarTextosWA().then(() => _abrirWAOverlay(leadId));
    return;
  }
  _abrirWAOverlay(leadId);
}

function _buildPropTexto(c) {
  // {propiedad} = nombre + localidad + zona
  // {ficha_propiedad} = URL del link de ficha/portal
  const partes = [c.propiedad_nombre || ''];
  // Buscar en todas las fuentes disponibles
  const allProps = [
    ...(LEADS.propiedades || []),
    ...(typeof NEG !== 'undefined' && NEG.propiedades ? NEG.propiedades : []),
    ...(typeof LACT !== 'undefined' && LACT.propiedades ? LACT.propiedades : []),
    ...(typeof PROPS !== 'undefined' && PROPS.propiedades ? PROPS.propiedades : []),
  ];
  const p = allProps.find(x => x.direccion && c.propiedad_nombre &&
    x.direccion.trim().toLowerCase() === c.propiedad_nombre.trim().toLowerCase());
  if (p) {
    if (p.localidad) partes.push(p.localidad);
    if (p.zona)      partes.push(p.zona);
    const fichaUrl = p.url || p.link_ficha || p.ficha_portal || '';
    return { propTexto: partes.filter(Boolean).join(', '), fichaUrl, propietarioNombre: p.nombre_propietario || '' };
  }
  return { propTexto: partes.filter(Boolean).join(', '), fichaUrl: '', propietarioNombre: '' };
}

function _abrirWAOverlay(leadId) {
  const c = LEADS.consultas.find(x => x.id === leadId);
  if (!c) return;

  const { propTexto, fichaUrl, propietarioNombre } = _buildPropTexto(c);

  const atributos = [
    { key: '{nombre}',             label: 'Nombre lead',              valor: c.nombre || '' },
    { key: '{propiedad}',          label: 'Nombre + localidad + zona', valor: propTexto },
    { key: '{ficha_propiedad}',    label: 'Link ficha propiedad',     valor: fichaUrl },
    { key: '{nombre_propietario}', label: 'Nombre propietario',       valor: propietarioNombre },
  ];

  let overlay = document.getElementById('_waOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = '_waOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9500;display:flex;align-items:center;justify-content:center;padding:16px;';
    document.body.appendChild(overlay);
  }

  const todosTextos = LEADS_TEXTOS_WA;

  const textosHTML = (lista) => lista.length > 0
    ? lista.map(t => `
        <div onclick="usarTextoWA('${t.id}','${leadId}')"
          style="padding:8px 12px;border-radius:8px;border:1px solid #e5e7eb;cursor:pointer;font-size:0.8rem;background:white;margin-bottom:4px;"
          onmouseover="this.style.borderColor='#25D366';this.style.background='#f0fff4'" onmouseout="this.style.borderColor='#e5e7eb';this.style.background='white'">
          <div style="font-weight:600;color:#374151;margin-bottom:2px;">${escHtml(t.titulo)}</div>
          <div style="color:#888;font-size:0.72rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml((t.contenido||'').substring(0,90))}…</div>
        </div>`).join('')
    : '<div style="font-size:0.8rem;color:#aaa;padding:4px 0;">No hay textos guardados.</div>';

  overlay.innerHTML = `
    <div style="background:var(--bg-card,white);border-radius:14px;max-width:660px;width:100%;max-height:90vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 12px 40px rgba(0,0,0,0.25);">
      <div style="padding:14px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;">
        <div style="width:36px;height:36px;border-radius:50%;background:#25D366;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="20" height="20"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.556 4.121 1.526 5.851L.057 23.868c-.11.415.271.802.687.702l6.225-1.634A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.027-1.384l-.36-.214-3.714.975.992-3.621-.235-.372A9.818 9.818 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/></svg>
        </div>
        <div style="flex:1;">
          <div style="font-weight:700;font-size:0.95rem;">Enviar WhatsApp</div>
          <div style="font-size:0.75rem;color:#888;">📞 ${escHtml(c.telefono)} · ${escHtml(c.nombre||'Lead')}${c.propiedad_nombre ? ' · 🏠 '+escHtml(c.propiedad_nombre) : ''}</div>
        </div>
        <button onclick="document.getElementById('_waOverlay').style.display='none'"
          style="background:none;border:none;font-size:1.3rem;cursor:pointer;color:#888;padding:4px;">✕</button>
      </div>
      <div style="display:flex;flex:1;overflow:hidden;min-height:0;">
        <div style="flex:1;padding:14px 16px;display:flex;flex-direction:column;gap:12px;overflow-y:auto;">
          <!-- Dropdown textos predeterminados -->
          <div>
            <div style="font-size:0.7rem;font-weight:600;color:#888;text-transform:uppercase;margin-bottom:6px;">Textos predeterminados</div>
            <select id="waTextosSelect"
              onchange="seleccionarTextoWADropdown(this.value,'${leadId}')"
              style="width:100%;padding:8px 10px;border-radius:8px;border:1.5px solid #e5e7eb;font-size:0.84rem;cursor:pointer;outline:none;background:white;">
              <option value="">— Elegir texto predeterminado —</option>
              ${todosTextos.map(t => `<option value="${escHtml(t.id)}">${escHtml(t.titulo)}</option>`).join('')}
              ${todosTextos.length === 0 ? '<option value="" disabled style="color:#aaa;">No hay textos guardados</option>' : ''}
            </select>
          </div>
          <!-- Textarea -->
          <div style="flex:1;display:flex;flex-direction:column;">
            <div style="font-size:0.7rem;font-weight:600;color:#888;text-transform:uppercase;margin-bottom:5px;">Mensaje a enviar</div>
            <textarea id="waMensajeTexto" rows="6"
              style="width:100%;border:1.5px solid #e5e7eb;border-radius:8px;padding:10px;font-size:0.85rem;resize:vertical;font-family:inherit;box-sizing:border-box;outline:none;"
              placeholder="Seleccioná un texto arriba o escribí directamente..."></textarea>
          </div>
        </div>
        <!-- Panel atributos -->
        <div style="width:175px;flex-shrink:0;border-left:1px solid var(--border);padding:14px 12px;background:#f8f9fa;overflow-y:auto;">
          <div style="font-size:0.68rem;color:#888;font-weight:600;text-transform:uppercase;margin-bottom:6px;">Atributos</div>
          <div style="font-size:0.68rem;color:#aaa;margin-bottom:10px;">Click para insertar</div>
          ${atributos.map(a=>`
            <button onclick="insertarAtributoWA('${a.key}')"
              style="display:block;width:100%;text-align:left;padding:7px 9px;border-radius:7px;border:1px solid #e5e7eb;background:white;cursor:pointer;margin-bottom:6px;"
              onmouseover="this.style.borderColor='#2563EB'" onmouseout="this.style.borderColor='#e5e7eb'">
              <div style="font-weight:700;color:#2563EB;font-size:0.78rem;">${a.key}</div>
              <div style="color:#888;font-size:0.67rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px;">${escHtml(a.valor||'(vacío)')}</div>
            </button>`).join('')}
        </div>
      </div>
      <div style="padding:12px 20px;border-top:1px solid var(--border);display:flex;gap:10px;justify-content:flex-end;align-items:center;">
        <div style="flex:1;font-size:0.75rem;color:#aaa;">El mensaje se abrirá en WhatsApp Web</div>
        <button onclick="document.getElementById('_waOverlay').style.display='none'"
          style="padding:8px 16px;border-radius:8px;border:1px solid #e5e7eb;background:white;cursor:pointer;font-size:0.84rem;">Cancelar</button>
        <button onclick="enviarMensajeWA('${escHtml(c.telefono)}')"
          style="padding:8px 22px;border-radius:8px;border:none;background:#25D366;color:white;cursor:pointer;font-size:0.84rem;font-weight:700;display:flex;align-items:center;gap:7px;">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="16" height="16"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.556 4.121 1.526 5.851L.057 23.868c-.11.415.271.802.687.702l6.225-1.634A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.027-1.384l-.36-.214-3.714.975.992-3.621-.235-.372A9.818 9.818 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/></svg>
          Abrir WhatsApp
        </button>
      </div>
    </div>`;

  overlay.style.display = 'flex';
  overlay.onclick = e => { if (e.target === overlay) overlay.style.display = 'none'; };
}

function seleccionarTextoWADropdown(textoId, leadId) {
  if (!textoId) return;
  usarTextoWA(textoId, leadId);
  // Reset select after selection
  const sel = document.getElementById('waTextosSelect');
  if (sel) setTimeout(() => sel.value = '', 100);
}

function filtrarTextosWATitulo(q, leadId) {
  // Kept for compatibility - now using dropdown, this is a no-op
}

function usarTextoWA(textoId, leadId) {
  const t = LEADS_TEXTOS_WA.find(x => x.id === textoId);
  const c = LEADS.consultas.find(x => x.id === leadId);
  if (!t || !c) return;
  const { propTexto, fichaUrl, propietarioNombre } = _buildPropTexto(c);
  let msg = t.contenido || '';
  msg = msg
    .replace(/\{nombre\}/gi,             c.nombre || '')
    .replace(/\{propiedad\}/gi,          propTexto)
    .replace(/\{ficha_propiedad\}/gi,    fichaUrl)
    .replace(/\{nombre_propietario\}/gi, propietarioNombre);
  const ta = document.getElementById('waMensajeTexto');
  if (ta) { ta.value = msg; ta.focus(); }
}

function insertarAtributoWA(atributo) {
  const ta = document.getElementById('waMensajeTexto');
  if (!ta) return;
  const s = ta.selectionStart, e = ta.selectionEnd;
  ta.value = ta.value.substring(0,s) + atributo + ta.value.substring(e);
  ta.selectionStart = ta.selectionEnd = s + atributo.length;
  ta.focus();
}

function enviarMensajeWA(telefono) {
  const msg = document.getElementById('waMensajeTexto')?.value || '';
  window.open(buildWhatsAppUrl(telefono, msg), '_blank');
  const ov = document.getElementById('_waOverlay');
  if (ov) ov.style.display = 'none';
}


function abrirNuevaConsulta() {
  ['leadId','leadNombre','leadTelefono','leadEmail','leadPropiedad',
   'leadPresupuesto','leadZona','leadMensaje','leadFechaVisita'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const sel = document.getElementById('leadPropiedadSelect');
  if (sel) sel.value = '';
  document.getElementById('leadCanal').value    = 'whatsapp';
  document.getElementById('leadOperacion').value= 'compra';
  document.getElementById('leadEstado').value   = 'nuevo';
  document.getElementById('modalLeadTitulo').textContent = 'Nueva consulta';
  onEstadioChange('nuevo');
  // Recargar propiedades si la lista está vacía (por si cambió el estado)
  if (LEADS.propiedades.length === 0) {
    cargarPropiedadesLead().then(poblarSelectPropiedad);
  } else {
    poblarSelectPropiedad();
  }
  abrirModal('modalConsulta');
}

function editarConsulta(id) {
  const c = LEADS.consultas.find(x => x.id === id);
  if (!c) return;
  document.getElementById('leadId').value          = c.id;
  document.getElementById('leadNombre').value      = c.nombre || '';
  document.getElementById('leadTelefono').value    = c.telefono || '';
  document.getElementById('leadEmail').value       = c.email || '';
  document.getElementById('leadPropiedad').value   = c.propiedad_nombre || '';
  document.getElementById('leadCanal').value       = c.canal || 'whatsapp';
  document.getElementById('leadOperacion').value   = c.operacion || 'compra';
  document.getElementById('leadPresupuesto').value = c.presupuesto || '';
  document.getElementById('leadZona').value        = c.zona_interes || '';
  document.getElementById('leadEstado').value      = c.estado || 'nuevo';
  document.getElementById('leadFechaVisita').value = c.fecha_visita || '';
  document.getElementById('leadMensaje').value     = c.mensaje || c.notas || '';
  document.getElementById('modalLeadTitulo').textContent = 'Editar consulta';
  onEstadioChange(c.estado || 'nuevo');
  if (LEADS.propiedades.length === 0) {
    cargarPropiedadesLead().then(() => poblarSelectPropiedad(c.propiedad_nombre || ''));
  } else {
    poblarSelectPropiedad(c.propiedad_nombre || '');
  }
  abrirModal('modalConsulta');
}

async function guardarConsulta() {
  const id         = document.getElementById('leadId').value;
  const estadio    = document.getElementById('leadEstado').value;
  const fechaVisita= document.getElementById('leadFechaVisita').value;

  const body = {
    nombre:           document.getElementById('leadNombre').value,
    telefono:         document.getElementById('leadTelefono').value,
    email:            document.getElementById('leadEmail').value,
    propiedad_nombre: document.getElementById('leadPropiedad').value,
    canal:            document.getElementById('leadCanal').value,
    operacion:        document.getElementById('leadOperacion').value,
    presupuesto:      document.getElementById('leadPresupuesto').value,
    zona_interes:     document.getElementById('leadZona').value,
    estado:           estadio,
    fecha_visita:     fechaVisita,
    mensaje:          document.getElementById('leadMensaje').value,
  };
  try {
    if (id) await apiPut(`/api/consultas/${id}`, body);
    else    await apiPost('/api/consultas', body);
    cerrarModal('modalConsulta');
    showToast('Lead guardado');
    await cargarConsultas();

    // 📅 Si tiene fecha de visita → ofrecer agendar
    if (estadio === 'pendiente_visita') {
      setTimeout(() => {
        pedirAgendarEnCalendar({
          titulo:      `Visita — ${body.nombre || 'Lead'}`,
          descripcion: `🏠 Visita con ${body.nombre || 'lead'}${body.propiedad_nombre ? ' · ' + body.propiedad_nombre : ''}${body.telefono ? ' · 📞 ' + body.telefono : ''}`,
          fecha:       fechaVisita || '',
          hora:        '10:00',
          notas:       body.mensaje || '',
        });
      }, 300);
    }
  } catch (e) { showToast(e.message, 'error'); }
}

async function eliminarConsulta(id) {
  if (!confirmar('¿Eliminar este lead?')) return;
  try {
    await apiDelete(`/api/consultas/${id}`);
    showToast('Lead eliminado');
    await cargarConsultas();
  } catch (e) { showToast(e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════
// ── ACTIVIDAD EN LEADS (propiedades + respuesta propietario) ──
// ══════════════════════════════════════════════════════════

const LACT = { propiedades: [], consultas: [], propFiltro: '' };

async function cargarActividadLeads() {
  try {
    const [dataProp, dataLeads] = await Promise.all([
      apiGet('/api/propiedades'),
      apiGet('/api/consultas'),
    ]);
    LACT.propiedades = dataProp.propiedades || [];
    LACT.consultas   = dataLeads.consultas  || [];
    renderActividadLeads();
  } catch(e) { showToast('Error al cargar actividad', 'error'); }
}

function renderActividadLeads() {
  const s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

  // ── ANÁLISIS DE LEADS POR ESTADIO ──
  const ESTADIO_LABELS_ACT = {
    'nuevo':            { label:'Nuevo',            color:'#6B7280', bg:'#F3F4F6' },
    'pendiente_visita': { label:'Pendiente Visita',  color:'#7C3AED', bg:'#F5F3FF' },
    'contesto':         { label:'Contestó',          color:'#D97706', bg:'#FFFBEB' },
    'seguimiento':      { label:'Seguimiento',       color:'#2563EB', bg:'#EFF6FF' },
    'visito':           { label:'Visitó ✓',          color:'#059669', bg:'#ECFDF5' },
  };
  const statsEstadiosEl = document.getElementById('lActStatsEstadios');
  if (statsEstadiosEl) {
    const total = LACT.consultas.length;
    statsEstadiosEl.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;width:100%;">
        ${Object.entries(ESTADIO_LABELS_ACT).map(([k,v]) => {
          const count = LACT.consultas.filter(c => c.estado === k).length;
          const pct = total > 0 ? Math.round((count/total)*100) : 0;
          return `
            <div class="stat-mini" style="border-left:4px solid ${v.color};cursor:pointer;" onclick="filtrarEstadio('${k}',null);switchLeadsTab('consultas',document.querySelector('.tab-btn'));">
              <div class="stat-mini-label" style="color:${v.color};font-weight:600;font-size:0.72rem;text-transform:uppercase;">${v.label}</div>
              <div class="stat-mini-num" style="color:${v.color};">${count}</div>
              <div style="font-size:0.7rem;color:#aaa;margin-top:2px;">${pct}% del total</div>
              <div style="height:3px;background:#f3f4f6;border-radius:4px;margin-top:5px;overflow:hidden;">
                <div style="height:100%;width:${pct}%;background:${v.color};border-radius:4px;transition:width 0.4s;"></div>
              </div>
            </div>`;
        }).join('')}
        <div class="stat-mini" style="border-left:4px solid #374151;">
          <div class="stat-mini-label" style="font-weight:600;font-size:0.72rem;text-transform:uppercase;">Total leads</div>
          <div class="stat-mini-num">${total}</div>
          <div style="font-size:0.7rem;color:#aaa;margin-top:2px;">Todos los estadios</div>
        </div>
      </div>`;
  }

  // Stats respuesta propietario
  s('lActRespAcept', LACT.propiedades.filter(p => p.respuesta_listing === 'aceptado').length);
  s('lActRespRech',  LACT.propiedades.filter(p => p.respuesta_listing === 'rechazado').length);
  s('lActRespEsp',   LACT.propiedades.filter(p => (p.respuesta_listing||'esperando_respuesta') === 'esperando_respuesta').length);

  // Solo publicadas/reservadas para actividad
  const props = LACT.propiedades.filter(p => {
    const est = (p.estado_tasacion || p.estadio || '').toLowerCase().trim();
    return ['publicado','reservado','publicada','reservada'].includes(est);
  });

  const conPorProp = (p) => LACT.consultas.filter(c =>
    c.propiedad_nombre && p.direccion &&
    c.propiedad_nombre.trim().toLowerCase() === p.direccion.trim().toLowerCase()
  );

  const todosLeads   = props.flatMap(p => conPorProp(p));
  const totalVisitas = todosLeads.filter(c => ['visito','visitó'].includes((c.estado||'').toLowerCase())).length;
  const pendVisita   = todosLeads.filter(c => c.estado === 'pendiente_visita').length;
  s('lActTotalProps',   props.length);
  s('lActTotalLeads',   todosLeads.length);
  s('lActTotalVisitas', totalVisitas);
  s('lActPendVisita',   pendVisita);

  // Ordenar por consultas
  const propsConConteo = props.map(p => ({ ...p, consultas: conPorProp(p) }))
    .sort((a, b) => b.consultas.length - a.consultas.length);

  // Top 5
  const top5El   = document.getElementById('lTop5Section');
  const top5Grid = document.getElementById('lTop5Grid');
  if (top5El && top5Grid && propsConConteo.length > 0) {
    top5El.style.display = '';
    const medals = ['🥇','🥈','🥉','4️⃣','5️⃣'];
    top5Grid.innerHTML = propsConConteo.slice(0,5).map((p,i) => {
      const visitaron = p.consultas.filter(c => ['visito','visitó'].includes((c.estado||'').toLowerCase())).length;
      return `<div class="card" style="padding:12px 14px;cursor:pointer;border:2px solid ${LACT.propFiltro===p.direccion?'var(--rx-blue)':'transparent'};"
        onclick="filtrarPropLead('${escHtml(p.direccion)}')">
        <div style="font-size:1.2rem;margin-bottom:4px;">${medals[i]}</div>
        <div style="font-weight:700;font-size:0.85rem;margin-bottom:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(p.direccion)}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <span style="font-size:0.73rem;background:var(--rx-blue-light);color:var(--rx-blue);padding:2px 7px;border-radius:8px;font-weight:600;">${p.consultas.length} consultas</span>
          <span style="font-size:0.73rem;background:var(--success-bg);color:var(--success);padding:2px 7px;border-radius:8px;font-weight:600;">${visitaron} visitas</span>
        </div>
      </div>`;
    }).join('');
  }

  // Índice por nombre de propiedad
  const indexEl = document.getElementById('lPropNombreIndex');
  if (indexEl && propsConConteo.length > 0) {
    indexEl.innerHTML = `<div style="background:var(--cream);border:1px solid var(--border);border-radius:8px;padding:10px 14px;">
      <div style="font-size:0.72rem;font-weight:600;color:#888;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px;">Filtrar por propiedad</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
        <button onclick="filtrarPropLead('')"
          style="padding:4px 12px;border-radius:20px;border:1.5px solid ${!LACT.propFiltro?'var(--rx-blue)':'var(--border)'};
          background:${!LACT.propFiltro?'var(--rx-blue)':'white'};color:${!LACT.propFiltro?'white':'#666'};
          font-size:0.75rem;font-weight:600;cursor:pointer;">Todas (${propsConConteo.length})</button>
        ${propsConConteo.map(p =>
          `<button onclick="filtrarPropLead('${escHtml(p.direccion)}')"
            style="padding:4px 12px;border-radius:20px;border:1.5px solid ${LACT.propFiltro===p.direccion?'var(--rx-blue)':'var(--border)'};
            background:${LACT.propFiltro===p.direccion?'var(--rx-blue)':'white'};
            color:${LACT.propFiltro===p.direccion?'white':'#444'};
            font-size:0.75rem;font-weight:600;cursor:pointer;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
            title="${escHtml(p.direccion)}">
            ${escHtml(p.direccion.length>20?p.direccion.substring(0,20)+'…':p.direccion)} (${p.consultas.length})
          </button>`).join('')}
      </div>
    </div>`;
  }

  const container = document.getElementById('lActividadGrid');
  if (!container) return;

  const mostrar = LACT.propFiltro
    ? propsConConteo.filter(p => p.direccion === LACT.propFiltro)
    : propsConConteo;

  if (mostrar.length === 0) {
    container.innerHTML = `<div class="empty-state">No hay propiedades publicadas o reservadas todavía.</div>`; return;
  }

  const ESTADIO_LABELS = {
    'nuevo':            { label:'Nuevo',           color:'#6B7280', bg:'#F3F4F6' },
    'pendiente_visita': { label:'Pend. visita',     color:'#7C3AED', bg:'#F5F3FF' },
    'contesto':         { label:'Contestó',         color:'#D97706', bg:'#FFFBEB' },
    'seguimiento':      { label:'Seguimiento',      color:'#2563EB', bg:'#EFF6FF' },
    'visito':           { label:'Visitó ✓',         color:'#059669', bg:'#ECFDF5' },
  };

  container.innerHTML = mostrar.map(p => {
    const est = (p.estado_tasacion||'').toLowerCase();
    const esP = est.includes('publ');
    const badgeColor = esP ? '#059669' : '#DC2626';
    const badgeBg    = esP ? '#ECFDF5' : '#FEF2F2';
    const nV  = p.consultas.filter(c => ['visito','visitó'].includes((c.estado||'').toLowerCase())).length;
    const nPV = p.consultas.filter(c => c.estado === 'pendiente_visita').length;
    const nS  = p.consultas.filter(c => c.estado === 'seguimiento').length;
    return `
    <div class="card" style="padding:0;margin-bottom:16px;overflow:hidden;">
      <div style="padding:14px 18px;background:linear-gradient(135deg,#f8f9ff,#f0f4ff);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
            <span style="font-weight:700;font-size:0.95rem;">${escHtml(p.direccion||'—')}</span>
            <span style="font-size:0.7rem;padding:2px 9px;border-radius:12px;font-weight:700;background:${badgeBg};color:${badgeColor};">${esP?'🟢 Publicado':'🔴 Reservado'}</span>
            ${p.tipologia?`<span style="font-size:0.72rem;color:#888;background:#f3f4f6;padding:2px 7px;border-radius:8px;">${escHtml(p.tipologia)}</span>`:''}
          </div>
          ${p.nombre_propietario?`<div style="font-size:0.79rem;color:#888;">👤 ${escHtml(p.nombre_propietario)}</div>`:''}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${[['Consultas',p.consultas.length,'var(--rx-blue)'],['Visitaron',nV,'#059669'],['Pend.visita',nPV,'#7C3AED'],['Seguim.',nS,'#2563EB']].map(([lbl,num,col])=>
            `<div style="text-align:center;padding:6px 10px;background:white;border-radius:8px;border:1px solid var(--border);min-width:50px;">
              <div style="font-size:1.1rem;font-weight:700;color:${col};">${num}</div>
              <div style="font-size:0.6rem;color:#888;white-space:nowrap;">${lbl}</div>
            </div>`).join('')}
        </div>
      </div>
      ${p.consultas.length===0
        ?`<div style="padding:16px;text-align:center;color:#bbb;font-size:0.82rem;">Sin consultas asociadas todavía</div>`
        :`<div style="padding:10px 18px 14px;">
          <div style="font-size:0.72rem;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">Consultas (${p.consultas.length})</div>
          ${p.consultas.map(c=>{
            const st=ESTADIO_LABELS[c.estado]||{label:c.estado,color:'#888',bg:'#f3f4f6'};
            return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;background:${st.bg}22;border:1px solid ${st.color}22;margin-bottom:5px;flex-wrap:wrap;">
              <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                  <span style="font-weight:600;font-size:0.85rem;">${escHtml(c.nombre||'Sin nombre')}</span>
                  <span style="font-size:0.68rem;padding:1px 7px;border-radius:10px;font-weight:600;background:${st.bg};color:${st.color};">${st.label}</span>
                  ${c.fecha_visita?`<span style="font-size:0.68rem;background:#EDE9FE;color:#7C3AED;border-radius:8px;padding:1px 6px;">📅 ${formatFecha(c.fecha_visita)}</span>`:''}
                </div>
                <div style="font-size:0.75rem;color:#888;margin-top:2px;display:flex;gap:10px;flex-wrap:wrap;">
                  ${c.telefono?`<span>📞 ${escHtml(c.telefono)}</span>`:''}
                  ${c.presupuesto?`<span>💰 ${escHtml(c.presupuesto)}</span>`:''}
                  <span style="color:#ccc;">${formatFecha(c.created_at)}</span>
                </div>
              </div>
              <div style="display:flex;gap:4px;flex-shrink:0;">
                ${c.telefono?`<button class="btn-icon-sm" data-cid="${c.id}"
                  onclick="abrirWAConMensajes(this.dataset.cid)" title="WhatsApp"
                  style="background:#25D366;color:white;border:none;border-radius:8px;width:28px;height:28px;font-size:0.9rem;cursor:pointer;display:flex;align-items:center;justify-content:center;">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="14" height="14"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.556 4.121 1.526 5.851L.057 23.868c-.11.415.271.802.687.702l6.225-1.634A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.027-1.384l-.36-.214-3.714.975.992-3.621-.235-.372A9.818 9.818 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/></svg>
                  </button>`:''}
                <select class="input-base" style="font-size:0.72rem;padding:3px 6px;height:auto;width:128px;"
                  data-cid="${c.id}" onchange="cambiarEstadioActLeads(this.dataset.cid,this.value,this)">
                  ${Object.entries(ESTADIO_LABELS).map(([k,v])=>`<option value="${k}" ${c.estado===k?'selected':''}>${v.label}</option>`).join('')}
                </select>
              </div>
            </div>`;
          }).join('')}
        </div>`}
    </div>`;
  }).join('');
}

function filtrarPropLead(nombre) {
  LACT.propFiltro = nombre;
  renderActividadLeads();
}

async function cambiarEstadioActLeads(id, nuevoEstado, selEl) {
  const c = LACT.consultas.find(x => x.id === id);
  if (!c) return;
  const anterior = c.estado;
  try {
    await apiPut(`/api/consultas/${id}`, { ...c, estado: nuevoEstado });
    c.estado = nuevoEstado;
    renderActividadLeads();
    showToast('Estado actualizado ✓');
    if (nuevoEstado === 'pendiente_visita') {
      setTimeout(() => pedirAgendarEnCalendar({
        titulo: `Visita — ${c.nombre||'Lead'}`,
        descripcion: `🏠 Visita con ${c.nombre||'lead'}${c.propiedad_nombre?' · '+c.propiedad_nombre:''}${c.telefono?' · 📞 '+c.telefono:''}`,
        fecha: c.fecha_visita||'', hora: '10:00',
      }), 300);
    }
  } catch(e) { if(selEl) selEl.value=anterior; showToast(e.message,'error'); }
}
