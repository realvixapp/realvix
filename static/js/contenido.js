/**
 * contenido.js
 */
const CONT = { textos: [] };

async function initContenido() {
  await cargarTextos();
}

async function cargarTextos() {
  try {
    const data = await apiGet('/api/textos');
    CONT.textos = data.textos || [];
    renderTextos();
  } catch (e) { showToast('Error al cargar textos', 'error'); }
}

function filtrarTextos() { renderTextos(); }

function renderTextos() {
  const q = (document.getElementById('filtroTextos')?.value || '').toLowerCase();
  const cat = document.getElementById('filtroCategoria')?.value || '';
  const lista = CONT.textos.filter(t =>
    (!q || (t.titulo || '').toLowerCase().includes(q) || (t.contenido || '').toLowerCase().includes(q)) &&
    (!cat || t.categoria === cat)
  );
  const container = document.getElementById('textosGrid');
  if (!container) return;
  if (lista.length === 0) {
    container.innerHTML = `<div class="empty-state">No hay textos cargados</div>`;
    return;
  }
  container.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px;">
    ${lista.map(t => `
      <div class="card" style="padding:14px;">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;">
          <div>
            <span style="font-weight:600;font-size:0.88rem;">${escHtml(t.titulo)}</span>
            <span class="badge badge-blue" style="margin-left:8px;">${escHtml(t.tipo)}</span>
            <span class="badge badge-gray" style="margin-left:4px;">${escHtml(t.categoria)}</span>
          </div>
          <div style="display:flex;gap:4px;">
            <button class="btn-icon-sm" onclick="copiarTexto('${t.id}')" title="Copiar">📋</button>
            <button class="btn-icon-sm" onclick="editarTexto('${t.id}')">✏️</button>
            <button class="btn-icon-sm danger" onclick="eliminarTexto('${t.id}')">🗑️</button>
          </div>
        </div>
        <div style="font-size:0.81rem;color:#666;white-space:pre-line;background:#f8f9fa;padding:10px;border-radius:6px;">${escHtml(t.contenido || '')}</div>
      </div>
    `).join('')}
  </div>`;
}

function copiarTexto(id) {
  const t = CONT.textos.find(x => x.id === id);
  if (!t) return;
  navigator.clipboard.writeText(t.contenido || '').then(() => showToast('Texto copiado ✓'));
}

function abrirNuevoTexto() {
  ['txtId','txtTitulo','txtContenido'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
  document.getElementById('txtTipo').value = 'whatsapp';
  document.getElementById('txtCategoria').value = 'general';
  document.getElementById('modalTxtTitulo').textContent = 'Nuevo texto';
  abrirModal('modalTexto');
}

function editarTexto(id) {
  const t = CONT.textos.find(x => x.id === id);
  if (!t) return;
  document.getElementById('txtId').value = t.id;
  document.getElementById('txtTitulo').value = t.titulo || '';
  document.getElementById('txtTipo').value = t.tipo || 'whatsapp';
  document.getElementById('txtCategoria').value = t.categoria || 'general';
  document.getElementById('txtContenido').value = t.contenido || '';
  document.getElementById('modalTxtTitulo').textContent = 'Editar texto';
  abrirModal('modalTexto');
}

async function guardarTexto() {
  const id = document.getElementById('txtId').value;
  const body = {
    titulo: document.getElementById('txtTitulo').value,
    tipo: document.getElementById('txtTipo').value,
    categoria: document.getElementById('txtCategoria').value,
    contenido: document.getElementById('txtContenido').value,
  };
  try {
    if (id) await apiPut(`/api/textos/${id}`, body);
    else await apiPost('/api/textos', body);
    cerrarModal('modalTexto');
    showToast('Texto guardado');
    await cargarTextos();
  } catch (e) { showToast(e.message, 'error'); }
}

async function eliminarTexto(id) {
  if (!confirmar('¿Eliminar este texto?')) return;
  try {
    await apiDelete(`/api/textos/${id}`);
    showToast('Texto eliminado');
    await cargarTextos();
  } catch (e) { showToast(e.message, 'error'); }
}
