/**
 * ideas.js
 */
const IDEAS = { ideas: [] };

async function initIdeas() {
  await cargarIdeas();
}

async function cargarIdeas() {
  try {
    const data = await apiGet('/api/ideas');
    IDEAS.ideas = data.ideas || [];
    renderIdeas();
  } catch (e) { showToast('Error al cargar ideas', 'error'); }
}

function filtrarIdeas() { renderIdeas(); }

function renderIdeas() {
  const filtro = document.getElementById('filtroIdeas')?.value || '';
  const lista = filtro ? IDEAS.ideas.filter(i => i.estado === filtro) : IDEAS.ideas;
  const container = document.getElementById('ideasGrid');
  if (!container) return;
  if (lista.length === 0) {
    container.innerHTML = `<div class="empty-state">No hay ideas todavía. ¡Anotá la primera!</div>`;
    return;
  }
  const ESTADO_COLORS = {
    pendiente:    { bg: '#FFF8E1', color: '#B45309', label: 'Pendiente' },
    en_progreso:  { bg: '#EEF2FF', color: '#1B3FE4', label: 'En progreso' },
    completada:   { bg: '#ECFDF5', color: '#059669', label: 'Completada' },
  };
  container.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px;">
    ${lista.map(i => {
      const est = ESTADO_COLORS[i.estado] || ESTADO_COLORS.pendiente;
      return `
        <div class="card" style="padding:14px;border-left:3px solid ${est.color};">
          <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;">
            <span style="font-size:0.7rem;font-weight:600;padding:2px 8px;border-radius:10px;background:${est.bg};color:${est.color};">${est.label}</span>
            <div style="display:flex;gap:3px;">
              <button class="btn-icon-sm" onclick="editarIdea('${i.id}')">✏️</button>
              <button class="btn-icon-sm danger" onclick="eliminarIdea('${i.id}')">🗑️</button>
            </div>
          </div>
          <div style="font-size:0.85rem;color:var(--text-primary);white-space:pre-line;line-height:1.5;">${escHtml(i.texto || '')}</div>
          <div style="font-size:0.7rem;color:#ccc;margin-top:8px;">${formatFecha(i.created_at)}</div>
        </div>`;
    }).join('')}
  </div>`;
}

function abrirNuevaIdea() {
  document.getElementById('ideaId').value = '';
  document.getElementById('ideaTexto').value = '';
  document.getElementById('ideaEstado').value = 'pendiente';
  document.getElementById('modalIdeaTitulo').textContent = 'Nueva idea';
  abrirModal('modalIdea');
}

function editarIdea(id) {
  const i = IDEAS.ideas.find(x => x.id === id);
  if (!i) return;
  document.getElementById('ideaId').value = i.id;
  document.getElementById('ideaTexto').value = i.texto || '';
  document.getElementById('ideaEstado').value = i.estado || 'pendiente';
  document.getElementById('modalIdeaTitulo').textContent = 'Editar idea';
  abrirModal('modalIdea');
}

async function guardarIdea() {
  const id = document.getElementById('ideaId').value;
  const texto = document.getElementById('ideaTexto').value.trim();
  if (!texto) { showToast('Escribí algo primero', 'error'); return; }
  const body = {
    texto,
    estado: document.getElementById('ideaEstado').value,
  };
  try {
    if (id) await apiPut(`/api/ideas/${id}`, body);
    else await apiPost('/api/ideas', body);
    cerrarModal('modalIdea');
    showToast('Idea guardada');
    await cargarIdeas();
  } catch (e) { showToast(e.message, 'error'); }
}

async function eliminarIdea(id) {
  if (!confirmar('¿Eliminar esta idea?')) return;
  try {
    await apiDelete(`/api/ideas/${id}`);
    showToast('Idea eliminada');
    await cargarIdeas();
  } catch (e) { showToast(e.message, 'error'); }
}
