{% extends "base.html" %}
{% block title %}Admin — Realvix CRM{% endblock %}

{% block content %}
<div class="page-title">Administración</div>
<div class="page-sub">Usuarios, roles y configuración del sistema</div>

<div style="display:flex;gap:10px;margin-bottom:20px;align-items:center;flex-wrap:wrap;">
  <button class="btn-primary" onclick="abrirNuevoUsuario()">+ Nuevo usuario</button>
  <button class="btn-secondary" onclick="ejecutarInitDB()" title="Crea las tablas faltantes en la base de datos">🔧 Inicializar base de datos</button>
</div>

<div id="usersTable">
  <div class="loading-state">Cargando...</div>
</div>

<!-- Modal usuario -->
<div class="modal-bg" id="modalUsuario">
  <div class="modal" style="max-width:440px;">
    <div class="modal-header">
      <h3 id="modalUsrTitulo">Nuevo usuario</h3>
      <button class="modal-close" onclick="cerrarModal('modalUsuario')">✕</button>
    </div>
    <div class="modal-body" style="display:flex;flex-direction:column;gap:12px;">
      <input type="hidden" id="usrId">
      <div class="field">
        <label class="field-label">Nombre</label>
        <input type="text" id="usrName" class="input-base">
      </div>
      <div class="field">
        <label class="field-label">Email</label>
        <input type="email" id="usrEmail" class="input-base">
      </div>
      <div class="field" id="usrPassField">
        <label class="field-label">Contraseña</label>
        <input type="password" id="usrPass" class="input-base" placeholder="Mínimo 6 caracteres">
      </div>
      <div class="field">
        <label class="field-label">Rol</label>
        <select id="usrRole" class="input-base">
          <option value="member">Miembro</option>
          <option value="admin">Admin</option>
        </select>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="cerrarModal('modalUsuario')">Cancelar</button>
      <button class="btn-primary" onclick="guardarUsuario()">Guardar</button>
    </div>
  </div>
</div>
{% endblock %}

{% block extra_js %}
<script src="/static/js/admin.js"></script>
<script>
async function ejecutarInitDB() {
  if (!confirm('¿Inicializar la base de datos? Esto crea todas las tablas faltantes sin borrar datos existentes.')) return;
  try {
    const r = await fetch('/api/init-db', { method: 'POST' });
    const d = await r.json();
    if (d.ok) {
      alert('✅ Base de datos inicializada correctamente. Recargá la página.');
    } else {
      alert('❌ Error: ' + (d.error || 'desconocido'));
    }
  } catch(e) {
    alert('❌ Error de red: ' + e.message);
  }
}
</script>
{% endblock %}

{% block on_ready %}
initAdmin();
{% endblock %}
