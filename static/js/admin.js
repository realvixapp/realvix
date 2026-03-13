/**
 * admin.js
 */
const ADM = { users: [] };

async function initAdmin() {
  // Verificar que el usuario sea admin
  if (RX.user && RX.user.role !== 'admin') {
    window.location.href = '/';
    return;
  }
  await cargarUsuarios();
}

async function cargarUsuarios() {
  try {
    const data = await apiGet('/api/admin/users');
    ADM.users = data.users || [];
    renderUsuarios();
  } catch (e) { showToast('Error al cargar usuarios', 'error'); }
}

function renderUsuarios() {
  const container = document.getElementById('usersTable');
  if (!container) return;
  if (ADM.users.length === 0) {
    container.innerHTML = `<div class="empty-state">No hay usuarios</div>`;
    return;
  }
  container.innerHTML = `
    <table class="table">
      <thead><tr>
        <th>Nombre</th><th>Email</th><th>Rol</th><th>Último acceso</th>
        <th style="text-align:right">Acciones</th>
      </tr></thead>
      <tbody>
        ${ADM.users.map(u => `
          <tr>
            <td><strong>${escHtml(u.name || '—')}</strong></td>
            <td>${escHtml(u.email || '—')}</td>
            <td><span class="badge ${u.role === 'admin' ? 'badge-blue' : 'badge-gray'}">${u.role}</span></td>
            <td>${formatFecha(u.last_login)}</td>
            <td style="text-align:right;white-space:nowrap;">
              <button class="btn-icon-sm" onclick="editarUsuario('${u.id}')">✏️</button>
              <button class="btn-icon-sm" onclick="cambiarPassword('${u.id}')" title="Cambiar contraseña">🔑</button>
              ${u.id !== (RX.user?.id) ? `<button class="btn-icon-sm danger" onclick="eliminarUsuario('${u.id}')">🗑️</button>` : ''}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
}

function abrirNuevoUsuario() {
  ['usrId','usrName','usrEmail','usrPass'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
  document.getElementById('usrRole').value = 'member';
  const passField = document.getElementById('usrPassField');
  if (passField) passField.style.display = '';
  document.getElementById('modalUsrTitulo').textContent = 'Nuevo usuario';
  abrirModal('modalUsuario');
}

function editarUsuario(id) {
  const u = ADM.users.find(x => x.id === id);
  if (!u) return;
  document.getElementById('usrId').value = u.id;
  document.getElementById('usrName').value = u.name || '';
  document.getElementById('usrEmail').value = u.email || '';
  document.getElementById('usrPass').value = '';
  document.getElementById('usrRole').value = u.role || 'member';
  const passField = document.getElementById('usrPassField');
  if (passField) passField.style.display = 'none';
  document.getElementById('modalUsrTitulo').textContent = 'Editar usuario';
  abrirModal('modalUsuario');
}

async function guardarUsuario() {
  const id = document.getElementById('usrId').value;
  const body = {
    name: document.getElementById('usrName').value,
    email: document.getElementById('usrEmail').value,
    role: document.getElementById('usrRole').value,
  };
  if (!id) {
    const pass = document.getElementById('usrPass').value;
    if (!pass || pass.length < 6) { showToast('La contraseña debe tener al menos 6 caracteres', 'error'); return; }
    body.password = pass;
  }
  try {
    if (id) await apiPut(`/api/admin/users/${id}`, body);
    else await apiPost('/api/admin/users', body);
    cerrarModal('modalUsuario');
    showToast('Usuario guardado');
    await cargarUsuarios();
  } catch (e) { showToast(e.message, 'error'); }
}

async function eliminarUsuario(id) {
  if (!confirmar('¿Eliminar este usuario?')) return;
  try {
    await apiDelete(`/api/admin/users/${id}`);
    showToast('Usuario eliminado');
    await cargarUsuarios();
  } catch (e) { showToast(e.message, 'error'); }
}

function cambiarPassword(id) {
  const modal = document.createElement('div');
  modal.className = 'modal-bg open';
  modal.id = 'modalPass';
  modal.innerHTML = `
    <div class="modal" style="max-width:360px;">
      <div class="modal-header">
        <h3>Cambiar contraseña</h3>
        <button class="modal-close" onclick="cerrarModal('modalPass')">✕</button>
      </div>
      <div class="modal-body">
        <div class="field">
          <label class="field-label">Nueva contraseña</label>
          <input type="password" id="newPass" class="input-base" placeholder="Mínimo 6 caracteres">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="cerrarModal('modalPass')">Cancelar</button>
        <button class="btn-primary" onclick="confirmarCambioPass('${id}')">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function confirmarCambioPass(id) {
  const pass = document.getElementById('newPass')?.value || '';
  if (pass.length < 6) { showToast('Mínimo 6 caracteres', 'error'); return; }
  try {
    await apiPost(`/api/admin/users/${id}/password`, { password: pass });
    cerrarModal('modalPass');
    showToast('Contraseña actualizada');
  } catch (e) { showToast(e.message, 'error'); }
}
