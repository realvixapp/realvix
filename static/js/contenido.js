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
  const lista = CONT.textos.filter(t =>
    !q || (t.titulo || '').toLowerCase().includes(q) || (t.contenido || '').toLowerCase().includes(q)
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

// Cambio #19: insertar atributo en cursor del textarea
function insertarAtributoCont(atributo) {
  const textarea = document.getElementById('txtContenido');
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end   = textarea.selectionEnd;
  const val   = textarea.value;
  textarea.value = val.substring(0, start) + atributo + val.substring(end);
  textarea.selectionStart = textarea.selectionEnd = start + atributo.length;
  textarea.focus();
}

// Cambio #20: modal de confirmación al eliminar
function _confirmCont(titulo, sub) {
  return new Promise(resolve => {
    let ov = document.getElementById('_confirmContOv');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = '_confirmContOv';
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9999;display:flex;align-items:center;justify-content:center;';
      document.body.appendChild(ov);
    }
    ov.innerHTML = `<div style="background:var(--bg-card,white);border-radius:12px;padding:28px 32px;max-width:380px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.18);">
      <div style="font-size:1rem;font-weight:700;margin-bottom:8px;">${titulo}</div>
      ${sub ? `<div style="font-size:0.85rem;color:#666;margin-bottom:20px;">${sub}</div>` : '<div style="margin-bottom:20px;"></div>'}
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button id="_ccCancelar" style="padding:8px 18px;border-radius:8px;border:1px solid #e5e7eb;background:white;cursor:pointer;font-size:0.88rem;">Cancelar</button>
        <button id="_ccAceptar" style="padding:8px 18px;border-radius:8px;border:none;background:#DC2626;color:white;cursor:pointer;font-size:0.88rem;font-weight:600;">Eliminar</button>
      </div>
    </div>`;
    ov.style.display = 'flex';
    const cerrar = v => { ov.style.display = 'none'; resolve(v); };
    document.getElementById('_ccAceptar').onclick  = () => cerrar(true);
    document.getElementById('_ccCancelar').onclick = () => cerrar(false);
    ov.onclick = e => { if (e.target === ov) cerrar(false); };
  });
}

async function eliminarTexto(id) {
  const t = CONT.textos.find(x => x.id === id);
  const tit = t ? (t.titulo || 'este texto') : 'este texto';
  const ok = await _confirmCont(`¿Eliminar "${tit}"?`, 'Esta acción no se puede deshacer.');
  if (!ok) return;
  try {
    await apiDelete(`/api/textos/${id}`);
    showToast('Texto eliminado');
    await cargarTextos();
  } catch (e) { showToast(e.message, 'error'); }
}
