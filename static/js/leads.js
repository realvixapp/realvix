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

function poblarSelectPropiedad() {
  const sel = document.getElementById('leadPropiedadSelect');
  if (!sel) return;
  // Solo propiedades publicadas o reservadas
  const activas = LEADS.propiedades.filter(p => {
    const est = (p.estado_tasacion || p.estadio || '').toLowerCase();
    return est === 'publicado' || est === 'reservado';
  });
  sel.innerHTML = '<option value="">— Seleccionar propiedad publicada/reservada —</option>'
    + activas.map(p => {
        const est = (p.estado_tasacion || p.estadio || '');
        const badge = est === 'publicado' ? '🟢 ' : '🔴 ';
        const label = `${badge}${p.direccion}${p.tipologia ? ' · ' + p.tipologia : ''}${p.localidad ? ' · ' + p.localidad : ''}`;
        return `<option value="${escHtml(p.direccion)}">${escHtml(label)}</option>`;
      }).join('');
  if (activas.length === 0) {
    sel.innerHTML += '<option value="" disabled>Sin propiedades publicadas/reservadas</option>';
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
  if (tab === 'muestras') renderMuestras();
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
  if (lista.length === 0) {
    container.innerHTML = `<div class="empty-state">No hay leads en este estadio</div>`;
    return;
  }

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:8px;">
      ${lista.map(c => {
        const est = ESTADIO_LABELS[c.estado] || { label:c.estado, color:'#888', bg:'#f8f9fa' };
        const tieneVisita = c.estado === 'pendiente_visita' && c.fecha_visita;
        return `
          <div class="card" style="padding:14px;display:flex;align-items:center;gap:14px;">
            <div style="flex:1;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
                <strong style="font-size:0.9rem;">${escHtml(c.nombre || 'Sin nombre')}</strong>
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
                onchange="cambiarEstadio('${c.id}', this.value)">
                ${Object.entries(ESTADIO_LABELS).map(([k,v]) =>
                  `<option value="${k}" ${c.estado===k?'selected':''}>${v.label}</option>`
                ).join('')}
              </select>
              ${c.telefono ? `<button class="btn-icon-sm" onclick="window.open('${buildWhatsAppUrl(c.telefono,'')}','_blank')" title="WhatsApp">💬</button>` : ''}
              <button class="btn-icon-sm" onclick="editarConsulta('${c.id}')" title="Editar">✏️</button>
              <button class="btn-icon-sm danger" onclick="eliminarConsulta('${c.id}')" title="Eliminar">🗑️</button>
            </div>
          </div>`;
      }).join('')}
    </div>`;
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

function renderMuestras() {
  const muestras = LEADS.consultas.filter(c =>
    ['visito','visitó','Visitó','Visito'].includes(c.estado));
  const container = document.getElementById('muestrasGrid');
  if (!container) return;
  if (muestras.length === 0) {
    container.innerHTML = `<div class="empty-state">No hay muestras todavía. Los leads que lleguen a "Visitó" aparecen acá.</div>`;
    return;
  }
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;">
      ${muestras.map(c => `
        <div class="card" style="padding:14px;">
          <div style="font-weight:600;font-size:0.9rem;margin-bottom:6px;">${escHtml(c.nombre || 'Sin nombre')}</div>
          ${c.telefono         ? `<div style="font-size:0.82rem;color:#555;">📞 ${escHtml(c.telefono)}</div>` : ''}
          ${c.propiedad_nombre ? `<div style="font-size:0.82rem;color:#555;">🏠 ${escHtml(c.propiedad_nombre)}</div>` : ''}
          ${c.presupuesto      ? `<div style="font-size:0.82rem;color:#555;">💰 ${escHtml(c.presupuesto)}</div>` : ''}
          ${c.zona_interes     ? `<div style="font-size:0.82rem;color:#555;">📍 ${escHtml(c.zona_interes)}</div>` : ''}
          ${c.fecha_visita     ? `<div style="font-size:0.82rem;color:#7C3AED;">📅 Visita: ${formatFecha(c.fecha_visita)}</div>` : ''}
          ${c.notas            ? `<div style="font-size:0.78rem;color:#888;margin-top:8px;padding-top:8px;border-top:1px solid var(--border);">${escHtml(c.notas)}</div>` : ''}
          <div style="font-size:0.7rem;color:#ccc;margin-top:6px;">${formatFecha(c.updated_at)}</div>
        </div>
      `).join('')}
    </div>`;
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
  poblarSelectPropiedad();
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
  poblarSelectPropiedad();
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
