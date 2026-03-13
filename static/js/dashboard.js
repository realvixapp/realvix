/**
 * dashboard.js
 */
let dashChartInst = null, dashPeriodo = 3;

async function initDashboard() {
  try {
    const [propData, leadsData, cierresData, tareasData] = await Promise.all([
      apiGet('/api/propiedades').catch(() => ({ propiedades: [] })),
      apiGet('/api/consultas').catch(() => ({ consultas: [] })),
      apiGet('/api/cierres').catch(() => ({ cierres: [] })),
      apiGet('/api/tareas').catch(() => ({ tareas: [] })),
    ]);
    const props = propData.propiedades || [];
    const leads = leadsData.consultas || [];
    const cierres = cierresData.cierres || [];
    const tareas = tareasData.tareas || [];

    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set('dProp', props.length);
    set('dLeads', leads.filter(l => l.estado !== 'visito').length);

    const mes = new Date();
    const cierresMes = cierres.filter(c => {
      const f = new Date(c.fecha || c.created_at);
      return f.getFullYear() === mes.getFullYear() && f.getMonth() === mes.getMonth();
    });
    set('dCierres', cierresMes.length);
    set('dTareas', tareas.filter(t => t.estado === 'pendiente').length);

    window._dashData = { props, leads, cierres };
    dashSetPeriodo(3, document.getElementById('dp-3'));
  } catch (e) { console.error(e); }
}

function dashSetPeriodo(m, btn) {
  dashPeriodo = m;
  document.querySelectorAll('[id^="dp-"]').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderDashChart();
}

function renderDashChart() {
  const canvas = document.getElementById('dashChart');
  if (!canvas || typeof Chart === 'undefined') return;
  const { leads = [], cierres = [] } = window._dashData || {};
  const ahora = new Date();
  const labels = [], dL = [], dC = [];
  for (let i = dashPeriodo - 1; i >= 0; i--) {
    const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
    const y = d.getFullYear(), m = d.getMonth();
    labels.push(d.toLocaleDateString('es-AR', { month: 'short' }));
    const inMes = (arr, campo) => (arr || []).filter(x => {
      const f = new Date(x[campo] || x.created_at || '');
      return f.getFullYear() === y && f.getMonth() === m;
    }).length;
    dL.push(inMes(leads, 'created_at'));
    dC.push(inMes(cierres, 'fecha'));
  }
  if (dashChartInst) dashChartInst.destroy();
  dashChartInst = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Leads', data: dL, backgroundColor: '#1B3FE455', borderColor: '#1B3FE4', borderWidth: 2, borderRadius: 4 },
        { label: 'Cierres', data: dC, backgroundColor: '#10B98155', borderColor: '#10B981', borderWidth: 2, borderRadius: 4 },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 12 } } },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1 } },
        x: { grid: { display: false } }
      }
    }
  });
}
