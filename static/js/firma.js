/**
 * firma.js — Firma Electrónica
 */

/* ══════════════════════════════════════════
   ESTADO GLOBAL
══════════════════════════════════════════ */
const FIRMA = {
  firmantes:       [],
  pdfFile:         null,
  pdfBase64:       null,
  pdfDoc:          null,
  zonaFirmanteIdx: null,
  zonaPage:        1,
  zonaTotalPages:  1,
  zonaRect:        null,
  estadoTimer:     null,
};

/* ══════════════════════════════════════════
   INIT
══════════════════════════════════════════ */
function initFirma() {
  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  if (typeof RX !== 'undefined' && RX.user) {
    const n = document.getElementById('docOrgNombre');
    if (n) n.value = RX.user.name || '';
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
  // Blanquear formulario al salir del tab nueva
  if (tab !== 'nueva') resetFormNueva();
}

/* ══════════════════════════════════════════
   PDF — CARGA
══════════════════════════════════════════ */
function onPdfDrop(e) {
  e.preventDefault();
  document.getElementById('pdfDropZone').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type === 'application/pdf') setPdfFile(file);
  else showToast('Solo se aceptan archivos PDF', 'error');
}

function onPdfSelected(input) {
  if (input.files[0]) setPdfFile(input.files[0]);
}

function setPdfFile(file) {
  FIRMA.pdfFile = file;
  const short = file.name.length > 38 ? file.name.slice(0, 35) + '...' : file.name;
  document.getElementById('pdfFileLabel').textContent = short;
  document.getElementById('pdfBadgeName').textContent = file.name;
  document.getElementById('pdfBadge').style.display   = 'flex';

  const reader = new FileReader();
  reader.onload = function(ev) {
    FIRMA.pdfBase64 = ev.target.result.split(',')[1];
    const bytes = Uint8Array.from(atob(FIRMA.pdfBase64), c => c.charCodeAt(0));
    pdfjsLib.getDocument({ data: bytes }).promise.then(function(doc) {
      FIRMA.pdfDoc = doc;
      renderFirmantes();
      showToast('PDF cargado — podés asignar zonas de firma ✓', 'success');
    }).catch(function(err) {
      console.error('[PDFJS]', err);
      showToast('Error al leer el PDF', 'error');
    });
  };
  reader.readAsDataURL(file);
}

/* ══════════════════════════════════════════
   HELPERS
══════════════════════════════════════════ */
function esEmailValido(email) {
  // Validación estricta: debe tener algo@algo.algo
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

/* ══════════════════════════════════════════
   FIRMANTES
══════════════════════════════════════════ */
function agregarFirmante() {
  const nombre = document.getElementById('nuevoNombre').value.trim();
  const email  = document.getElementById('nuevoEmail').value.trim();
  const errEl  = document.getElementById('emailFirmanteError');

  // --- Validaciones ---
  if (!email) {
    errEl.textContent   = '⚠️ El email es obligatorio para enviar el link de firma.';
    errEl.style.display = 'block';
    document.getElementById('nuevoEmail').focus();
    return;
  }
  // Validación estricta: debe tener texto@texto.texto (mínimo 2 chars de dominio)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!emailRegex.test(email)) {
    errEl.textContent   = '⚠️ Ingresá un email válido, por ej: nombre@gmail.com';
    errEl.style.display = 'block';
    document.getElementById('nuevoEmail').focus();
    return;
  }
  const yaExiste = FIRMA.firmantes.some(f => f.email.toLowerCase() === email.toLowerCase());
  if (yaExiste) {
    errEl.textContent   = '⚠️ Ese email ya fue agregado como firmante.';
    errEl.style.display = 'block';
    document.getElementById('nuevoEmail').focus();
    return;
  }

  errEl.style.display = 'none';
  FIRMA.firmantes.push({ name: nombre, email: email, sign_zone: null });
  document.getElementById('nuevoNombre').value = '';
  document.getElementById('nuevoEmail').value  = '';
  renderFirmantes();
  document.getElementById('nuevoNombre').focus();
}

// Limpiar error al escribir en el email
document.addEventListener('DOMContentLoaded', function() {
  const emailInput = document.getElementById('nuevoEmail');
  if (emailInput) {
    emailInput.addEventListener('input', function() {
      document.getElementById('emailFirmanteError').style.display = 'none';
    });
  }
});

function quitarFirmante(idx) {
  FIRMA.firmantes.splice(idx, 1);
  renderFirmantes();
}

function renderFirmantes() {
  const c = document.getElementById('firmantesContainer');
  if (!FIRMA.firmantes.length) { c.innerHTML = ''; return; }

  c.innerHTML = FIRMA.firmantes.map(function(f, i) {
    const inicial   = (f.name || f.email || '?')[0].toUpperCase();
    const hasPdf    = !!FIRMA.pdfDoc;
    const tieneZona = !!f.sign_zone;

    let chipHtml;
    if (!hasPdf) {
      chipHtml = `<span class="zona-chip disabled-chip" title="Primero cargá un PDF">📍 Asignar zona</span>`;
    } else if (tieneZona) {
      const pag = 'Pág ' + f.sign_zone.page;
      chipHtml  = `<button class="zona-chip asignada" onclick="abrirZonaModal(${i})" title="Zona en ${pag} — clic para editar">📍 ${pag} ✓</button>`;
    } else {
      chipHtml = `<button class="zona-chip" onclick="abrirZonaModal(${i})">📍 Asignar zona</button>`;
    }

    return `
      <div class="firmante-row">
        <div class="f-avatar">${escHtml(inicial)}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;font-size:.85rem;">${escHtml(f.name || '(sin nombre)')}</div>
          <div style="font-size:.76rem;color:var(--text-secondary);">${escHtml(f.email)}</div>
        </div>
        ${chipHtml}
        <button class="btn-icon-sm danger" onclick="quitarFirmante(${i})" title="Quitar" style="flex-shrink:0;">✕</button>
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

  FIRMA.zonaRect       = f.sign_zone ? Object.assign({}, f.sign_zone) : null;
  FIRMA.zonaPage       = (f.sign_zone && f.sign_zone.page) ? f.sign_zone.page : 1;
  FIRMA.zonaTotalPages = FIRMA.pdfDoc.numPages;

  document.getElementById('zonaModalFirmante').textContent =
    'Firmante: ' + (f.name || f.email);

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

// Colores por firmante (zona actual = azul sólido, otros = colores suaves)
const ZONA_COLORS = ['#1B3FE4','#E4461B','#1BE48A','#E4C21B','#9B1BE4','#1BE4D4'];

async function zonaRenderPage(num) {
  FIRMA.zonaPage = num;
  const page     = await FIRMA.pdfDoc.getPage(num);
  const vp1      = page.getViewport({ scale: 1 });
  const scale    = Math.min(680 / vp1.width, 1.5);
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
    document.getElementById('zonaPageInfo').textContent = 'Pág ' + num + ' / ' + FIRMA.zonaTotalPages;
  } else {
    navBar.style.display = 'none';
  }

  // Dibujar TODAS las zonas ya asignadas en esta página (con su color)
  // El firmante actual (FIRMA.zonaFirmanteIdx) usa FIRMA.zonaRect (puede estar editando)
  zonaRedibujarTodo();

  // Configurar interacción del overlay (sin clonar — clonar borra el canvas)
  setupZonaOverlay(overlay);
}

// Dibuja todas las zonas en el overlay, respetando la página actual
function zonaRedibujarTodo() {
  const overlay = document.getElementById('zonaOverlay');
  if (!overlay) return;
  const ctx = overlay.getContext('2d');
  ctx.clearRect(0, 0, overlay.width, overlay.height);

  const currentIdx = FIRMA.zonaFirmanteIdx;

  // Primero dibujar las zonas de otros firmantes (grisadas/con su color)
  FIRMA.firmantes.forEach(function(f, i) {
    if (i === currentIdx) return; // el actual se dibuja al final, encima
    const zona = f.sign_zone;
    if (!zona || zona.page !== FIRMA.zonaPage) return;
    // Escalar coords si el canvas tiene distinto tamaño al guardado
    const sx = overlay.width  / (zona.canvasW || overlay.width);
    const sy = overlay.height / (zona.canvasH || overlay.height);
    const color = ZONA_COLORS[i % ZONA_COLORS.length];
    dibujarZonaRect(ctx, zona.x * sx, zona.y * sy, zona.w * sx, zona.h * sy, color, 0.35, f.name || f.email, true);
  });

  // Luego la zona del firmante actual (por encima, color azul sólido)
  if (FIRMA.zonaRect && FIRMA.zonaRect.page === FIRMA.zonaPage) {
    const z  = FIRMA.zonaRect;
    const sx = overlay.width  / (z.canvasW || overlay.width);
    const sy = overlay.height / (z.canvasH || overlay.height);
    const f  = FIRMA.firmantes[currentIdx];
    const color = ZONA_COLORS[currentIdx % ZONA_COLORS.length];
    dibujarZonaRect(ctx, z.x * sx, z.y * sy, z.w * sx, z.h * sy, color, 0.18, f ? (f.name || f.email) : '', false);
  }
}

// AbortController para limpiar listeners sin clonar el canvas
let _zonaAbort = null;

function setupZonaOverlay(overlay) {
  // Cancelar listeners anteriores
  if (_zonaAbort) _zonaAbort.abort();
  _zonaAbort = new AbortController();
  const sig = { signal: _zonaAbort.signal };

  let drawing = false, startX = 0, startY = 0;

  function getPosFromEvent(e) {
    const src = (e.touches && e.touches.length) ? e.touches[0]
      : (e.changedTouches && e.changedTouches.length ? e.changedTouches[0] : e);
    const rect   = overlay.getBoundingClientRect();
    const scaleX = overlay.width  / rect.width;
    const scaleY = overlay.height / rect.height;
    return [
      (src.clientX - rect.left) * scaleX,
      (src.clientY - rect.top)  * scaleY,
    ];
  }

  overlay.addEventListener('mousedown', function(e) {
    e.preventDefault();
    drawing = true;
    [startX, startY] = getPosFromEvent(e);
  }, sig);

  overlay.addEventListener('mousemove', function(e) {
    if (!drawing) return;
    const [cx, cy] = getPosFromEvent(e);
    // Redibujar todas las otras zonas + la que se está arrastrando
    zonaRedibujarTodo();
    const ctx = overlay.getContext('2d');
    const color = ZONA_COLORS[FIRMA.zonaFirmanteIdx % ZONA_COLORS.length];
    const f = FIRMA.firmantes[FIRMA.zonaFirmanteIdx];
    dibujarZonaRect(ctx, startX, startY, cx - startX, cy - startY, color, 0.18, f ? (f.name || f.email) : '', false);
  }, sig);

  overlay.addEventListener('mouseup', function(e) {
    if (!drawing) return;
    drawing = false;
    const [ex, ey] = getPosFromEvent(e);
    const w = ex - startX, h = ey - startY;
    if (Math.abs(w) < 10 || Math.abs(h) < 10) return;
    FIRMA.zonaRect = {
      x: Math.min(startX, ex), y: Math.min(startY, ey),
      w: Math.abs(w),          h: Math.abs(h),
      page:    FIRMA.zonaPage,
      canvasW: overlay.width,
      canvasH: overlay.height,
    };
    zonaRedibujarTodo(); // redibujar con la zona final guardada
  }, sig);

  overlay.addEventListener('mouseleave', function() { drawing = false; }, sig);

  overlay.addEventListener('touchstart', function(e) {
    e.preventDefault();
    drawing = true;
    [startX, startY] = getPosFromEvent(e);
  }, { ...sig, passive: false });

  overlay.addEventListener('touchmove', function(e) {
    e.preventDefault();
    if (!drawing) return;
    const [cx, cy] = getPosFromEvent(e);
    zonaRedibujarTodo();
    const ctx = overlay.getContext('2d');
    const color = ZONA_COLORS[FIRMA.zonaFirmanteIdx % ZONA_COLORS.length];
    const f = FIRMA.firmantes[FIRMA.zonaFirmanteIdx];
    dibujarZonaRect(ctx, startX, startY, cx - startX, cy - startY, color, 0.18, f ? (f.name || f.email) : '', false);
  }, { ...sig, passive: false });

  overlay.addEventListener('touchend', function(e) {
    if (!drawing) return;
    drawing = false;
    const [ex, ey] = getPosFromEvent(e);
    const w = ex - startX, h = ey - startY;
    if (Math.abs(w) < 10 || Math.abs(h) < 10) return;
    FIRMA.zonaRect = {
      x: Math.min(startX, ex), y: Math.min(startY, ey),
      w: Math.abs(w),          h: Math.abs(h),
      page:    FIRMA.zonaPage,
      canvasW: overlay.width,
      canvasH: overlay.height,
    };
    zonaRedibujarTodo();
  }, { ...sig, passive: false });
}

function dibujarZonaRect(ctx, x, y, w, h, color, fillAlpha, label, isOther) {
  color     = color     || '#1B3FE4';
  fillAlpha = fillAlpha !== undefined ? fillAlpha : 0.15;
  ctx.save();
  ctx.setLineDash(isOther ? [4, 4] : [6, 3]);
  ctx.strokeStyle = color;
  ctx.lineWidth   = isOther ? 1.5 : 2.5;
  // Relleno semitransparente
  ctx.fillStyle = color.replace('#', 'rgba(').replace(/(..)(..)(..)/, function(_, r, g, b) {
    return parseInt(r,16)+','+parseInt(g,16)+','+parseInt(b,16);
  }) + ',' + fillAlpha + ')';
  // Fallback sencillo para el fill
  ctx.globalAlpha = fillAlpha;
  ctx.fillStyle   = color;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
  ctx.strokeRect(x, y, w, h);
  // Etiqueta con el nombre del firmante
  if (label) {
    ctx.setLineDash([]);
    ctx.font         = 'bold ' + (isOther ? '11px' : '12px') + ' sans-serif';
    ctx.fillStyle    = color;
    ctx.globalAlpha  = isOther ? 0.7 : 1;
    const labelX = x + 4;
    const labelY = y < 18 ? y + Math.abs(h) - 4 : y - 4;
    // Fondo blanco detrás del texto
    const tw = ctx.measureText(label).width;
    ctx.globalAlpha = 0.75;
    ctx.fillStyle   = '#ffffff';
    ctx.fillRect(labelX - 2, labelY - 12, tw + 6, 16);
    ctx.globalAlpha = isOther ? 0.8 : 1;
    ctx.fillStyle   = color;
    ctx.fillText(label, labelX, labelY);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function limpiarZonaOverlay() {
  FIRMA.zonaRect = null;
  zonaRedibujarTodo(); // redibuja otras zonas, borra la del firmante actual
}

async function zonaChangePage(dir) {
  const np = FIRMA.zonaPage + dir;
  if (np < 1 || np > FIRMA.zonaTotalPages) return;
  await zonaRenderPage(np);
}

function confirmarZona() {
  if (!FIRMA.zonaRect) { showToast('Dibujá una zona antes de confirmar', 'error'); return; }
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
  btn.disabled = true; btn.textContent = '⏳ Enviando...';

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

    showToast('Documento enviado a ' + FIRMA.firmantes.length + ' firmante(s) ✓', 'success');
    resetFormNueva();
    // Ir a pendientes y mostrar estado del doc recién creado
    const docId    = data.doc_id;
    const docTitle = document.getElementById('docTitulo')?.value || '';
    switchFirmaTab('pendientes', document.getElementById('tabBtnPendientes'));
    // Abrir estado del doc luego de que cargue la lista
    setTimeout(function() {
      abrirEstadoModal(docId, docTitle);
    }, 600);

  } catch(e) {
    console.error(e);
    showToast('Error al enviar el documento', 'error');
  } finally {
    btn.disabled = false; btn.textContent = '🚀 Enviar para firma';
  }
}

/* ══════════════════════════════════════════
   RESET FORMULARIO NUEVA FIRMA
══════════════════════════════════════════ */
function resetFormNueva() {
  const t = document.getElementById('docTitulo');
  if (t) t.value = '';
  const p = document.getElementById('docPdf');
  if (p) p.value = '';
  const lbl = document.getElementById('pdfFileLabel');
  if (lbl) lbl.textContent = '';
  const badge = document.getElementById('pdfBadge');
  if (badge) badge.style.display = 'none';
  const res = document.getElementById('resultEnvio');
  if (res) res.style.display = 'none';
  FIRMA.firmantes = [];
  FIRMA.pdfFile   = null;
  FIRMA.pdfBase64 = null;
  FIRMA.pdfDoc    = null;
  renderFirmantes();
}

function mostrarResultadoEnvio(data) {
  const box = document.getElementById('resultEnvio');
  const lc  = document.getElementById('linksContainer');
  box.style.display = 'block';

  // Guardar links en un objeto global indexado para copiar sin escaping
  window._firmaLinks = {};
  (data.firmantes || []).forEach(function(f, i) {
    window._firmaLinks['link_' + i] = f.sign_url || '';
  });

  lc.innerHTML = (data.firmantes || []).map(function(f, i) {
    const url = f.sign_url || '';
    return `
      <div>
        <div style="font-weight:600;font-size:.85rem;color:#065F46;">${escHtml(f.name || f.email)}</div>
        <div style="font-size:.76rem;color:#047857;margin-bottom:6px;">${escHtml(f.email)}</div>
        <div style="display:flex;align-items:center;gap:8px;">
          <input type="text" class="input-base" id="linkEnvio_${i}" value="${escHtml(url)}" readonly
                 style="font-size:.72rem;font-family:monospace;flex:1;height:32px;color:var(--text-secondary);">
          <button class="btn-xs" style="background:#065F46;color:#fff;border:none;flex-shrink:0;white-space:nowrap;"
                  onclick="copiarLinkById('linkEnvio_${i}',this)">Copiar</button>
        </div>
      </div>`;
  }).join('');

  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ══════════════════════════════════════════
   COPY HELPERS — sin pasar URLs en onclick
══════════════════════════════════════════ */
function copiarLinkById(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const url = input.value;
  navigator.clipboard.writeText(url).then(function() {
    const orig = btn.textContent;
    btn.textContent = '¡Copiado!';
    setTimeout(function() { btn.textContent = orig; }, 2000);
  }).catch(function() {
    // Fallback para móviles
    input.select();
    document.execCommand('copy');
    const orig = btn.textContent;
    btn.textContent = '¡Copiado!';
    setTimeout(function() { btn.textContent = orig; }, 2000);
  });
}

function copiarLinkByIdx(idx, btn) {
  const urls = window._estadoLinks || {};
  const url  = urls['s_' + idx] || '';
  if (!url) return;
  navigator.clipboard.writeText(url).then(function() {
    const orig = btn.textContent;
    btn.textContent = '¡Copiado!';
    setTimeout(function() { btn.textContent = orig; }, 2000);
  }).catch(function() {
    const orig = btn.textContent;
    btn.textContent = '¡Copiado!';
    setTimeout(function() { btn.textContent = orig; }, 2000);
  });
}

/* ══════════════════════════════════════════
   LISTAS
══════════════════════════════════════════ */
async function cargarLista(tipo) {
  const elId = tipo === 'pendientes' ? 'listaPendientes' : 'listaCompletados';
  const c    = document.getElementById(elId);
  c.innerHTML = '<div class="loading-state">Cargando...</div>';
  try {
    const data = await apiGet('/api/documentos');
    const docs = (data.documentos || []).filter(d =>
      tipo === 'pendientes' ? !d.completado : d.completado
    );
    renderLista(c, docs, tipo);
  } catch(err) {
    c.innerHTML = '<div class="empty-state">Error al cargar documentos</div>';
  }
}

function renderLista(container, docs, tipo) {
  if (!docs.length) {
    container.innerHTML = '<div class="empty-state">' +
      (tipo === 'pendientes' ? 'No hay documentos pendientes' : 'No hay documentos completados aún') +
      '</div>';
    return;
  }

  container.innerHTML = docs.map(function(doc) {
    const firmantes = doc.firmantes || [];
    const firmados  = firmantes.filter(f => f.signed).length;
    const total     = firmantes.length;
    const fecha     = formatFecha(doc.created_at);
    const firma_txt = firmados + '/' + total + ' firma' + (total !== 1 ? 's' : '');
    const tituloSafe = escHtml(doc.title || 'Sin título');

    if (tipo === 'pendientes') {
      return `
        <div class="doc-row" id="docRow_${doc.id}">
          <div class="doc-icon-box">📄</div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:.87rem;">${tituloSafe}</div>
            <div style="font-size:.74rem;color:var(--text-secondary);margin-top:1px;">${fecha} · ${firma_txt}</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
            <span class="badge-pending">Pendiente</span>
            <button class="btn-xs" data-docid="${doc.id}" data-titulo="${tituloSafe}"
                    onclick="abrirEstadoModal(this.dataset.docid, this.dataset.titulo)">Ver</button>
            <button class="btn-icon-sm danger"
                    onclick="eliminarDoc('${doc.id}','pendientes')" title="Eliminar">🗑</button>
          </div>
        </div>`;
    } else {
      return `
        <div class="doc-row" id="docRow_${doc.id}">
          <div class="doc-icon-box" style="background:var(--success-bg);color:#065F46;">✅</div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:.87rem;">${tituloSafe}</div>
            <div style="font-size:.74rem;color:var(--text-secondary);margin-top:1px;">${fecha} · ${firma_txt}</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
            <span class="badge-done">Completado</span>
            <a href="/api/documento/${doc.id}/certificado" class="btn-xs" target="_blank">⬇️ PDF</a>
            <button class="btn-icon-sm danger"
                    onclick="eliminarDoc('${doc.id}','completados')" title="Eliminar">🗑</button>
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
    if (window._estadoDocId === id) cerrarEstadoModal();
  } catch(e) { showToast(e.message || 'Error al eliminar', 'error'); }
}

/* ══════════════════════════════════════════
   MODAL ESTADO — como ventana emergente
══════════════════════════════════════════ */
async function abrirEstadoModal(docId, titulo) {
  window._estadoDocId = docId;
  window._estadoLinks = {};

  document.getElementById('estadoModalTitulo').textContent = titulo || '';
  document.getElementById('estadoModal').style.display = 'flex';
  document.body.style.overflow = 'hidden';

  // Mostrar loading mientras carga
  document.getElementById('estadoModalBadge').textContent = '...';
  document.getElementById('estadoModalProgresoText').textContent = 'Cargando...';
  document.getElementById('estadoModalFirmantesBox').innerHTML =
    '<div class="loading-state" style="padding:16px 0;">Cargando firmantes...</div>';

  await actualizarEstado(docId);

  if (FIRMA.estadoTimer) clearInterval(FIRMA.estadoTimer);
  FIRMA.estadoTimer = setInterval(function() {
    if (window._estadoDocId) actualizarEstado(window._estadoDocId);
  }, 15000);
}

function cerrarEstadoModal() {
  document.getElementById('estadoModal').style.display = 'none';
  document.body.style.overflow = '';
  if (FIRMA.estadoTimer) { clearInterval(FIRMA.estadoTimer); FIRMA.estadoTimer = null; }
  window._estadoDocId = null;
  window._estadoLinks = {};
}

async function actualizarEstado(docId) {
  try {
    const data = await apiGet('/api/documento/' + docId + '/estado');
    renderEstadoModal(data);
  } catch(e) {
    showToast('Error al actualizar el estado', 'error');
  }
}

function renderEstadoModal(data) {
  const firmantes = data.firmantes || [];
  const firmados  = firmantes.filter(f => f.signed).length;
  const total     = firmantes.length;
  const todos     = firmados === total;

  // Badge progreso
  const badge = document.getElementById('estadoModalBadge');
  badge.textContent = firmados + '/' + total + ' firmados';
  badge.className   = todos ? 'badge-done' : 'badge-pending';

  document.getElementById('estadoModalProgresoText').textContent =
    firmados + ' de ' + total + ' firmante' + (total !== 1 ? 's' : '') + ' completaron la firma';

  // Construir HTML sin ningún onclick inline — usamos data-idx para luego bindear
  const box = document.getElementById('estadoModalFirmantesBox');
  box.innerHTML = firmantes.map(function(f, i) {
    const pendiente   = !f.signed;
    const bg          = pendiente ? 'var(--cream)'  : 'var(--success-bg)';
    const bdr         = pendiente ? 'var(--border)' : '#A7F3D0';
    const avatarStyle = f.signed  ? 'background:#065F46;' : '';
    const inicial     = (f.name || f.email || '?')[0].toUpperCase();
    const est = pendiente
      ? '<span style="font-size:.73rem;color:var(--text-secondary);">⏳ Pendiente de firma</span>'
      : '<span style="font-size:.73rem;color:#065F46;">✅ Firmado</span>';

    const linkPart = (pendiente && f.sign_url)
      ? `<div style="display:flex;align-items:center;gap:8px;margin-top:8px;">
           <input type="text" class="input-base" id="eLink${i}" value="${escHtml(f.sign_url)}" readonly
                  style="font-size:.71rem;font-family:monospace;flex:1;height:28px;color:var(--text-secondary);">
           <button class="btn-xs" data-linkidx="${i}" style="flex-shrink:0;">Copiar</button>
         </div>`
      : '';

    return `
      <div style="background:${bg};border:1px solid ${bdr};border-radius:var(--radius-md);padding:12px 14px;margin-bottom:6px;">
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

  // Bindear botones Copiar con addEventListener (seguro, sin problemas de escaping)
  box.querySelectorAll('[data-linkidx]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      const idx   = btn.getAttribute('data-linkidx');
      const input = document.getElementById('eLink' + idx);
      if (!input) return;
      navigator.clipboard.writeText(input.value).then(function() {
        const orig = btn.textContent;
        btn.textContent = '¡Copiado!';
        setTimeout(function() { btn.textContent = orig; }, 2000);
      }).catch(function() {
        // Fallback para navegadores sin clipboard API
        input.select(); input.setSelectionRange(0, 9999);
        try { document.execCommand('copy'); } catch(e) {}
        const orig = btn.textContent;
        btn.textContent = '¡Copiado!';
        setTimeout(function() { btn.textContent = orig; }, 2000);
      });
    });
  });
}

function descargarPDF(docId) {
  if (!docId) return;
  window.open('/api/documento/' + docId + '/certificado', '_blank');
}

/* ══════════════════════════════════════════
   CERRAR MODALES AL HACER CLICK EN BACKDROP
══════════════════════════════════════════ */
document.addEventListener('click', function(e) {
  if (e.target === document.getElementById('zonaModal'))   cerrarZonaModal();
  if (e.target === document.getElementById('estadoModal')) cerrarEstadoModal();
});
