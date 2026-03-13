/**
 * firma.js — Enviar documentos + historial
 */
const FIRMA = { documentos: [] };

async function initFirma() {
  // Pre-cargar datos del usuario organizer
  if (RX.user) {
    document.getElementById('docOrgNombre').value = RX.user.name || '';
    document.getElementById('docOrgEmail').value = RX.user.email || '';
  }
  // Si hay ?doc= en URL, ir directo al historial con ese doc
  const params = new URLSearchParams(location.search);
  if (params.get('doc')) {
    switchFirmaTab('historial', document.querySelectorAll('.tab-btn')[1]);
    await cargarHistorial();
  }
}

function switchFirmaTab(tab, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('tabEnviar').style.display = tab === 'enviar' ? '' : 'none';
  document.getElementById('tabHistorial').style.display = tab === 'historial' ? '' : 'none';
  if (tab === 'historial') cargarHistorial();
}

function agregarFirmante() {
  const container = document.getElementById('firmantesContainer');
  const row = document.createElement('div');
  row.className = 'firmante-row';
  row.style.cssText = 'display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:end;';
  row.innerHTML = `
    <div class="field">
      <label class="field-label" style="font-size:0.65rem;">Nombre</label>
      <input type="text" class="input-base fn" placeholder="Nombre completo">
    </div>
    <div class="field">
      <label class="field-label" style="font-size:0.65rem;">Email</label>
      <input type="email" class="input-base fe" placeholder="email@ejemplo.com">
    </div>
    <button class="btn-icon-sm danger" onclick="this.closest('.firmante-row').remove()">✕</button>`;
  container.appendChild(row);
}

async function enviarDocumento() {
  const titulo = document.getElementById('docTitulo').value.trim();
  if (!titulo) { showToast('El título es requerido', 'error'); return; }

  const firmantesRows = document.querySelectorAll('.firmante-row');
  const firmantes = [];
  for (const row of firmantesRows) {
    const nombre = row.querySelector('.fn')?.value.trim() || '';
    const email = row.querySelector('.fe')?.value.trim() || '';
    if (nombre || email) firmantes.push({ name: nombre, email });
  }
  if (firmantes.length === 0) { showToast('Agregá al menos un firmante', 'error'); return; }

  const fd = new FormData();
  fd.append('title', titulo);
  fd.append('organizer_name', document.getElementById('docOrgNombre').value);
  fd.append('organizer_email', document.getElementById('docOrgEmail').value);
  fd.append('firmantes', JSON.stringify(firmantes));
  const pdf = document.getElementById('docPdf').files[0];
  if (pdf) fd.append('pdf_file', pdf);

  const btn = document.querySelector('#tabEnviar .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }

  try {
    const res = await fetch('/api/documento', { method: 'POST', body: fd });
    if (!res.ok) throw new Error('Error al enviar');
    const data = await res.json();
    showToast(`Documento enviado a ${firmantes.length} firmante(s) ✓`, 'success');
    // Limpiar form
    document.getElementById('docTitulo').value = '';
    document.getElementById('docPdf').value = '';
    document.getElementById('firmantesContainer').innerHTML = `
      <div class="firmante-row" style="display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:end;">
        <div class="field"><label class="field-label" style="font-size:0.65rem;">Nombre</label><input type="text" class="input-base fn" placeholder="Nombre completo"></div>
        <div class="field"><label class="field-label" style="font-size:0.65rem;">Email</label><input type="email" class="input-base fe" placeholder="email@ejemplo.com"></div>
        <button class="btn-icon-sm danger" onclick="this.closest('.firmante-row').remove()">✕</button>
      </div>`;
    // Mostrar historial
    switchFirmaTab('historial', document.querySelectorAll('.tab-btn')[1]);
  } catch (e) {
    showToast('Error al enviar el documento', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✉️ Enviar para firmar'; }
  }
}

async function cargarHistorial() {
  const container = document.getElementById('historialDocs');
  if (!container) return;
  container.innerHTML = `<div class="loading-state">Cargando...</div>`;
  try {
    const data = await apiGet('/api/documentos');
    FIRMA.documentos = data.documentos || [];
    renderHistorial();
  } catch (e) {
    container.innerHTML = `<div class="empty-state">Error al cargar documentos</div>`;
  }
}

function renderHistorial() {
  const container = document.getElementById('historialDocs');
  if (!container) return;
  if (FIRMA.documentos.length === 0) {
    container.innerHTML = `<div class="empty-state">No hay documentos enviados todavía</div>`;
    return;
  }
  container.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px;">
    ${FIRMA.documentos.map(doc => {
      const firmantes = doc.firmantes || [];
      const firmados = firmantes.filter(f => f.signed).length;
      const total = firmantes.length;
      const completo = firmados === total;
      return `
        <div class="card" style="padding:16px;">
          <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:10px;">
            <div>
              <div style="font-weight:600;font-size:0.9rem;">${escHtml(doc.title || 'Sin título')}</div>
              <div style="font-size:0.76rem;color:#888;margin-top:2px;">${formatFecha(doc.created_at)}</div>
            </div>
            <div style="display:flex;gap:6px;align-items:center;">
              <span class="badge ${completo ? 'badge-green' : 'badge-orange'}">
                ${completo ? '✓ Completado' : `${firmados}/${total} firmado${firmados !== 1 ? 's' : ''}`}
              </span>
              ${completo ? `<a href="/api/documento/${doc.id}/certificado" class="btn-xs" target="_blank">⬇️ PDF</a>` : ''}
              <button class="btn-icon-sm danger" onclick="eliminarDocumento('${doc.id}')">🗑️</button>
            </div>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;">
            ${firmantes.map(f => `
              <div style="display:flex;align-items:center;gap:6px;padding:5px 10px;border-radius:20px;background:${f.signed ? '#ECFDF5' : '#F3F4F6'};font-size:0.76rem;">
                <span>${f.signed ? '✅' : '⏳'}</span>
                <span style="color:${f.signed ? '#059669' : '#6B7280'};">${escHtml(f.name || f.email)}</span>
              </div>
            `).join('')}
          </div>
        </div>`;
    }).join('')}
  </div>`;
}

async function eliminarDocumento(id) {
  if (!confirmar('¿Eliminar este documento? Esta acción no se puede deshacer.')) return;
  try {
    await apiDelete(`/api/documento/${id}`);
    showToast('Documento eliminado');
    await cargarHistorial();
  } catch (e) { showToast(e.message, 'error'); }
}
