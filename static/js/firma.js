/**
 * firma.js — Nueva firma / Pendientes / Completados
 */
const FIRMA = {
  firmantes: [],      // firmantes del form actual
  lastDocId: null,    // doc_id del último envío
  lastFirmantes: [],  // firmantes con links del último envío
};

/* ─────────────────────────────────────────
   INIT
───────────────────────────────────────── */
async function initFirma() {
  if (RX.user) {
    document.getElementById('docOrgNombre').value = RX.user.name || '';
    document.getElementById('docOrgEmail').value  = RX.user.email || '';
  }
  const params = new URLSearchParams(location.search);
  if (params.get('doc')) {
    switchFirmaTab('pendientes', document.querySelectorAll('.tab-btn')[1]);
  }
}

/* ─────────────────────────────────────────
   TABS
───────────────────────────────────────── */
function switchFirmaTab(tab, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('tabNueva').style.display       = tab === 'nueva'       ? '' : 'none';
  document.getElementById('tabPendientes').style.display  = tab === 'pendientes'  ? '' : 'none';
  document.getElementById('tabCompletados').style.display = tab === 'completados' ? '' : 'none';
  if (tab === 'pendientes')  cargarLista('pendientes');
  if (tab === 'completados') cargarLista('completados');
}

/* ─────────────────────────────────────────
   PDF
───────────────────────────────────────── */
function handlePdfDrop(e) {
  e.preventDefault();
  document.getElementById('pdfDropZone').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type === 'application/pdf') setPdfFile(file);
}

function onPdfSelected(input) {
  if (input.files[0]) setPdfFile(input.files[0]);
}

function setPdfFile(file) {
  // Mostrar nombre en texto corto
  const short = file.name.length > 30 ? file.name.substring(0, 27) + '...' : file.name;
  document.getElementById('pdfFileName').textContent = short;

  const badge = document.getElementById('pdfSelectedBadge');
  document.getElementById('pdfSelectedName').textContent = file.name;
  badge.style.display = 'flex';
}

/* ─────────────────────────────────────────
   FIRMANTES
───────────────────────────────────────── */
function agregarFirmante() {
  const nombre = document.getElementById('nuevoNombre').value.trim();
  const email  = document.getElementById('nuevoEmail').value.trim();
  if (!nombre && !email) { showToast('Ingresá nombre o email del firmante', 'error'); return; }

  FIRMA.firmantes.push({ name: nombre, email });
  document.getElementById('nuevoNombre').value = '';
  document.getElementById('nuevoEmail').value  = '';
  renderFirmantes();
}

function quitarFirmante(idx) {
  FIRMA.firmantes.splice(idx, 1);
  renderFirmantes();
}

function renderFirmantes() {
  const c = document.getElementById('firmantesContainer');
  if (FIRMA.firmantes.length === 0) { c.innerHTML = ''; return; }
  c.innerHTML = FIRMA.firmantes.map((f, i) => {
    const inicial = (f.name || f.email || '?')[0].toUpperCase();
    return `
      <div class="firmante-item">
        <div class="firmante-avatar">${inicial}</div>
        <div class="firmante-info">
          <div class="fn">${escHtml(f.name || '(sin nombre)')}</div>
          <div class="fe">${escHtml(f.email || '')}</div>
        </div>
        <div class="zona-btn">📍 Asignar zona</div>
        <button class="btn-icon-sm danger" onclick="quitarFirmante(${i})" title="Quitar">✕</button>
      </div>`;
  }).join('');
}

/* ─────────────────────────────────────────
   ENVIAR
───────────────────────────────────────── */
async function enviarDocumento() {
  const titulo = document.getElementById('docTitulo').value.trim();
  if (!titulo) { showToast('El título es requerido', 'error'); return; }
  if (FIRMA.firmantes.length === 0) { showToast('Agregá al menos un firmante', 'error'); return; }

  const fd = new FormData();
  fd.append('title', titulo);
  fd.append('organizer_name',  document.getElementById('docOrgNombre').value);
  fd.append('organizer_email', document.getElementById('docOrgEmail').value);
  fd.append('firmantes', JSON.stringify(FIRMA.firmantes));
  const pdf = document.getElementById('docPdf').files[0];
  if (pdf) fd.append('pdf_file', pdf);

  const btn = document.getElementById('btnEnviar');
  btn.disabled = true; btn.textContent = 'Enviando...';

  try {
    const res  = await fetch('/api/documento', { method: 'POST', body: fd });
    if (!res.ok) throw new Error('Error al enviar');
    const data = await res.json();

    FIRMA.lastDocId     = data.doc_id;
    FIRMA.lastFirmantes = data.firmantes || [];

    // Mostrar resultado
    mostrarResultado(data);
    showToast(`Documento enviado a ${FIRMA.firmantes.length} firmante(s) ✓`, 'success');

    // Reset form (pero mantener organizer)
    document.getElementById('docTitulo').value = '';
    document.getElementById('docPdf').value    = '';
    document.getElementById('pdfFileName').textContent = '';
    document.getElementById('pdfSelectedBadge').style.display = 'none';
    FIRMA.firmantes = [];
    renderFirmantes();

  } catch (e) {
    showToast('Error al enviar el documento', 'error');
  } finally {
    btn.disabled = false; btn.textContent = '🚀 Enviar para firma';
  }
}

function mostrarResultado(data) {
  const box = document.getElementById('resultadoEnvio');
  const lc  = document.getElementById('linksContainer');
  box.style.display = 'block';

  lc.innerHTML = (data.firmantes || []).map(f => `
    <div>
      <div style="font-weight:600;font-size:0.85rem;color:#065F46;">${escHtml(f.name || f.email)}</div>
      <div style="font-size:0.75rem;color:#047857;margin-bottom:6px;">${escHtml(f.email)}</div>
      <div style="display:flex;align-items:center;gap:8px;">
        <input type="text" class="input-base" value="${escHtml(f.sign_url)}" readonly
               style="font-size:0.73rem;font-family:monospace;flex:1;height:32px;color:var(--text-secondary);">
        <button class="btn-xs" style="background:#065F46;color:#fff;border:none;flex-shrink:0;"
                onclick="copiarLink('${escHtml(f.sign_url)}', this)">Copiar</button>
      </div>
    </div>`).join('');

  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function copiarLink(url, btn) {
  navigator.clipboard.writeText(url).then(() => {
    const orig = btn.textContent;
    btn.textContent = '¡Copiado!';
    setTimeout(() => btn.textContent = orig, 2000);
  });
}

function verEstadoDoc() {
  if (FIRMA.lastDocId) {
    switchFirmaTab('pendientes', document.querySelectorAll('.tab-btn')[1]);
  }
}

/* ─────────────────────────────────────────
   LISTAS (Pendientes / Completados)
───────────────────────────────────────── */
async function cargarLista(tipo) {
  const containerId = tipo === 'pendientes' ? 'listaPendientes' : 'listaCompletados';
  const container   = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = `<div class="loading-state">Cargando...</div>`;
  try {
    const data = await apiGet('/api/documentos');
    const docs = (data.documentos || []).filter(d =>
      tipo === 'pendientes'
        ? !d.completado
        : d.completado
    );
    renderLista(container, docs, tipo);
  } catch (e) {
    container.innerHTML = `<div class="empty-state">Error al cargar documentos</div>`;
  }
}

function renderLista(container, docs, tipo) {
  if (docs.length === 0) {
    const msg = tipo === 'pendientes' ? 'No hay documentos pendientes' : 'No hay documentos completados';
    container.innerHTML = `<div class="empty-state">${msg}</div>`;
    return;
  }

  container.innerHTML = docs.map(doc => {
    const firmantes = doc.firmantes || [];
    const firmados  = firmantes.filter(f => f.signed).length;
    const total     = firmantes.length;
    const fecha     = formatFecha(doc.created_at);
    const badgeClass = doc.completado ? 'badge-done' : 'badge-pending';
    const badgeText  = doc.completado ? 'Completado' : 'Pendiente';

    const acciones = doc.completado
      ? `<a href="/api/documento/${doc.id}/certificado" class="btn-xs" target="_blank">⬇️ PDF</a>`
      : `<button class="btn-xs" onclick="verEstado('${doc.id}')">Ver</button>`;

    return `
      <div class="doc-list-item" id="doc-${doc.id}">
        <div class="doc-icon">📄</div>
        <div style="flex:1;min-width:0;">
          <div class="doc-title">${escHtml(doc.title || 'Sin título')}</div>
          <div class="doc-meta">${fecha} · ${firmados}/${total} firma${total !== 1 ? 's' : ''}</div>
        </div>
        <div class="doc-actions">
          <span class="${badgeClass}">${badgeText}</span>
          ${acciones}
          <button class="btn-icon-sm danger" onclick="eliminarDoc('${doc.id}', '${tipo}')" title="Eliminar">🗑</button>
        </div>
      </div>`;
  }).join('');
}

async function verEstado(docId) {
  // Abrir en nueva pestaña o mostrar inline (aquí redirigimos)
  window.open(`/estado/${docId}`, '_blank');
}

async function eliminarDoc(id, tipo) {
  if (!confirmar('¿Eliminar este documento? Esta acción no se puede deshacer.')) return;
  try {
    await apiDelete(`/api/documento/${id}`);
    showToast('Documento eliminado');
    cargarLista(tipo);
  } catch (e) { showToast(e.message, 'error'); }
}
