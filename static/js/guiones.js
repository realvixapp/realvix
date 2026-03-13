/**
 * guiones.js
 */
const GUI = { guiones: [] };

async function initGuiones() {
  await cargarGuiones();
}

async function cargarGuiones() {
  try {
    const data = await apiGet('/api/guiones');
    GUI.guiones = data.guiones || [];
    renderGuiones();
  } catch (e) { showToast('Error al cargar guiones', 'error'); }
}

function filtrarGuiones() { renderGuiones(); }

function renderGuiones() {
  const q = (document.getElementById('filtroGuiones')?.value || '').toLowerCase();
  const lista = GUI.guiones.filter(g =>
    !q || (g.titulo || '').toLowerCase().includes(q) || (g.tema || '').toLowerCase().includes(q)
  );
  const container = document.getElementById('guionesGrid');
  if (!container) return;
  if (lista.length === 0) {
    container.innerHTML = `<div class="empty-state">No hay guiones cargados</div>`;
    return;
  }
  container.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px;">
    ${lista.map(g => `
      <div class="card" style="padding:16px;">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:10px;">
          <div>
            <span style="font-weight:700;font-size:0.9rem;">${escHtml(g.titulo || 'Sin título')}</span>
            ${g.tema ? `<span class="badge badge-blue" style="margin-left:8px;">${escHtml(g.tema)}</span>` : ''}
            ${g.grabado ? `<span class="badge badge-green" style="margin-left:4px;">✓ Grabado</span>` : ''}
          </div>
          <div style="display:flex;gap:4px;">
            <button class="btn-icon-sm" onclick="editarGuion('${g.id}')">✏️</button>
            <button class="btn-icon-sm danger" onclick="eliminarGuion('${g.id}')">🗑️</button>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;font-size:0.82rem;">
          ${g.hook ? `<div><span style="font-weight:600;color:var(--rx-blue);">🎣 Hook</span><div style="color:#555;margin-top:2px;">${escHtml(g.hook)}</div></div>` : ''}
          ${g.desarrollo ? `<div><span style="font-weight:600;color:var(--text-secondary);">📝 Desarrollo</span><div style="color:#555;margin-top:2px;">${escHtml(g.desarrollo)}</div></div>` : ''}
          ${g.cta ? `<div><span style="font-weight:600;color:var(--success);">📣 CTA</span><div style="color:#555;margin-top:2px;">${escHtml(g.cta)}</div></div>` : ''}
        </div>
      </div>
    `).join('')}
  </div>`;
}

function abrirNuevoGuion() {
  ['guiId','guiTitulo','guiTema','guiHook','guiDesarrollo','guiCta','guiFechaGrabacion'].forEach(id => {
    const e = document.getElementById(id); if (e) e.value = '';
  });
  document.getElementById('guiGrabado').checked = false;
  document.getElementById('modalGuiTitulo').textContent = 'Nuevo guión';
  abrirModal('modalGuion');
}

function editarGuion(id) {
  const g = GUI.guiones.find(x => x.id === id);
  if (!g) return;
  document.getElementById('guiId').value = g.id;
  document.getElementById('guiTitulo').value = g.titulo || '';
  document.getElementById('guiTema').value = g.tema || '';
  document.getElementById('guiHook').value = g.hook || '';
  document.getElementById('guiDesarrollo').value = g.desarrollo || '';
  document.getElementById('guiCta').value = g.cta || '';
  document.getElementById('guiGrabado').checked = !!g.grabado;
  document.getElementById('guiFechaGrabacion').value = g.fecha_grabacion || '';
  document.getElementById('modalGuiTitulo').textContent = 'Editar guión';
  abrirModal('modalGuion');
}

async function guardarGuion() {
  const id = document.getElementById('guiId').value;
  const body = {
    titulo: document.getElementById('guiTitulo').value,
    tema: document.getElementById('guiTema').value,
    hook: document.getElementById('guiHook').value,
    desarrollo: document.getElementById('guiDesarrollo').value,
    cta: document.getElementById('guiCta').value,
    grabado: document.getElementById('guiGrabado').checked,
    fecha_grabacion: document.getElementById('guiFechaGrabacion').value,
  };
  try {
    if (id) await apiPut(`/api/guiones/${id}`, body);
    else await apiPost('/api/guiones', body);
    cerrarModal('modalGuion');
    showToast('Guión guardado');
    await cargarGuiones();
  } catch (e) { showToast(e.message, 'error'); }
}

async function eliminarGuion(id) {
  if (!confirmar('¿Eliminar este guión?')) return;
  try {
    await apiDelete(`/api/guiones/${id}`);
    showToast('Guión eliminado');
    await cargarGuiones();
  } catch (e) { showToast(e.message, 'error'); }
}
