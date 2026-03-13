/**
 * firma.js — Firma Electrónica
 * Tabs: Nueva firma / Pendientes / Completados
 */

/* ══════════════════════════════════════════
   ESTADO GLOBAL
══════════════════════════════════════════ */
const FIRMA = {
  firmantes: [],      // [{name, email, sign_zone}]
  pdfFile: null,      // File object
  pdfBase64: null,    // base64 string
  pdfDoc: null,       // pdfjsLib document
  // Modal zona
  zonaFirmanteIdx: null,
  zonaPage: 1,
  zonaTotalPages: 1,
  zonaRect: null,     // {x, y, w, h, page, canvasW, canvasH}
  // Auto-refresh estado
  estadoTimer: null,
};

/* ══════════════════════════════════════════
   INIT — se llama desde on_ready (DOMContentLoaded ya pasó)
══════════════════════════════════════════ */
function initFirma() {
  // Configurar pdf.js worker AQUÍ, cuando el script ya cargó
  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  // Pre-rellenar datos del organizador
  if (typeof RX !== 'undefined' && RX.user) {
    const n = document.getElementById('docOrgNombre');
    const e = document.getElementById('docOrgEmail');
    if (n) n.value = RX.user.name  || '';
    if (e) e.value = RX.user.email || '';
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
   PDF — CARGA
══════════════════════════════════════════ */
function onPdfDrop(e) {
  e.preventDefault();
  document.getElementById('pdfDropZone').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type === 'application/pdf') {
    setPdfFile(file);
  } else {
    showToast('Solo se aceptan archivos PDF', 'error');
  }
}

function onPdfSelected(input) {
  if (input.files[0]) setPdfFile(input.files[0]);
}

function setPdfFile(file) {
  FIRMA.pdfFile = file;

  // Nombre en el label
  const short = file.name.length > 38 ? file.name.slice(0, 35) + '...' : file.name;
  document.getElementById('pdfFileLabel').textContent = short;

  // Badge verde
  document.getElementById('pdfBadgeName').textContent = file.name;
  document.getElementById('pdfBadge').style.display = 'flex';

  // Cargar en pdf.js para poder usarlo en el modal de zona
  const reader = new FileReader();
  reader.onload = function(ev) {
    FIRMA.pdfBase64 = ev.target.result.split(',')[1];
    const bytes = Uint8Array.from(atob(FIRMA.pdfBase64), c => c.charCodeAt(0));
    pdfjsLib.getDocument({ data: bytes }).promise.then(function(doc) {
      FIRMA.pdfDoc = doc;
      // Re-render firmantes para activar el chip 📍
      renderFirmantes();
      showToast('PDF cargado — podés asignar zonas de firma', 'success');
    }).catch(function(err) {
      console.error('[PDFJS]', err);
      showToast('Error al leer el PDF', 'error');
    });
  };
  reader.readAsDataURL(file);
}

/* ══════════════════════════════════════════
   FIRMANTES
══════════════════════════════════════════ */
function agregarFirmante() {
  const nombre = document.getElementById('nuevoNombre').value.trim();
  const email  = document.getElementById('nuevoEmail').value.trim();
  if (!nombre && !email) {
    showToast('Ingresá al menos nombre o email', 'error');
    return;
  }
  FIRMA.firmantes.push({ name: nombre, email: email, sign_zone: null });
  document.getElementById('nuevoNombre').value = '';
  document.getElementById('nuevoEmail').value  = '';
  renderFirmantes();
  document.getElementById('nuevoNombre').focus();
}

function quitarFirmante(idx) {
  FIRMA.firmantes.splice(idx, 1);
  renderFirmantes();
}

function renderFirmantes() {
  const c = document.getElementById('firmantesContainer');
  if (!FIRMA.firmantes.length) { c.innerHTML = ''; return; }

  c.innerHTML = FIRMA.firmantes.map(function(f, i) {
    const inicial    = (f.name || f.email || '?')[0].toUpperCase();
    const tieneZona  = !!f.sign_zone;
    const hasPdf     = !!FIRMA.pdfDoc;

    let chipHtml;
    if (!hasPdf) {
      // PDF no cargado — chip deshabilitado con tooltip
      chipHtml = `<span class="zona-chip disabled-chip" title="Primero cargá un PDF">📍 Asignar zona</span>`;
    } else if (tieneZona) {
      chipHtml = `<button class="zona-chip asignada" onclick="abrirZonaModal(${i})">📍 Zona asignada</button>`;
    } else {
      chipHtml = `<button class="zona-chip" onclick="abrirZonaModal(${i})">📍 Asignar zona</button>`;
    }

    return `
      <div class="firmante-row">
        <div class="f-avatar">${escHtml(inicial)}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;font-size:.85rem;">${escHtml(f.name || '(sin nombre)')}</div>
          <div style="font-size:.76rem;color:var(--text-secondary);">${escHtml(f.email || '')}</div>
        </div>
        ${chipHtml}
        <button class="btn-icon-sm danger" onclick="quitarFirmante(${i})" title="Quitar firmante" style="flex-shrink:0;">✕</button>
      </div>`;
  }).join('');
}

/* ══════════════════════════════════════════
   MODAL ZONA DE FIRMA
══════════════════════════════════════════ */
async function abrirZonaModal(firmanteIdx) {
  if (!FIRMA.pdfDoc) {
    showToast('Primero cargá un PDF', 'error');
    return;
  }

  FIRMA.zonaFirmanteIdx = firmanteIdx;
  const f = FIRMA.firmantes[firmanteIdx];

  // Restaurar zona previa
  FIRMA.zonaRect       = f.sign_zone ? Object.assign({}, f.sign_zone) : null;
  FIRMA.zonaPage       = (f.sign_zone && f.sign_zone.page) ? f.sign_zone.page : 1;
  FIRMA.zonaTotalPages = FIRMA.pdfDoc.numPages;

  document.getElementById('zonaModalFirmante').textContent =
    'Firmante: ' + (f.name || f.email || '');

  document.getElementById('zonaModal').style.display = 'flex';
  document.body.style.overflow = 'hidden';

  await zonaRenderPage(FIRMA.zonaPage);
}

function cerrarZonaModal() {
  document.getElementById('zonaModal').style.display = 'none';
  document.body.style.overflow = '';
  FIRMA.zonaFirmanteIdx = null;
  FIRMA.zonaRect        = null;
}

async function zonaRenderPage(num) {
  FIRMA.zonaPage = num;

  const page    = await FIRMA.pdfDoc.getPage(num);
  const vp1     = page.getViewport({ scale: 1 });
  // Escalar para que quepa en el modal (máx ~700px de ancho)
  const scale   = Math.min(680 / vp1.width, 1.5);
  const viewport = page.getViewport({ scale });

  const pdfCanvas = document.getElementById('zonaPdfCanvas');
  const overlay   = document.getElementById('zonaOverlay');

  pdfCanvas.width  = Math.floor(viewport.width);
  pdfCanvas.height = Math.floor(viewport.height);
  overlay.width    = pdfCanvas.width;
  overlay.height   = pdfCanvas.height;

  await page.render({
    canvasContext: pdfCanvas.getContext('2d'),
    viewport
  }).promise;

  // Mostrar/ocultar navegación de páginas
  const navBar = document.getElementById('zonaNavBar');
  if (FIRMA.zonaTotalPages > 1) {
    navBar.className = 'zona-nav-visible';
    document.getElementById('zonaPageInfo').textContent =
      'Pág ' + num + ' / ' + FIRMA.zonaTotalPages;
  } else {
    navBar.className = 'zona-nav-hidden';
  }

  // Limpiar overlay y redibujar zona previa si corresponde a esta página
  const ctx = overlay.getContext('2d');
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  if (FIRMA.zonaRect && FIRMA.zonaRect.page === num) {
    dibujarZonaRect(ctx,
      FIRMA.zonaRect.x, FIRMA.zonaRect.y,
      FIRMA.zonaRect.w, FIRMA.zonaRect.h);
  }

  // Registrar eventos de dibujo en el overlay
  setupZonaOverlay(overlay);
}

function setupZonaOverlay(overlay) {
  // Clonar para eliminar listeners anteriores
  const fresh = overlay.cloneNode(true);
  overlay.parentNode.replaceChild(fresh, overlay);

  let drawing = false;
  let startX  = 0;
  let startY  = 0;

  function getXY(e) {
    const r  = fresh.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    const cy = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
    return [cx, cy];
  }

  function onStart(e) {
    e.preventDefault();
    drawing = true;
    [startX, startY] = getXY(e);
  }

  function onMove(e) {
    e.preventDefault();
    if (!drawing) return;
    const [cx, cy] = getXY(e);
    const ctx = fresh.getContext('2d');
    ctx.clearRect(0, 0, fresh.width, fresh.height);
    dibujarZonaRect(ctx, startX, startY, cx - startX, cy - startY);
  }

  function onEnd(e) {
    if (!drawing) return;
    drawing = false;
    const r  = fresh.getBoundingClientRect();
    const ex = (e.changedTouches ? e.changedTouches[0].clientX : e.clientX) - r.left;
    const ey = (e.changedTouches ? e.changedTouches[0].clientY : e.clientY) - r.top;
    const w  = ex - startX;
    const h  = ey - startY;
    if (Math.abs(w) < 10 || Math.abs(h) < 10) return; // zona demasiado pequeña
    FIRMA.zonaRect = {
      x: Math.min(startX, ex), y: Math.min(startY, ey),
      w: Math.abs(w),          h: Math.abs(h),
      page:    FIRMA.zonaPage,
      canvasW: fresh.width,
      canvasH: fresh.height,
    };
  }

  fresh.addEventListener('mousedown',  onStart);
  fresh.addEventListener('mousemove',  onMove);
  fresh.addEventListener('mouseup',    onEnd);
  fresh.addEventListener('mouseleave', onEnd);
  fresh.addEventListener('touchstart', onStart, { passive: false });
  fresh.addEventListener('touchmove',  onMove,  { passive: false });
  fresh.addEventListener('touchend',   onEnd,   { passive: false });
}

function dibujarZonaRect(ctx, x, y, w, h) {
  ctx.save();
  ctx.setLineDash([6, 3]);
  ctx.strokeStyle = '#1B3FE4';
  ctx.lineWidth   = 2;
  ctx.fillStyle   = 'rgba(27,63,228,0.10)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

function limpiarZonaOverlay() {
  FIRMA.zonaRect = null;
  const overlay = document.getElementById('zonaOverlay');
  if (overlay) overlay.getContext('2d').clearRect(0, 0, overlay.width, overlay.height);
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
  FIRMA.firmantes[FIRMA.zonaFirmanteIdx].sign_zone = Object.assign({}, FIRMA.zonaRect);
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
  btn.disabled    = true;
  btn.textContent = '⏳ Enviando...';

  const fd = new FormData();
  fd.append('title',           titulo);
  fd.append('organizer_name',  document.getElementById('docOrgNombre').value);
  fd.append('organizer_email', document.getElementById('docOrgEmail').value);
  fd.append('firmantes',       JSON.stringify(FIRMA.firmantes));
  if (FIRMA.pdfFile) fd.append('pdf_file', FIRMA.pdfFile);

  try {
    const res  = await fetch('/api/documento', { method: 'POST', body: fd });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();

    mostrarResultadoEnvio(data);
    showToast('Documento enviado a ' + FIRMA.firmantes.length + ' firmante(s) ✓', 'success');

    // Reset (mantener datos del organizador)
    document.getElementById('docTitulo').value     = '';
    document.getElementById('docPdf').value        = '';
    document.getElementById('pdfFileLabel').textContent = '';
    document.getElementById('pdfBadge').style.display  = 'none';
    FIRMA.firmantes = [];
    FIRMA.pdfFile   = null;
    FIRMA.pdfBase64 = null;
    FIRMA.pdfDoc    = null;
    renderFirmantes();

  } catch (e) {
    console.error(e);
    showToast('Error al enviar el documento', 'error');
  } finally {
    btn.disabled    = false;
    btn.textContent = '🚀 Enviar para firma';
  }
}

function mostrarResultadoEnvio(data) {
  const box = document.getElementById('resultEnvio');
  const lc  = document.getElementById('linksContainer');
  box.style.display = 'block';

  lc.innerHTML = (data.firmantes || []).map(function(f) {
    const url = f.sign_url || '';
    return `
      <div>
        <div style="font-weight:600;font-size:.85rem;color:#065F46;">${escHtml(f.name || f.email)}</div>
        <div style="font-size:.76rem;color:#047857;margin-bottom:6px;">${escHtml(f.email)}</div>
        <div style="display:flex;align-items:center;gap:8px;">
          <input type="text" class="input-base" value="${escHtml(url)}" readonly
                 style="font-size:.72rem;font-family:monospace;flex:1;height:32px;color:var(--text-secondary);">
          <button class="btn-xs" style="background:#065F46;color:#fff;border:none;flex-shrink:0;white-space:nowrap;"
                  onclick="copiarLink('${escHtml(url)}',this)">Copiar</button>
        </div>
      </div>`;
  }).join('');

  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function copiarLink(url, btn) {
  navigator.clipboard.writeText(url).then(function() {
    const orig = btn.textContent;
    btn.textContent = '¡Copiado!';
    setTimeout(function() { btn.textContent = orig; }, 2000);
  });
}

/* ══════════════════════════════════════════
   LISTAS: PENDIENTES / COMPLETADOS
══════════════════════════════════════════ */
async function cargarLista(tipo) {
  const elId = tipo === 'pendientes' ? 'listaPendientes' : 'listaCompletados';
  const c    = document.getElementById(elId);
  c.innerHTML = '<div class="loading-state">Cargando...</div>';
  try {
    const data = await apiGet('/api/documentos');
    const docs = (data.documentos || []).filter(function(d) {
      return tipo === 'pendientes' ? !d.completado : d.completado;
    });
    renderLista(c, docs, tipo);
  } catch(err) {
    c.innerHTML = '<div class="empty-state">Error al cargar documentos</div>';
  }
}

function renderLista(container, docs, tipo) {
  if (!docs.length) {
    const msg = tipo === 'pendientes'
      ? 'No hay documentos pendientes'
      : 'No hay documentos completados aún';
    container.innerHTML = '<div class="empty-state">' + msg + '</div>';
    return;
  }

  container.innerHTML = docs.map(function(doc) {
    const firmantes = doc.firmantes || [];
    const firmados  = firmantes.filter(function(f){ return f.signed; }).length;
    const total     = firmantes.length;
    const fecha     = formatFecha(doc.created_at);
    const firma_txt = firmados + '/' + total + ' firma' + (total !== 1 ? 's' : '');

    if (tipo === 'pendientes') {
      return `
        <div class="doc-row" id="docRow_${doc.id}">
          <div class="doc-icon-box">📄</div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:.87rem;">${escHtml(doc.title || 'Sin título')}</div>
            <div style="font-size:.74rem;color:var(--text-secondary);margin-top:1px;">${fecha} · ${firma_txt}</div>
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
            <div style="font-size:.74rem;color:var(--text-secondary);margin-top:1px;">${fecha} · ${firma_txt}</div>
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
    await apiDelete('/api/documento/' + id);
    showToast('Documento eliminado');
    cargarLista(tipo);
    if (window._estadoDocId === id) cerrarPanelEstado();
  } catch(e) {
    showToast(e.message || 'Error al eliminar', 'error');
  }
}

/* ══════════════════════════════════════════
   PANEL ESTADO INLINE
══════════════════════════════════════════ */
async function verEstadoDoc(docId, titulo) {
  window._estadoDocId = docId;
  document.getElementById('estadoTitulo').textContent = titulo || '';
  document.getElementById('panelEstado').style.display = 'block';
  document.getElementById('panelEstado').scrollIntoView({ behavior: 'smooth', block: 'start' });

  await actualizarEstado(docId);

  // Auto-refresh cada 15 seg
  if (FIRMA.estadoTimer) clearInterval(FIRMA.estadoTimer);
  FIRMA.estadoTimer = setInterval(function() {
    if (window._estadoDocId) actualizarEstado(window._estadoDocId);
  }, 15000);
}

async function actualizarEstado(docId) {
  try {
    const data = await apiGet('/api/documento/' + docId + '/estado');
    renderEstadoPanel(data);
  } catch(e) {
    showToast('Error al actualizar el estado', 'error');
  }
}

function renderEstadoPanel(data) {
  const firmantes = data.firmantes || [];
  const firmados  = firmantes.filter(function(f){ return f.signed; }).length;
  const total     = firmantes.length;
  const todos     = firmados === total;

  // Badge progreso
  const badge = document.getElementById('estadoBadge');
  badge.textContent = firmados + '/' + total + ' firmados';
  badge.className   = todos ? 'badge-done' : 'badge-pending';

  document.getElementById('estadoProgresoText').textContent =
    firmados + ' de ' + total + ' firmante' + (total !== 1 ? 's' : '') + ' completaron la firma';

  // Lista firmantes
  const box = document.getElementById('estadoFirmantesBox');
  box.innerHTML = firmantes.map(function(f) {
    const pendiente = !f.signed;
    const bg  = pendiente ? 'var(--cream)'      : 'var(--success-bg)';
    const bdr = pendiente ? 'var(--border)'     : '#A7F3D0';
    const est = pendiente
      ? '<span style="font-size:.73rem;color:var(--text-secondary);">⏳ Pendiente de firma</span>'
      : '<span style="font-size:.73rem;color:#065F46;">✅ Firmado</span>';

    const linkPart = (pendiente && f.sign_url)
      ? `<div style="display:flex;align-items:center;gap:8px;margin-top:8px;">
           <input type="text" class="input-base" value="${escHtml(f.sign_url)}" readonly
                  style="font-size:.71rem;font-family:monospace;flex:1;height:28px;color:var(--text-secondary);">
           <button class="btn-xs" style="flex-shrink:0;" onclick="copiarLink('${escHtml(f.sign_url)}',this)">Copiar</button>
         </div>`
      : '';

    const avatarStyle = f.signed ? 'background:#065F46;' : '';
    const inicial = (f.name || f.email || '?')[0].toUpperCase();

    return `
      <div style="background:${bg};border:1px solid ${bdr};border-radius:var(--radius-md);padding:12px 14px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="f-avatar" style="${avatarStyle}">${escHtml(inicial)}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:.85rem;">${escHtml(f.name || '(sin nombre)')}</div>
            <div style="font-size:.75rem;color:var(--text-secondary);">${escHtml(f.email || '')}</div>
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
  window.open('/api/documento/' + docId + '/certificado', '_blank');
}
