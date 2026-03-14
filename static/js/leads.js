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
                <strong style="font-size:0.9rem;color:var(--rx-blue);cursor:pointer;text-decoration:underline dotted;"
                  data-lid="${c.id}" onclick="abrirFichaLead(this.dataset.lid)">${escHtml(c.nombre || 'Sin nombre')}</strong>
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
              ${c.telefono ? `<button class="btn-icon-sm" data-lid="${c.id}" onclick="abrirWAConMensajes(this.dataset.lid)" title="WhatsApp" style="background:#25D366;color:white;border:none;border-radius:8px;">💬</button>` : ''}
              <button class="btn-icon-sm" data-cid="${c.id}" onclick="abrirFichaLead(this.dataset.cid)" title="Ver ficha">👁️</button>
              <button class="btn-icon-sm" data-cid="${c.id}" onclick="editarConsulta(this.dataset.cid)" title="Editar">✏️</button>
              <button class="btn-icon-sm danger" data-cid="${c.id}" onclick="eliminarConsulta(this.dataset.cid)" title="Eliminar">🗑️</button>
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
            💬 WhatsApp
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
  const c = LEADS.consultas.find(x => x.id === leadId);
  if (!c || !c.telefono) return;

  let overlay = document.getElementById('_waOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = '_waOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9500;display:flex;align-items:center;justify-content:center;padding:16px;';
    document.body.appendChild(overlay);
  }

  const textos = LEADS_TEXTOS_WA.length > 0 ? LEADS_TEXTOS_WA : [];
  const atributos = [
    { key: '{nombre}',    label: 'Nombre del lead',   valor: c.nombre || '' },
    { key: '{propiedad}', label: 'Ficha propiedad',   valor: c.propiedad_nombre || '' },
    { key: '{telefono}',  label: 'Teléfono',           valor: c.telefono || '' },
    { key: '{presupuesto}', label: 'Presupuesto',      valor: c.presupuesto || '' },
  ];

  overlay.innerHTML = `
    <div style="background:var(--bg-card,white);border-radius:14px;max-width:620px;width:100%;max-height:90vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 12px 40px rgba(0,0,0,0.25);">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;">
        <div style="width:36px;height:36px;border-radius:50%;background:#25D366;display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0;">💬</div>
        <div style="flex:1;">
          <div style="font-weight:700;font-size:0.95rem;">Enviar WhatsApp</div>
          <div style="font-size:0.75rem;color:#888;">📞 ${escHtml(c.telefono)} · ${escHtml(c.nombre || 'Lead')}</div>
        </div>
        <button onclick="document.getElementById('_waOverlay').style.display='none'"
          style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:#888;">✕</button>
      </div>
      <div style="display:flex;flex:1;overflow:hidden;min-height:0;">
        <!-- Panel mensaje -->
        <div style="flex:1;padding:16px 18px;display:flex;flex-direction:column;gap:12px;overflow-y:auto;">
          ${textos.length > 0 ? `
          <div>
            <div style="font-size:0.7rem;color:#888;font-weight:600;text-transform:uppercase;margin-bottom:6px;">Seleccionar texto predeterminado</div>
            <div style="display:flex;flex-direction:column;gap:5px;max-height:160px;overflow-y:auto;">
              ${textos.map(t => `
                <div onclick="usarTextoWA('${t.id}','${leadId}')"
                  style="padding:8px 12px;border-radius:8px;border:1px solid #e5e7eb;cursor:pointer;font-size:0.8rem;background:white;"
                  onmouseover="this.style.borderColor='#25D366'" onmouseout="this.style.borderColor='#e5e7eb'">
                  <div style="font-weight:600;margin-bottom:2px;">${escHtml(t.titulo)}</div>
                  <div style="color:#888;font-size:0.75rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml((t.contenido||'').substring(0,80))}...</div>
                </div>`).join('')}
            </div>
          </div>` : '<div style="font-size:0.8rem;color:#aaa;">No hay textos de WhatsApp guardados. Podés escribir uno directamente.</div>'}
          <div>
            <div style="font-size:0.7rem;color:#888;font-weight:600;text-transform:uppercase;margin-bottom:6px;">Mensaje a enviar</div>
            <textarea id="waMensajeTexto" rows="6"
              style="width:100%;border:1px solid #e5e7eb;border-radius:8px;padding:10px;font-size:0.85rem;resize:vertical;font-family:inherit;box-sizing:border-box;"
              placeholder="Escribí o seleccioná un texto predeterminado arriba..."></textarea>
          </div>
        </div>
        <!-- Panel atributos -->
        <div style="width:160px;flex-shrink:0;border-left:1px solid var(--border);padding:14px 12px;background:#f8f9fa;overflow-y:auto;">
          <div style="font-size:0.68rem;color:#888;font-weight:600;text-transform:uppercase;margin-bottom:8px;">Atributos</div>
          <div style="font-size:0.7rem;color:#aaa;margin-bottom:10px;">Hacé click para insertar</div>
          ${atributos.map(a => `
            <button onclick="insertarAtributoWA('${a.key}')"
              style="display:block;width:100%;text-align:left;padding:6px 8px;border-radius:6px;border:1px solid #e5e7eb;background:white;cursor:pointer;margin-bottom:5px;font-size:0.75rem;"
              title="Valor: ${escHtml(a.valor)}">
              <div style="font-weight:600;color:#2563EB;">${a.key}</div>
              <div style="color:#888;font-size:0.68rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(a.valor || '(vacío)')}</div>
            </button>`).join('')}
        </div>
      </div>
      <div style="padding:14px 20px;border-top:1px solid var(--border);display:flex;gap:10px;justify-content:flex-end;align-items:center;">
        <div style="flex:1;font-size:0.75rem;color:#888;">El mensaje se abrirá en WhatsApp Web</div>
        <button onclick="document.getElementById('_waOverlay').style.display='none'"
          style="padding:8px 16px;border-radius:8px;border:1px solid #e5e7eb;background:white;cursor:pointer;font-size:0.84rem;">Cancelar</button>
        <button onclick="enviarMensajeWA('${escHtml(c.telefono)}')"
          style="padding:8px 20px;border-radius:8px;border:none;background:#25D366;color:white;cursor:pointer;font-size:0.84rem;font-weight:700;">
          💬 Abrir WhatsApp
        </button>
      </div>
    </div>`;

  overlay.style.display = 'flex';
  overlay.onclick = (e) => { if (e.target === overlay) overlay.style.display = 'none'; };
}

function usarTextoWA(textoId, leadId) {
  const t = LEADS_TEXTOS_WA.find(x => x.id === textoId);
  const c = LEADS.consultas.find(x => x.id === leadId);
  if (!t || !c) return;
  let msg = t.contenido || '';
  // Reemplazar atributos
  msg = msg.replace(/\{nombre\}/gi,    c.nombre || '')
           .replace(/\{propiedad\}/gi, c.propiedad_nombre || '')
           .replace(/\{telefono\}/gi,  c.telefono || '')
           .replace(/\{presupuesto\}/gi, c.presupuesto || '');
  const textarea = document.getElementById('waMensajeTexto');
  if (textarea) textarea.value = msg;
}

function insertarAtributoWA(atributo) {
  const textarea = document.getElementById('waMensajeTexto');
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end   = textarea.selectionEnd;
  const val   = textarea.value;
  textarea.value = val.substring(0, start) + atributo + val.substring(end);
  textarea.selectionStart = textarea.selectionEnd = start + atributo.length;
  textarea.focus();
}

function enviarMensajeWA(telefono) {
  const msg = document.getElementById('waMensajeTexto')?.value || '';
  const url = buildWhatsAppUrl(telefono, msg);
  window.open(url, '_blank');
  document.getElementById('_waOverlay').style.display = 'none';
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
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <div style="font-weight:600;font-size:0.9rem;color:var(--rx-blue);cursor:pointer;text-decoration:underline dotted;"
              data-lid="${c.id}" onclick="abrirFichaLead(this.dataset.lid)">${escHtml(c.nombre || 'Sin nombre')}</div>
            ${c.telefono ? `<button data-lid="${c.id}" onclick="abrirWAConMensajes(this.dataset.lid)"
              style="padding:4px 10px;border-radius:8px;border:none;background:#25D366;color:white;cursor:pointer;font-size:0.75rem;font-weight:600;">💬 WA</button>` : ''}
          </div>
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
                ${c.telefono?`<button class="btn-icon-sm" data-tel="${escHtml(c.telefono)}" data-nom="${escHtml(c.nombre||'')}"
                  onclick="window.open(buildWhatsAppUrl(this.dataset.tel,'Hola '+this.dataset.nom),'_blank')">💬</button>`:''}
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
