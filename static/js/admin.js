/**
 * admin.js — Realvix CRM
 * Sistema de invitación por link + checklist de permisos por sección
 */

const ADM = {
  users: [],
  secciones: [],
};

// ══ INIT ══

async function initAdmin() {
  if (RX.user && RX.user.role !== 'admin') {
    window.location.href = '/';
    return;
  }
  await Promise.all([cargarSecciones(), cargarUsuarios()]);
}

async function cargarSecciones() {
  try {
    const data = await apiGet('/api/admin/secciones');
    ADM.secciones = data.secciones || [];
  } catch (e) {
    console.warn('No se pudieron cargar las secciones');
  }
}

async function cargarUsuarios() {
  try {
    const data = await apiGet('/api/admin/users');
    ADM.users = data.users || [];
    renderUsuarios();
  } catch (e) {
    showToast('Error al cargar usuarios', 'error');
  }
}

// ══ RENDER TABLA ══

function renderUsuarios() {
  const container = document.getElementById('usersTable');
  if (!container) return;
  if (ADM.users.length === 0) {
    container.innerHTML = `<div class="empty-state">No hay usuarios. Invitá el primero con el botón de arriba.</div>`;
    return;
  }
  container.innerHTML = `
    <table class="table">
      <thead><tr>
        <th>Nombre</th>
        <th>Email</th>
        <th>Rol</th>
        <th>Secciones</th>
        <th>Último acceso</th>
        <th style="text-align:right">Acciones</th>
      </tr></thead>
      <tbody>
        ${ADM.users.map(u => renderFila(u)).join('')}
      </tbody>
    </table>`;
}

function renderFila(u) {
  const permisos = u.permisos || {};
  const esAdmin  = u.role === 'admin';

  // Badge de secciones
  let seccionesBadge;
  if (esAdmin) {
    seccionesBadge = `<span class="badge badge-blue">Todo</span>`;
  } else {
    const activas = ADM.secciones.filter(s => permisos[s.key]);
    if (activas.length === 0) {
      seccionesBadge = `<span class="badge badge-gray">Sin acceso</span>`;
    } else {
      seccionesBadge = activas.map(s =>
        `<span class="badge badge-gray" title="${s.label}">${s.icon}</span>`
      ).join(' ');
    }
  }

  return `
    <tr>
      <td><strong>${escHtml(u.name || '—')}</strong></td>
      <td style="color:#888;">${escHtml(u.email || '—')}</td>
      <td><span class="badge ${esAdmin ? 'badge-blue' : 'badge-gray'}">${u.role}</span></td>
      <td style="white-space:nowrap;">${seccionesBadge}</td>
      <td>${formatFecha(u.last_login)}</td>
      <td style="text-align:right;white-space:nowrap;">
        <button class="btn-icon-sm" onclick="editarUsuario('${u.id}')" title="Editar permisos">✏️</button>
        <button class="btn-icon-sm" onclick="generarLink('${u.id}')" title="Generar link de acceso">🔗</button>
        <button class="btn-icon-sm" onclick="abrirCambioPass('${u.id}')" title="Cambiar contraseña">🔑</button>
        ${u.id !== (RX.user?.id) ? `<button class="btn-icon-sm danger" onclick="eliminarUsuario('${u.id}')" title="Eliminar usuario">🗑️</button>` : ''}
      </td>
    </tr>`;
}

// ══ CHECKLIST DE PERMISOS ══

function renderChecklist(permisosActuales = {}) {
  const container = document.getElementById('permisosChecklist');
  if (!container) return;

  if (ADM.secciones.length === 0) {
    container.innerHTML = `<div style="color:#aaa;font-size:0.82rem;">No hay secciones disponibles</div>`;
    return;
  }

  container.innerHTML = ADM.secciones.map(s => {
    const checked = permisosActuales[s.key] ? 'checked' : '';
    return `
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 8px;
                    border-radius:8px;transition:background 0.15s;"
             onmouseover="this.style.background='#ede9e0'"
             onmouseout="this.style.background='transparent'">
        <input type="checkbox" id="perm_${s.key}" name="perm" value="${s.key}" ${checked}
               style="width:16px;height:16px;cursor:pointer;accent-color:#1B3FE4;">
        <span style="font-size:0.88rem;">${s.icon} ${s.label}</span>
      </label>`;
  }).join('');
}

function getPermisosDelForm() {
  const permisos = {};
  document.querySelectorAll('input[name="perm"]').forEach(cb => {
    permisos[cb.value] = cb.checked;
  });
  return permisos;
}

// ══ ABRIR MODALES ══

function abrirNuevoUsuario() {
  document.getElementById('usrId').value    = '';
  document.getElementById('usrName').value  = '';
  document.getElementById('usrEmail').value = '';
  document.getElementById('usrRole').value  = 'member';
  document.getElementById('modalUsrTitulo').textContent = 'Invitar usuario';
  document.getElementById('btnGuardarUsr').textContent  = 'Crear y generar link';
  document.getElementById('inviteLinkZone').style.display = 'none';
  document.getElementById('inviteLink').value = '';
  renderChecklist({});
  abrirModal('modalUsuario');
}

function editarUsuario(id) {
  const u = ADM.users.find(x => x.id === id);
  if (!u) return;

  document.getElementById('usrId').value    = u.id;
  document.getElementById('usrName').value  = u.name  || '';
  document.getElementById('usrEmail').value = u.email || '';
  document.getElementById('usrRole').value  = u.role  || 'member';
  document.getElementById('modalUsrTitulo').textContent = 'Editar usuario';
  document.getElementById('btnGuardarUsr').textContent  = 'Guardar cambios';
  document.getElementById('inviteLinkZone').style.display = 'none';
  document.getElementById('inviteLink').value = '';

  renderChecklist(u.permisos || {});
  abrirModal('modalUsuario');
}

// ══ GUARDAR ══

async function guardarUsuario() {
  const id      = document.getElementById('usrId').value;
  const name    = document.getElementById('usrName').value.trim();
  const email   = document.getElementById('usrEmail').value.trim();
  const role    = document.getElementById('usrRole').value;
  const permisos = getPermisosDelForm();

  if (!name || !email) {
    showToast('Nombre y email son requeridos', 'error');
    return;
  }

  try {
    if (id) {
      // Edición: actualizar nombre, rol y permisos
      await apiPut(`/api/admin/users/${id}`, { name, role, permisos });
      showToast('Usuario actualizado ✓');
      cerrarModal('modalUsuario');
    } else {
      // Creación: crea usuario y devuelve link
      const res = await apiPost('/api/admin/users', { email, name, role, permisos });
      if (res.invite_link) {
        mostrarLinkEnModal(res.invite_link);
        document.getElementById('btnGuardarUsr').textContent = 'Cerrar';
        document.getElementById('btnGuardarUsr').onclick = () => cerrarModal('modalUsuario');
        showToast('Usuario creado. Copiá el link de invitación 🔗', 'info', 5000);
      } else {
        cerrarModal('modalUsuario');
        showToast('Usuario creado');
      }
    }
    await cargarUsuarios();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ══ LINK DE INVITACIÓN ══

function mostrarLinkEnModal(link) {
  const zone = document.getElementById('inviteLinkZone');
  const input = document.getElementById('inviteLink');
  if (zone && input) {
    input.value = link;
    zone.style.display = '';
  }
}

async function generarLink(userId) {
  try {
    const data = await apiPost(`/api/admin/users/${userId}/invite`, {});
    // Abrir modal de edición del usuario con el link visible
    editarUsuario(userId);
    // Esperar un tick para que el modal esté abierto
    setTimeout(() => {
      mostrarLinkEnModal(data.link);
    }, 50);
    showToast('Link generado. Copialo y enviáselo al usuario 🔗', 'info', 5000);
  } catch (e) {
    showToast('Error generando link: ' + e.message, 'error');
  }
}

function copiarLink() {
  const input = document.getElementById('inviteLink');
  if (!input || !input.value) return;
  navigator.clipboard.writeText(input.value)
    .then(() => showToast('Link copiado al portapapeles ✓'))
    .catch(() => {
      input.select();
      document.execCommand('copy');
      showToast('Link copiado ✓');
    });
}

// ══ ELIMINAR ══

async function eliminarUsuario(id) {
  if (!confirmar('¿Eliminar este usuario? Se borrarán su sesión y su acceso.')) return;
  try {
    await apiDelete(`/api/admin/users/${id}`);
    showToast('Usuario eliminado');
    await cargarUsuarios();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ══ CAMBIO DE CONTRASEÑA ══

function abrirCambioPass(id) {
  document.getElementById('passUserId').value = id;
  document.getElementById('newPass').value    = '';
  abrirModal('modalPass');
}

async function confirmarCambioPass() {
  const id   = document.getElementById('passUserId').value;
  const pass = document.getElementById('newPass').value || '';
  if (pass.length < 6) { showToast('Mínimo 6 caracteres', 'error'); return; }
  try {
    await apiPost(`/api/admin/users/${id}/password`, { password: pass });
    cerrarModal('modalPass');
    showToast('Contraseña actualizada ✓');
  } catch (e) {
    showToast(e.message, 'error');
  }
}
