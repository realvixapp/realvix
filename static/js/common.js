/**
 * Realvix CRM — common.js
 * Funciones compartidas + filtrado de nav por permisos de usuario
 */

// ══ ESTADO GLOBAL ══
window.RX = window.RX || {
  user: null,
};

// Mapa: sección → selector del link en el sidebar
const NAV_SECCIONES = {
  negocio:   'a[href="/negocio"]',
  leads:     'a[href="/leads"]',
  metricas:  'a[href="/metricas"]',
  cierres:   'a[href="/cierres"]',
  agenda:    'a[href="/agenda"]',
  firma:     'a[href="/firma"]',
  asistente: 'a[href="/asistente"]',
  contenido: 'a[href="/contenido"]',
  guiones:   'a[href="/guiones"]',
  ideas:     'a[href="/ideas"]',
};

// ══ AUTH ══
async function loadUser() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) { window.location.href = '/login'; return; }
    const data = await res.json();
    RX.user = data;

    // Mostrar nombre
    const chip = document.getElementById('userChip');
    if (chip) chip.textContent = data.name;

    // Mostrar link admin solo si es admin
    const adminLink = document.getElementById('adminLink');
    if (adminLink) {
      adminLink.style.display = data.role === 'admin' ? '' : 'none';
    }

    // Filtrar sidebar según permisos (solo para miembros)
    if (data.role !== 'admin') {
      aplicarPermisosNav(data.permisos || {});
      // Si el usuario intenta acceder a una sección sin permiso, redirigir
      verificarAccesoPaginaActual(data.permisos || {});
    }

    return data;
  } catch (e) {
    window.location.href = '/login';
  }
}

/**
 * Oculta en el sidebar los links de secciones que el usuario no tiene habilitadas.
 */
function aplicarPermisosNav(permisos) {
  Object.entries(NAV_SECCIONES).forEach(([key, selector]) => {
    const el = document.querySelector(selector);
    if (!el) return;
    const tienePermiso = permisos[key] === true;
    el.style.display = tienePermiso ? '' : 'none';
  });
}

/**
 * Si el usuario está en una página a la que no tiene acceso, lo manda al inicio.
 * Solo aplica a páginas de secciones, no al dashboard ni al login.
 */
function verificarAccesoPaginaActual(permisos) {
  const path = window.location.pathname.replace(/\/$/, '');
  // Buscar si el path corresponde a alguna sección controlada
  const seccionActual = Object.keys(NAV_SECCIONES).find(key => path === `/${key}`);
  if (!seccionActual) return; // dashboard u otra ruta pública → ok
  if (!permisos[seccionActual]) {
    // No tiene permiso → redirigir al dashboard con mensaje
    window.location.href = '/?acceso_denegado=1';
  }
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login';
}

// ══ FETCH HELPERS ══
async function apiGet(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return res.json();
}

async function apiPost(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `POST ${url} → ${res.status}`);
  }
  return res.json();
}

async function apiPut(url, body) {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `PUT ${url} → ${res.status}`);
  }
  return res.json();
}

async function apiDelete(url) {
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) throw new Error(`DELETE ${url} → ${res.status}`);
  return res.json();
}

// ══ TOAST ══
function showToast(msg, type = 'success', duration = 3000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const colors = {
    success: { bg: '#ecfdf5', border: '#10b981', color: '#065f46', icon: '✓' },
    error:   { bg: '#fef2f2', border: '#ef4444', color: '#991b1b', icon: '✗' },
    info:    { bg: '#EEF2FF', border: '#1B3FE4', color: '#1430B8', icon: 'ℹ' },
    warning: { bg: '#fffbeb', border: '#f59e0b', color: '#92400e', icon: '⚠' },
  };
  const c = colors[type] || colors.info;
  const toast = document.createElement('div');
  toast.style.cssText = `
    display:flex;align-items:center;gap:10px;
    padding:12px 16px;border-radius:10px;min-width:240px;max-width:340px;
    background:${c.bg};border:1px solid ${c.border};color:${c.color};
    font-size:0.84rem;font-weight:500;font-family:inherit;
    box-shadow:0 4px 12px rgba(0,0,0,0.10);
    animation:rxSlideIn 0.2s ease;
  `;
  toast.innerHTML = `<span style="font-size:1rem;flex-shrink:0;">${c.icon}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Animación toast
const styleEl = document.createElement('style');
styleEl.textContent = `
  @keyframes rxSlideIn {
    from { opacity:0; transform:translateX(20px); }
    to   { opacity:1; transform:translateX(0); }
  }
`;
document.head.appendChild(styleEl);

// ══ MODALES ══
function abrirModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}

function cerrarModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

// Cerrar modal al hacer click fuera
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-bg')) {
    e.target.classList.remove('open');
  }
});

// ══ UTILS ══
function formatFecha(str) {
  if (!str) return '—';
  try {
    const d = new Date(str);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return str; }
}

function formatMoneda(val, moneda = 'USD') {
  if (!val && val !== 0) return '—';
  const n = parseFloat(val);
  if (isNaN(n)) return '—';
  return moneda + ' ' + n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildWhatsAppUrl(phone, msg) {
  const clean = (phone || '').replace(/\D/g, '');
  return `https://wa.me/${clean}?text=${encodeURIComponent(msg)}`;
}

function confirmar(msg) {
  return confirm(msg);
}

// ══ BADGE HELPERS ══
function setBadge(id, count) {
  const el = document.getElementById(id);
  if (!el) return;
  if (count > 0) {
    el.textContent = count;
    el.style.display = '';
  } else {
    el.style.display = 'none';
  }
}
