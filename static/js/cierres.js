/**
 * cierres.js — Cierres + Gastos del negocio
 */
const CIE = { cierres: [], gastos: [], chartInst: null };

async function initCierres() {
  await Promise.all([cargarCierres(), cargarGastos()]);
}

function switchCierresTab(tab, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('tabCierres').style.display = tab === 'cierres' ? '' : 'none';
  document.getElementById('tabGastos').style.display = tab === 'gastos' ? '' : 'none';
}

// ── CIERRES ──
async function cargarCierres() {
  try {
    const data = await apiGet('/api/cierres');
    CIE.cierres = data.cierres || [];
    renderCierres();
    renderCierresStats();
    renderCierresChart();
  } catch (e) { showToast('Error al cargar cierres', 'error'); }
}

function renderCierresStats() {
  const mes = new Date();
  const cierreMes = CIE.cierres.filter(c => {
    const f = new Date(c.fecha || c.created_at);
    return f.getFullYear() === mes.getFullYear() && f.getMonth() === mes.getMonth();
  });
  const totalBruta = CIE.cierres.reduce((s, c) => s + (parseFloat(c.comision_bruta) || 0), 0);
  const totalNeta = CIE.cierres.reduce((s, c) => s + (parseFloat(c.comision_neta) || 0), 0);
  const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  el('cTotalCierres', CIE.cierres.length);
  el('cTotalBruta', 'USD ' + totalBruta.toLocaleString('es-AR'));
  el('cTotalNeta', 'USD ' + totalNeta.toLocaleString('es-AR'));
}

function renderCierresChart() {
  const canvas = document.getElementById('cierresChart');
  if (!canvas || typeof Chart === 'undefined') return;
  const ahora = new Date();
  const labels = [], data = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
    labels.push(d.toLocaleDateString('es-AR', { month: 'short' }));
    data.push(CIE.cierres.filter(c => {
      const f = new Date(c.fecha || '');
      return f.getFullYear() === d.getFullYear() && f.getMonth() === d.getMonth();
    }).reduce((s, c) => s + (parseFloat(c.comision_neta) || 0), 0));
  }
  if (CIE.chartInst) CIE.chartInst.destroy();
  CIE.chartInst = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: { labels, datasets: [{ label: 'USD Neto', data, backgroundColor: '#1B3FE444', borderColor: '#1B3FE4', borderWidth: 2, borderRadius: 5 }] },
    options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => 'USD ' + v.toLocaleString() } }, x: { grid: { display: false } } } }
  });
}

function renderCierres() {
  const container = document.getElementById('cierresTable');
  if (!container) return;
  if (CIE.cierres.length === 0) {
    container.innerHTML = `<div class="empty-state">No hay cierres registrados</div>`;
    return;
  }
  container.innerHTML = `
    <table class="table">
      <thead><tr>
        <th>Propiedad</th><th>Comprador</th><th>Valor</th>
        <th>Com. bruta</th><th>Com. neta</th><th>Fecha</th>
        <th style="text-align:right">Acciones</th>
      </tr></thead>
      <tbody>
        ${CIE.cierres.map(c => `
          <tr>
            <td><strong>${escHtml(c.propiedad || '—')}</strong></td>
            <td>${escHtml(c.comprador || '—')}</td>
            <td>${formatMoneda(c.valor_operacion, c.moneda)}</td>
            <td>${formatMoneda(c.comision_bruta, c.moneda)}</td>
            <td style="color:var(--success);font-weight:600;">${formatMoneda(c.comision_neta, c.moneda)}</td>
            <td>${formatFecha(c.fecha)}</td>
            <td style="text-align:right;white-space:nowrap;">
              <button class="btn-icon-sm" onclick="editarCierre('${c.id}')">✏️</button>
              <button class="btn-icon-sm danger" onclick="eliminarCierre('${c.id}')">🗑️</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
}

function calcCierre() {
  const valor = parseFloat(document.getElementById('cieValor')?.value) || 0;
  const pct = parseFloat(document.getElementById('ciePct')?.value) || 0;
  const brokerPct = parseFloat(document.getElementById('cieBrokerPct')?.value) || 0;
  const bruta = valor * pct / 100;
  const neta = bruta - (bruta * brokerPct / 100);
  const el = (id, v) => { const e = document.getElementById(id); if (e) e.value = v.toFixed(2); };
  el('cieBruta', bruta);
  el('cieNeta', neta);
}

function abrirNuevoCierre() {
  ['cieId','ciePropiedad','cieComprador','cieVendedor','cieNotas'].forEach(id => {
    const e = document.getElementById(id); if (e) e.value = '';
  });
  document.getElementById('cieValor').value = '';
  document.getElementById('ciePct').value = '3';
  document.getElementById('cieBrokerPct').value = '0';
  document.getElementById('cieBruta').value = '';
  document.getElementById('cieNeta').value = '';
  document.getElementById('cieMoneda').value = 'USD';
  document.getElementById('cieTipo').value = 'venta';
  document.getElementById('cieFecha').value = new Date().toISOString().split('T')[0];
  document.getElementById('modalCieTitulo').textContent = 'Nuevo cierre';
  abrirModal('modalCierre');
}

function editarCierre(id) {
  const c = CIE.cierres.find(x => x.id === id);
  if (!c) return;
  document.getElementById('cieId').value = c.id;
  document.getElementById('ciePropiedad').value = c.propiedad || '';
  document.getElementById('cieComprador').value = c.comprador || '';
  document.getElementById('cieVendedor').value = c.vendedor || '';
  document.getElementById('cieValor').value = c.valor_operacion || '';
  document.getElementById('ciePct').value = c.comision_pct || '3';
  document.getElementById('cieBrokerPct').value = '0';
  document.getElementById('cieBruta').value = c.comision_bruta || '';
  document.getElementById('cieNeta').value = c.comision_neta || '';
  document.getElementById('cieMoneda').value = c.moneda || 'USD';
  document.getElementById('cieTipo').value = c.tipo || 'venta';
  document.getElementById('cieFecha').value = c.fecha || '';
  document.getElementById('cieNotas').value = c.notas || '';
  document.getElementById('modalCieTitulo').textContent = 'Editar cierre';
  abrirModal('modalCierre');
}

async function guardarCierre() {
  const id = document.getElementById('cieId').value;
  const body = {
    propiedad: document.getElementById('ciePropiedad').value,
    comprador: document.getElementById('cieComprador').value,
    vendedor: document.getElementById('cieVendedor').value,
    valor_operacion: parseFloat(document.getElementById('cieValor').value) || 0,
    moneda: document.getElementById('cieMoneda').value,
    comision_pct: parseFloat(document.getElementById('ciePct').value) || 3,
    comision_bruta: parseFloat(document.getElementById('cieBruta').value) || 0,
    comision_neta: parseFloat(document.getElementById('cieNeta').value) || 0,
    tipo: document.getElementById('cieTipo').value,
    fecha: document.getElementById('cieFecha').value,
    notas: document.getElementById('cieNotas').value,
  };
  try {
    if (id) await apiPut(`/api/cierres/${id}`, body);
    else await apiPost('/api/cierres', body);
    cerrarModal('modalCierre');
    showToast('Cierre guardado');
    await cargarCierres();
  } catch (e) { showToast(e.message, 'error'); }
}

async function eliminarCierre(id) {
  if (!confirmar('¿Eliminar este cierre?')) return;
  try {
    await apiDelete(`/api/cierres/${id}`);
    showToast('Cierre eliminado');
    await cargarCierres();
  } catch (e) { showToast(e.message, 'error'); }
}

// ── GASTOS ──
async function cargarGastos() {
  try {
    const data = await apiGet('/api/gastos');
    CIE.gastos = data.gastos || [];
    renderGastos();
    renderGastosStats();
  } catch (e) { showToast('Error al cargar gastos', 'error'); }
}

function renderGastosStats() {
  const filtro = document.getElementById('filtroTipoGasto')?.value || '';
  const lista = filtro ? CIE.gastos.filter(g => g.tipo === filtro) : CIE.gastos;
  const ingresos = lista.filter(g => g.tipo === 'ingreso').reduce((s, g) => s + (parseFloat(g.monto) || 0), 0);
  const egresos = lista.filter(g => g.tipo === 'egreso').reduce((s, g) => s + (parseFloat(g.monto) || 0), 0);
  const saldo = ingresos - egresos;
  const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  el('gTotalIngresos', '$' + ingresos.toLocaleString('es-AR'));
  el('gTotalEgresos', '$' + egresos.toLocaleString('es-AR'));
  const sEl = document.getElementById('gSaldo');
  if (sEl) {
    sEl.textContent = '$' + saldo.toLocaleString('es-AR');
    sEl.style.color = saldo >= 0 ? 'var(--success)' : 'var(--danger)';
  }
}

function filtrarGastos() {
  renderGastos();
  renderGastosStats();
}

function renderGastos() {
  const filtro = document.getElementById('filtroTipoGasto')?.value || '';
  const lista = filtro ? CIE.gastos.filter(g => g.tipo === filtro) : CIE.gastos;
  const container = document.getElementById('gastosTable');
  if (!container) return;
  if (lista.length === 0) {
    container.innerHTML = `<div class="empty-state">No hay movimientos registrados</div>`;
    return;
  }
  container.innerHTML = `
    <table class="table">
      <thead><tr>
        <th>Descripción</th><th>Tipo</th><th>Categoría</th><th>Monto</th><th>Proveedor</th><th>Fecha</th>
        <th style="text-align:right">Acciones</th>
      </tr></thead>
      <tbody>
        ${lista.map(g => `
          <tr>
            <td>${escHtml(g.descripcion || '—')}</td>
            <td><span class="badge ${g.tipo === 'ingreso' ? 'badge-green' : 'badge-red'}">${g.tipo}</span></td>
            <td>${escHtml(g.categoria || '—')}</td>
            <td style="font-weight:600;color:${g.tipo === 'ingreso' ? 'var(--success)' : 'var(--danger)'};">
              ${g.tipo === 'egreso' ? '-' : '+'}${formatMoneda(g.monto, g.moneda)}
            </td>
            <td>${escHtml(g.proveedor || '—')}</td>
            <td>${formatFecha(g.fecha)}</td>
            <td style="text-align:right;white-space:nowrap;">
              <button class="btn-icon-sm" onclick="editarGasto('${g.id}')">✏️</button>
              <button class="btn-icon-sm danger" onclick="eliminarGasto('${g.id}')">🗑️</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
}

function abrirNuevoGasto() {
  ['gasId','gasDescripcion','gasMonto','gasProveedor','gasNotas'].forEach(id => {
    const e = document.getElementById(id); if (e) e.value = '';
  });
  document.getElementById('gasTipo').value = 'egreso';
  document.getElementById('gasCategoria').value = 'general';
  document.getElementById('gasMoneda').value = 'ARS';
  document.getElementById('gasFecha').value = new Date().toISOString().split('T')[0];
  document.getElementById('modalGasTitulo').textContent = 'Nuevo movimiento';
  abrirModal('modalGasto');
}

function editarGasto(id) {
  const g = CIE.gastos.find(x => x.id === id);
  if (!g) return;
  document.getElementById('gasId').value = g.id;
  document.getElementById('gasDescripcion').value = g.descripcion || '';
  document.getElementById('gasTipo').value = g.tipo || 'egreso';
  document.getElementById('gasCategoria').value = g.categoria || 'general';
  document.getElementById('gasMonto').value = g.monto || '';
  document.getElementById('gasMoneda').value = g.moneda || 'ARS';
  document.getElementById('gasProveedor').value = g.proveedor || '';
  document.getElementById('gasFecha').value = g.fecha || '';
  document.getElementById('gasNotas').value = g.notas || '';
  document.getElementById('modalGasTitulo').textContent = 'Editar movimiento';
  abrirModal('modalGasto');
}

async function guardarGasto() {
  const id = document.getElementById('gasId').value;
  const desc = document.getElementById('gasDescripcion').value.trim();
  if (!desc) { showToast('La descripción es requerida', 'error'); return; }
  const body = {
    descripcion: desc,
    tipo: document.getElementById('gasTipo').value,
    categoria: document.getElementById('gasCategoria').value,
    monto: parseFloat(document.getElementById('gasMonto').value) || 0,
    moneda: document.getElementById('gasMoneda').value,
    proveedor: document.getElementById('gasProveedor').value,
    fecha: document.getElementById('gasFecha').value,
    notas: document.getElementById('gasNotas').value,
  };
  try {
    if (id) await apiPut(`/api/gastos/${id}`, body);
    else await apiPost('/api/gastos', body);
    cerrarModal('modalGasto');
    showToast('Movimiento guardado');
    await cargarGastos();
  } catch (e) { showToast(e.message, 'error'); }
}

async function eliminarGasto(id) {
  if (!confirmar('¿Eliminar este movimiento?')) return;
  try {
    await apiDelete(`/api/gastos/${id}`);
    showToast('Movimiento eliminado');
    await cargarGastos();
  } catch (e) { showToast(e.message, 'error'); }
}
