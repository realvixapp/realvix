/**
 * firma.js — Firma Electrónica
 * Tabs: Nueva firma / Pendientes / Completados
 * Incluye: asignación de zona en PDF, links copiables, panel de estado inline
 */

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

/* ══════════════════════════════════════════
   ESTADO GLOBAL
══════════════════════════════════════════ */
const FIRMA = {
  firmantes: [],        // [{name, email, sign_zone}]
  pdfFile: null,        // File object
  pdfBase64: null,      // string base64
  pdfDoc: null,         // pdfjsLib document (para el modal)
  // Modal zona
  zonaFirmanteIdx: null,
  zonaPage: 1,
  zonaTotalPages: 1,
  zonaDrawing: false,
  zonaStart: null,
  zonaRect: null,       // {x, y, w, h, page, canvasW, canvasH}
  // Auto-refresh estado
  estadoTimer: null,
};

/* ══════════════════════════════════════════
   INIT
══════════════════════════════════════════ */
function initFirma() {
  if (RX?.user) {
    document.getElementById('docOrgNombre').value = RX.user.name  || '';
    document.getElementById('docOrgEmail').value  = RX.user.email || '';
  }
}

/* ══════════════════════════════════════════
   TABS
══════════════════════════════════════════ */
function switchFirmaTab(tab, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('tabNueva').style.display       = tab === 'nueva'       ? '' : 'none';
  document.getElementById('tabPendientes').style.display  = tab === 'pendientes'  ? '' : 'none';
  document.getElementById('tabCompletados').style.display = tab === 'completados' ? '' : 'none';
  if (tab === 'pendientes')  cargarLista('pendientes');
  if (tab === 'completados') cargarLista('completados');
}

/* ══════════════════════════════════════════
   PDF — CARGA Y DROP
══════════════════════════════════════════ */
function onPdfDrop(e) {
  e.preventDefault();
  document.getElementById('pdfDropZone').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file?.type === 'application/pdf') setPdfFile(file);
  else showToast('Solo se aceptan archivos PDF', 'error');
}

function onPdfSelected(input) {
  if (input.files[0]) setPdfFile(input.files[0]);
}

function setPdfFile(file) {
  FIRMA.pdfFile = file;
  const label = file.name.length > 35 ? file.name.slice(0,32) + '...' : file.name;
  document.getElementById('pdfFileLabel').textContent = label;
  const badge = document.getElementById('pdfBadge');
  document.getElementById('pdfBadgeName').textContent = file.name;
  badge.style.display = 'flex';

  // Leer base64 para el modal de zona
  const reader = new FileReader();
  reader.onload = async e => {
    FIRMA.pdfBase64 = e.target.result.split(',')[1];
    // Pre-cargar doc pdf.js
    const bytes = Uint8Array.from(atob(FIRMA.pdfBase64), c => c.charCodeAt(0));
    FIRMA.pdfDoc = await pdfjsLib.getDocument({ data: bytes }).promise;
  };
  reader.readAsDataURL(file);
}

/* ══════════════════════════════════════════
   FIRMANTES — GESTIÓN
══════════════════════════════════════════ */
function agregarFirmante() {
  const nombre = document.getElementById('nuevoNombre').value.trim();
  const email  = document.getElementById('nuevoEmail').value.trim();
  if (!nombre && !email) { showToast('Ingresá al menos nombre o email', 'error'); return; }

  FIRMA.firmantes.push({ name: nombre, email, sign_zone: null });
  document.getElementById('nuevoNombre').value = '';
  document.getElementById('nuevoEmail').value  = '';
  renderFirmantes();
  // Focus al nombre para agilizar carga de múltiples firmantes
  document.getElementById('nuevoNombre').focus();
}

function quitarFirmante(idx) {
  FIRMA.firmantes.splice(idx, 1);
  renderFirmantes();
}

function renderFirmantes() {
  const c = document.getElementById('firmantesContainer');
  if (!FIRMA.firmantes.length) { c.innerHTML = ''; return; }

  c.innerHTML = FIRMA.firmantes.map((f, i) => {
    const inicial  = (f.name || f.email || '?')[0].toUpperCase();
    const tieneZona = !!f.sign_zone;
    const chipClass = tieneZona ? 'zona-chip asignada' : 'zona-chip';
    const chipText  = tieneZona ? '📍 Zona asignada' : '📍 Asignar zona';
    const pdfBtn    = FIRMA.pdfDoc
      ? `<button class="${chipClass}" onclick="abrirZonaModal(${i})">${chipText}</button>`
      : `<span class="zona-chip" style="opacity:.45;cursor:default;" title="Primero cargá un PDF">📍 Asignar zona</span>`;
    return `
      <div class="firmante-row">
        <div class="f-avatar">${inicial}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;font-size:.85rem;">${escHtml(f.name || '(sin nombre)')}</div>
          <div style="font-size:.76rem;color:var(--text-secondary);">${escHtml(f.email || '')}</div>
        </div>
        ${pdfBtn}
        <button class="btn-icon-sm danger" onclick="quitarFirmante(${i})" title="Quitar firmante">✕</button>
      </div>`;
  }).join('');
}

/* ══════════════════════════════════════════
   MODAL ZONA DE FIRMA
══════════════════════════════════════════ */
async function abrirZonaModal(firmanteIdx) {
  if (!FIRMA.pdfDoc) { showToast('Primero cargá un PDF', 'error'); return; }

  FIRMA.zonaFirmanteIdx = firmanteIdx;
  const f = FIRMA.firmantes[firmanteIdx];

  // Restaurar zona previa si existe
  FIRMA.zonaRect = f.sign_zone ? { ...f.sign_zone } : null;
  FIRMA.zonaPage = f.sign_zone?.page || 1;
  FIRMA.zonaTotalPages = FIRMA.pdfDoc.numPages;

  document.getElementById('zonaModalFirmante').textContent =
    `Firmante: ${f.name || f.email}`;

  const modal = document.getElementById('zonaModal');
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  await zonaRenderPage(FIRMA.zonaPage);
}

function cerrarZonaModal() {
  document.getElementById('zonaModal').style.display = 'none';
  document.body.style.overflow = '';
  FIRMA.zonaFirmanteIdx = null;
  FIRMA.zonaRect = null;
}

async function zonaRenderPage(num) {
  FIRMA.zonaPage = num;
  const page     = await FIRMA.pdfDoc.getPage(num);
  const scale    = Math.min(700 / page.getViewport({ scale: 1 }).width, 1.4);
  const viewport = page.getViewport({ scale });

  const pdfCanvas = document.getElementById('zonaPdfCanvas');
  const overlay   = document.getElementById('zonaOverlay');
  pdfCanvas.width  = overlay.width  = Math.floor(viewport.width);
  pdfCanvas.height = overlay.height = Math.floor(viewport.height);

  await page.render({ canvasContext: pdfCanvas.getContext('2d'), viewport }).promise;

  // Nav páginas
  const navBar = document.getElementById('zonaNavBar');
  if (FIRMA.zonaTotalPages > 1) {
    navBar.style.display = 'flex';
    document.getElementById('zonaPageInfo').textContent =
      `Pág ${num} / ${FIRMA.zonaTotalPages}`;
  } else {
    navBar.style.display = 'none';
  }

  // Redibujar zona si ya existía en esta página
  const ctx = overlay.getContext('2d');
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  if (FIRMA.zonaRect && FIRMA.zonaRect.page === num) {
    dibujarZonaRect(ctx, FIRMA.zonaRect.x, FIRMA.zonaRect.y, FIRMA.zonaRect.w, FIRMA.zonaRect.h);
  }

  setupZonaOverlay(overlay);
}

function setupZonaOverlay(overlay) {
  // Limpiar listeners anteriores clonando el nodo
  const fresh = overlay.cloneNode(true);
  overlay.parentNode.replaceChild(fresh, overlay);

  let drawing = false, startX = 0, startY = 0;

  fresh.addEventListener('mousedown', e => {
    drawing = true;
    const r = fresh.getBoundingClientRect();
    startX = e.clientX - r.left;
    startY = e.clientY - r.top;
  });

  fresh.addEventListener('mousemove', e => {
    if (!drawing) return;
    const r   = fresh.getBoundingClientRect();
    const cx  = e.clientX - r.left;
    const cy  = e.clientY - r.top;
    const ctx = fresh.getContext('2d');
    ctx.clearRect(0, 0, fresh.width, fresh.height);
    dibujarZonaRect(ctx, startX, startY, cx - startX, cy - startY);
  });

  fresh.addEventListener('mouseup', e => {
    if (!drawing) return;
    drawing = false;
    const r = fresh.getBoundingClientRect();
    const ex = e.clientX - r.left;
    const ey = e.clientY - r.top;
    const w  = ex - startX, h = ey - startY;
    if (Math.abs(w) < 10 || Math.abs(h) < 10) return; // zona muy pequeña
    FIRMA.zonaRect = {
      x: Math.min(startX, ex), y: Math.min(startY, ey),
      w: Math.abs(w), h: Math.abs(h),
      page: FIRMA.zonaPage,
      canvasW: fresh.width, canvasH: fresh.height,
    };
  });

  // Touch
  fresh.addEventListener('touchstart', e => {
    e.preventDefault();
    const r = fresh.getBoundingClientRect();
    drawing = true;
    startX = e.touches[0].clientX - r.left;
    startY = e.touches[0].clientY - r.top;
  }, { passive: false });

  fresh.addEventListener('touchmove', e => {
    e.preventDefault();
    if (!drawing) return;
    const r   = fresh.getBoundingClientRect();
    const cx  = e.touches[0].clientX - r.left;
    const cy  = e.touches[0].clientY - r.top;
    const ctx = fresh.getContext('2d');
    ctx.clearRect(0, 0, fresh.width, fresh.height);
    dibujarZonaRect(ctx, startX, startY, cx - startX, cy - startY);
  }, { passive: false });

  fresh.addEventListener('touchend', e => {
    if (!drawing) return;
    drawing = false;
    const r = fresh.getBoundingClientRect();
    const ex = e.changedTouches[0].clientX - r.left;
    const ey = e.changedTouches[0].clientY - r.top;
    const w  = ex - startX, h = ey - startY;
    if (Math.abs(w) < 10 || Math.abs(h) < 10) return;
    FIRMA.zonaRect = {
      x: Math.min(startX, ex), y: Math.min(startY, ey),
      w: Math.abs(w), h: Math.abs(h),
      page: FIRMA.zonaPage,
      canvasW: fresh.width, canvasH: fresh.height,
    };
  });
}

function dibujarZonaRect(ctx, x, y, w, h) {
  ctx.strokeStyle = '#1B3FE4';
  ctx.lineWidth   = 2;
  ctx.setLineDash([6, 3]);
  ctx.fillStyle   = 'rgba(27,63,228,0.10)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);
}

function limpiarZonaOverlay() {
  FIRMA.zonaRect = null;
  const overlay = document.getElementById('zonaOverlay');
  overlay.getContext('2d').clearRect(0, 0, overlay.width, overlay.height);
}

async function zonaChangePage(dir) {
  const np = FIRMA.zonaPage + dir;
  if (np < 1 || np > FIRMA.zonaTotalPages) return;
  await zonaRenderPage(np);
}

function confirmarZona() {
  if (!FIRMA.zonaRect) {
    showToast('Dibujá una zona antes de confirmar', 'error');
    return;
  }
  FIRMA.firmantes[FIRMA.zonaFirmanteIdx].sign_zone = { ...FIRMA.zonaRect };
  cerrarZonaModal();
  renderFirmantes();
  showToast('Zona de firma asignada ✓', 'success');
}

/* ══════════════════════════════════════════
   ENVIAR DOCUMENTO
══════════════════════════════════════════ */
async function enviarDocumento() {
  const titulo = document.getElementById('docTitulo').value.trim();
  if (!titulo) { showToast('El título es requerido', 'error'); return; }
  if (!FIRMA.firmantes.length) { showToast('Agregá al menos un firmante', 'error'); return; }

  const btn = document.getElementById('btnEnviar');
  btn.disabled = true;
  btn.textContent = '⏳ Enviando...';

  const fd = new FormData();
  fd.append('title', titulo);
  fd.append('organizer_name',  document.getElementById('docOrgNombre').value);
  fd.append('organizer_email', document.getElementById('docOrgEmail').value);
  fd.append('firmantes', JSON.stringify(FIRMA.firmantes));
  if (FIRMA.pdfFile) fd.append('pdf_file', FIRMA.pdfFile);

  try {
    const res  = await fetch('/api/documento', { method: 'POST', body: fd });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();

    mostrarResultadoEnvio(data);
    showToast(`Documento enviado a ${FIRMA.firmantes.length} firmante(s) ✓`, 'success');

    // Reset parcial (mantener nombre/email organizador)
    document.getElementById('docTitulo').value = '';
    document.getElementById('docPdf').value    = '';
    document.getElementById('pdfFileLabel').textContent = '';
    document.getElementById('pdfBadge').style.display = 'none';
    FIRMA.firmantes = [];
    FIRMA.pdfFile   = null;
    FIRMA.pdfBase64 = null;
    FIRMA.pdfDoc    = null;
    renderFirmantes();

  } catch (e) {
    showToast('Error al enviar el documento', 'error');
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.textContent = '🚀 Enviar para firma';
  }
}

function mostrarResultadoEnvio(data) {
  const box = document.getElementById('resultEnvio');
  const lc  = document.getElementById('linksContainer');
  box.style.display = 'block';

  lc.innerHTML = (data.firmantes || []).map(f => `
    <div>
      <div style="font-weight:600;font-size:.85rem;color:#065F46;">${escHtml(f.name || f.email)}</div>
      <div style="font-size:.76rem;color:#047857;margin-bottom:6px;">${escHtml(f.email)}</div>
      <div style="display:flex;align-items:center;gap:8px;">
        <input type="text" class="input-base" value="${escHtml(f.sign_url)}" readonly
               style="font-size:.72rem;font-family:monospace;flex:1;height:32px;color:var(--text-secondary);">
        <button class="btn-xs" style="background:#065F46;color:#fff;border:none;flex-shrink:0;white-space:nowrap;"
                onclick="copiarLink('${escHtml(f.sign_url)}',this)">Copiar</button>
      </div>
    </div>`).join('');

  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function copiarLink(url, btn) {
  navigator.clipboard.writeText(url).then(() => {
    const orig = btn.textContent;
    btn.textContent = '¡Copiado!';
    setTimeout(() => { btn.textContent = orig; }, 2000);
  });
}

/* ══════════════════════════════════════════
   LISTAS PENDIENTES / COMPLETADOS
══════════════════════════════════════════ */
async function cargarLista(tipo) {
  const id = tipo === 'pendientes' ? 'listaPendientes' : 'listaCompletados';
  const c  = document.getElementById(id);
  c.innerHTML = `<div class="loading-state">Cargando...</div>`;
  try {
    const data = await apiGet('/api/documentos');
    const docs = (data.documentos || []).filter(d =>
      tipo === 'pendientes' ? !d.completado : d.completado
    );
    renderLista(c, docs, tipo);
  } catch {
    c.innerHTML = `<div class="empty-state">Error al cargar documentos</div>`;
  }
}

function renderLista(container, docs, tipo) {
  if (!docs.length) {
    const msg = tipo === 'pendientes' ? 'No hay documentos pendientes' : 'No hay documentos completados aún';
    container.innerHTML = `<div class="empty-state">${msg}</div>`;
    return;
  }

  container.innerHTML = docs.map(doc => {
    const firmantes = doc.firmantes || [];
    const firmados  = firmantes.filter(f => f.signed).length;
    const total     = firmantes.length;
    const fecha     = formatFecha(doc.created_at);

    if (tipo === 'pendientes') {
      return `
        <div class="doc-row" id="docRow_${doc.id}">
          <div class="doc-icon-box">📄</div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:.87rem;">${escHtml(doc.title || 'Sin título')}</div>
            <div style="font-size:.74rem;color:var(--text-secondary);margin-top:1px;">${fecha} · ${firmados}/${total} firma${total!==1?'s':''}</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
            <span class="badge-pending">Pendiente</span>
            <button class="btn-xs" onclick="verEstadoDoc('${doc.id}','${escHtml(doc.title||'')}')">Ver</button>
            <button class="btn-icon-sm danger" onclick="eliminarDoc('${doc.id}','pendientes')" title="Eliminar">🗑</button>
          </div>
        </div>`;
    } else {
      return `
        <div class="doc-row" id="docRow_${doc.id}">
          <div class="doc-icon-box" style="background:var(--success-bg);color:#065F46;">✅</div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:.87rem;">${escHtml(doc.title || 'Sin título')}</div>
            <div style="font-size:.74rem;color:var(--text-secondary);margin-top:1px;">${fecha} · ${firmados}/${total} firma${total!==1?'s':''}</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
            <span class="badge-done">Completado</span>
            <a href="/api/documento/${doc.id}/certificado" class="btn-xs" target="_blank">⬇️ PDF</a>
            <button class="btn-icon-sm danger" onclick="eliminarDoc('${doc.id}','completados')" title="Eliminar">🗑</button>
          </div>
        </div>`;
    }
  }).join('');
}

async function eliminarDoc(id, tipo) {
  if (!confirmar('¿Eliminar este documento? Esta acción no se puede deshacer.')) return;
  try {
    await apiDelete(`/api/documento/${id}`);
    showToast('Documento eliminado');
    cargarLista(tipo);
    // Si el panel de estado mostraba este doc, cerrarlo
    if (window._estadoDocId === id) cerrarPanelEstado();
  } catch (e) { showToast(e.message, 'error'); }
}

/* ══════════════════════════════════════════
   PANEL DE ESTADO INLINE (Pendientes)
══════════════════════════════════════════ */
async function verEstadoDoc(docId, titulo) {
  window._estadoDocId = docId;
  document.getElementById('estadoTitulo').textContent = titulo || '';
  document.getElementById('panelEstado').style.display = 'block';
  document.getElementById('panelEstado').scrollIntoView({ behavior: 'smooth', block: 'start' });

  await actualizarEstado(docId);

  // Auto-refresh cada 15 seg
  if (FIRMA.estadoTimer) clearInterval(FIRMA.estadoTimer);
  FIRMA.estadoTimer = setInterval(() => {
    if (window._estadoDocId) actualizarEstado(window._estadoDocId);
  }, 15000);
}

async function actualizarEstado(docId) {
  try {
    const data = await apiGet(`/api/documento/${docId}/estado`);
    renderEstadoPanel(data);
  } catch {
    showToast('Error al actualizar el estado', 'error');
  }
}

function renderEstadoPanel(data) {
  const firmantes = data.firmantes || [];
  const firmados  = firmantes.filter(f => f.signed).length;
  const total     = firmantes.length;
  const todos     = firmados === total;

  // Badge
  const badge = document.getElementById('estadoBadge');
  badge.textContent = `${firmados}/${total} firmados`;
  badge.className = todos ? 'badge-done' : 'badge-pending';

  // Texto progreso
  document.getElementById('estadoProgresoText').textContent =
    `${firmados} de ${total} firmante${total!==1?'s':''} completaron la firma`;

  // Firmantes
  const box = document.getElementById('estadoFirmantesBox');
  box.innerHTML = firmantes.map(f => {
    const pendiente = !f.signed;
    const bg  = pendiente ? 'var(--cream)' : 'var(--success-bg)';
    const bdr = pendiente ? 'var(--border)' : '#A7F3D0';
    const ico = pendiente ? '⏳' : '✅';
    const est = pendiente ? '<span style="font-size:.73rem;color:var(--text-secondary);">⏳ Pendiente de firma</span>'
                          : `<span style="font-size:.73rem;color:#065F46;">✅ Firmado</span>`;

    // Link de firma para pendientes
    const linkPart = pendiente && f.sign_url ? `
      <div style="display:flex;align-items:center;gap:8px;margin-top:8px;">
        <input type="text" class="input-base" value="${escHtml(f.sign_url)}" readonly
               style="font-size:.71rem;font-family:monospace;flex:1;height:28px;color:var(--text-secondary);">
        <button class="btn-xs" style="flex-shrink:0;" onclick="copiarLink('${escHtml(f.sign_url)}',this)">Copiar</button>
      </div>` : '';

    return `
      <div style="background:${bg};border:1px solid ${bdr};border-radius:var(--radius-md);padding:12px 14px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="f-avatar" style="${f.signed?'background:#065F46;':''}">${(f.name||f.email||'?')[0].toUpperCase()}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:.85rem;">${escHtml(f.name||'(sin nombre)')}</div>
            <div style="font-size:.75rem;color:var(--text-secondary);">${escHtml(f.email||'')}</div>
            <div style="margin-top:3px;">${est}</div>
          </div>
        </div>
        ${linkPart}
      </div>`;
  }).join('');
}

function cerrarPanelEstado() {
  document.getElementById('panelEstado').style.display = 'none';
  if (FIRMA.estadoTimer) { clearInterval(FIRMA.estadoTimer); FIRMA.estadoTimer = null; }
  window._estadoDocId = null;
}

function descargarPDF(docId) {
  if (!docId) return;
  window.open(`/api/documento/${docId}/certificado`, '_blank');
}
