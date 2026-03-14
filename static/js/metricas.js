/**
 * metricas.js — Sistema OSBA · Los 10 Rituales · Pablo Viti · Tintorero
 * Restructurado completo con dashboard ejecutivo, embudo, objetivos por trimestre,
 * rituales diarios, planilla semanal y calculadora de número crítico.
 */

const MET = {
  objetivos: {},
  planilla: [],
  caja: [],       // registros diarios
  rituales: {},   // checkboxes de rituales por semana
  foda: {},
  periodo: 'anual',
  chartInst: null,
  planillaChartInst: null,
  // Datos del CRM
  propiedades: [],
  consultas: [],
  cierres: [],
  contactos: [],
};

// Estacionalidad Viti
const ESTACIONALIDAD = { Q1: 0.17, Q2: 0.23, Q3: 0.25, Q4: 0.35 };

// Los 10 Rituales de Pablo Viti
const LOS_10_RITUALES = [
  { num: 1,  texto: 'Especifiqué mi sistema de trabajo (OSBA)', desc: 'Define cómo encarás tu negocio' },
  { num: 2,  texto: 'Abrí y cerré caja hoy', desc: '¿Qué hice hoy por mi negocio?' },
  { num: 3,  texto: 'Tengo actividad agendada para la próxima semana', desc: 'Bloques de agenda, armado progresivo' },
  { num: 4,  texto: 'Conocí y usé mi número crítico como guía', desc: 'Cada acción enfocada en mis procesos semanales' },
  { num: 5,  texto: 'Hice mi espacio de reflexión semanal', desc: 'Análisis del negocio, qué mejorar' },
  { num: 6,  texto: 'Prospecté en todas las ocasiones que lo ameritó', desc: 'Plan anual + presupuesto MKT y prospección' },
  { num: 7,  texto: 'Evalué mi estado contable y financiero', desc: 'Conozco mi rentabilidad en detalle' },
  { num: 8,  texto: 'Me formé y entrené (lectura, capacitación, mentoring)', desc: 'Contenido formativo de la marca' },
  { num: 9,  texto: 'Me hice las 2 preguntas al final del día', desc: '¿Qué hice por mi negocio? ¿Y por la prospección?' },
  { num: 10, texto: 'Redefiní y rediseñé mis rituales', desc: 'Nada es definitivo, todo cambia' },
];

// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════
async function initMetricas() {
  // Fecha en el ritual
  const el = document.getElementById('ritualFecha');
  if (el) el.textContent = `Ritual #2 y #9 · ${new Date().toLocaleDateString('es-AR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })}`;

  const dashF = document.getElementById('dashFecha');
  if (dashF) {
    const hoy = new Date();
    dashF.textContent = hoy.toLocaleDateString('es-AR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
  }

  await Promise.all([
    cargarObjetivos(),
    cargarPlanilla(),
    cargarCajaData(),
    cargarFoda(),
    cargarRitualesData(),
    cargarDatosEmbudo(),
  ]);
  cargarDashboard();
  marcarTrimestresActivos();
}

function switchMetTab(tab, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const tabs = ['tabDashboard','tabEmbudo','tabObjetivos','tabRituales','tabPlanilla','tabProspeccion'];
  const mapa = { dashboard:'tabDashboard', embudo:'tabEmbudo', objetivos:'tabObjetivos',
                 rituales:'tabRituales', planilla:'tabPlanilla', prospeccion:'tabProspeccion' };
  tabs.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === mapa[tab] ? '' : 'none';
  });
}

// ═══════════════════════════════════════════════
// CARGA DE DATOS DEL CRM
// ═══════════════════════════════════════════════
async function cargarDatosEmbudo() {
  try {
    const [propData, leadsData, cierresData, ctcData] = await Promise.all([
      apiGet('/api/propiedades').catch(() => ({ propiedades: [] })),
      apiGet('/api/consultas').catch(() => ({ consultas: [] })),
      apiGet('/api/cierres').catch(() => ({ cierres: [] })),
      apiGet('/api/contactos').catch(() => ({ contactos: [] })),
    ]);
    MET.propiedades = propData.propiedades || [];
    MET.consultas   = leadsData.consultas  || [];
    MET.cierres     = cierresData.cierres  || [];
    MET.contactos   = ctcData.contactos    || [];
    renderEmbudo();
  } catch (e) { console.error('Error cargando embudo:', e); }
}

// ═══════════════════════════════════════════════
// DASHBOARD EJECUTIVO
// ═══════════════════════════════════════════════
function cargarDashboard() {
  const props     = MET.propiedades;
  const leads     = MET.consultas;
  const cierres   = MET.cierres;
  const contactos = MET.contactos;
  const obj       = MET.objetivos;

  const captadas    = props.filter(p => ['captado','publicado','reservado','cerrado'].includes((p.estado_tasacion||'').toLowerCase())).length;
  const publicadas  = props.filter(p => ['publicado','reservado'].includes((p.estado_tasacion||'').toLowerCase())).length;
  const visitas     = leads.filter(l => ['visito','visitó'].includes((l.estado||'').toLowerCase())).length;
  const nuevosLeads = leads.filter(l => l.estado === 'nuevo').length;

  // KPIs
  const kpiEl = document.getElementById('dashKpis');
  if (kpiEl) {
    const kpis = [
      { label:'Total cartera',    val:props.length,     icon:'🏘️', color:'#2563EB', sub:'propiedades' },
      { label:'Captadas',         val:captadas,         icon:'📋', color:'#059669', sub:'en seguimiento' },
      { label:'Publicadas',       val:publicadas,       icon:'🟢', color:'#059669', sub:'activas' },
      { label:'Leads totales',    val:leads.length,     icon:'🔍', color:'#7C3AED', sub:'consultas' },
      { label:'Leads nuevos',     val:nuevosLeads,      icon:'🆕', color:'#D97706', sub:'sin contactar' },
      { label:'Visitas',          val:visitas,          icon:'👁️', color:'#2563EB', sub:'realizadas' },
      { label:'Cierres',          val:cierres.length,   icon:'✅', color:'#059669', sub:'operaciones' },
      { label:'Base contactos',   val:contactos.length, icon:'👥', color:'#374151', sub:'personas' },
    ];
    kpiEl.innerHTML = kpis.map(k => `
      <div class="stat-mini" style="border-left:4px solid ${k.color};">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
          <span style="font-size:1rem;">${k.icon}</span>
          <span class="stat-mini-label" style="color:${k.color};font-weight:600;">${k.label}</span>
        </div>
        <div class="stat-mini-num" style="color:${k.color};">${k.val}</div>
        <div style="font-size:0.65rem;color:#aaa;">${k.sub}</div>
      </div>`).join('');
  }

  // Cartera vs objetivo
  const carteraObj  = parseFloat(obj.anual?.cartera || 20);
  const carteraPct  = Math.min(100, Math.round((props.length / carteraObj) * 100));
  const carteraNumEl  = document.getElementById('dashCarteraNum');
  const carteraBarEl  = document.getElementById('dashCarteraBarra');
  const carteraMsgEl  = document.getElementById('dashCarteraMsg');
  if (carteraNumEl) carteraNumEl.textContent = props.length;
  if (carteraBarEl) {
    carteraBarEl.style.width = carteraPct + '%';
    carteraBarEl.style.background = carteraPct >= 100 ? '#059669' : carteraPct >= 60 ? '#D97706' : '#DC2626';
  }
  if (carteraMsgEl) {
    const faltanProps = Math.max(0, carteraObj - props.length);
    carteraMsgEl.textContent = carteraPct >= 100
      ? `✅ Superaste el objetivo de ${carteraObj} propiedades`
      : `Faltan ${faltanProps} propiedades para el objetivo (${carteraPct}%)`;
    carteraMsgEl.style.color = carteraPct >= 100 ? '#059669' : carteraPct >= 60 ? '#D97706' : '#DC2626';
  }

  // Pareto
  const paretoEl = document.getElementById('dashPareto');
  if (paretoEl) {
    const facAnual   = parseFloat(obj.anual?.facturacion || 0);
    const cierresAnual = cierres.length;
    const comisionTotal = MET.planilla.reduce((s, x) => s + (parseFloat(x.comision)||0), 0);

    // Benchmarks Pareto: 20% agentes hace 80% resultados
    // 4% = alto rendimiento
    const benchFac = 200000;
    const pctHaciaAlto = facAnual > 0 ? Math.min(100, Math.round((comisionTotal/facAnual)*100)) : 0;
    const pctHacia200k = Math.min(100, Math.round((comisionTotal/benchFac)*100));

    paretoEl.innerHTML = `
      <div style="background:#f8f9fa;border-radius:8px;padding:12px;">
        <div style="font-size:0.72rem;font-weight:700;color:#888;text-transform:uppercase;margin-bottom:6px;">Facturación acumulada</div>
        <div style="font-size:1.6rem;font-weight:800;color:#374151;">USD ${comisionTotal.toLocaleString('es-AR')}</div>
        ${facAnual > 0 ? `
        <div style="height:6px;background:#e5e7eb;border-radius:3px;margin:6px 0;overflow:hidden;">
          <div style="height:100%;width:${pctHaciaAnual(comisionTotal, facAnual)}%;background:#2563EB;border-radius:3px;"></div>
        </div>
        <div style="font-size:0.7rem;color:#666;">${pctHaciaAnual(comisionTotal, facAnual)}% del objetivo anual (USD ${facAnual.toLocaleString('es-AR')})</div>` : '<div style="font-size:0.7rem;color:#aaa;">Configurá tu objetivo anual para ver el progreso</div>'}
      </div>
      <div style="background:#f8f9fa;border-radius:8px;padding:12px;">
        <div style="font-size:0.72rem;font-weight:700;color:#888;text-transform:uppercase;margin-bottom:6px;">Hacia el 4% (U$D 200K)</div>
        <div style="font-size:1.6rem;font-weight:800;color:${pctHacia200k>=100?'#059669':'#374151'};">${pctHacia200k}%</div>
        <div style="height:6px;background:#e5e7eb;border-radius:3px;margin:6px 0;overflow:hidden;">
          <div style="height:100%;width:${pctHacia200k}%;background:${pctHacia200k>=100?'#059669':pctHacia200k>=50?'#D97706':'#DC2626'};border-radius:3px;"></div>
        </div>
        <div style="font-size:0.7rem;color:#666;">${pctHacia200k>=100?'🏆 Agente de ALTO rendimiento (4%)':pctHacia200k>=50?'📈 En camino al top 20%':'💪 Construyendo la base'}</div>
      </div>
      <div style="background:#f8f9fa;border-radius:8px;padding:12px;">
        <div style="font-size:0.72rem;font-weight:700;color:#888;text-transform:uppercase;margin-bottom:6px;">Conversión cartera→cierre</div>
        <div style="font-size:1.6rem;font-weight:800;color:#7C3AED;">${props.length > 0 ? Math.round((cierresAnual/props.length)*100) : 0}%</div>
        <div style="font-size:0.7rem;color:#666;">${cierresAnual} cierres de ${props.length} propiedades</div>
      </div>
      <div style="background:#f8f9fa;border-radius:8px;padding:12px;">
        <div style="font-size:0.72rem;font-weight:700;color:#888;text-transform:uppercase;margin-bottom:6px;">Conversión leads→visita</div>
        <div style="font-size:1.6rem;font-weight:800;color:#D97706;">${leads.length > 0 ? Math.round((visitas/leads.length)*100) : 0}%</div>
        <div style="font-size:0.7rem;color:#666;">${visitas} visitas de ${leads.length} consultas</div>
      </div>`;
  }

  // Alertas
  renderAlertas(props, leads, cierres, contactos);
}

function pctHaciaAnual(real, objetivo) {
  if (!objetivo) return 0;
  return Math.min(100, Math.round((real/objetivo)*100));
}

function renderAlertas(props, leads, cierres, contactos) {
  const alertasEl = document.getElementById('dashAlertas');
  if (!alertasEl) return;

  const alertas = [];
  const hoy = new Date().toISOString().split('T')[0];

  // Cartera < 20
  if (props.length < 20) {
    alertas.push({ tipo:'warning', msg:`Tu cartera tiene ${props.length}/20 propiedades. Necesitás captár ${20-props.length} más para el objetivo mínimo de Viti.` });
  } else {
    alertas.push({ tipo:'success', msg:`✅ Cartera completa: ${props.length} propiedades (objetivo mínimo 20 cumplido)` });
  }

  // Leads sin contactar
  const sinContactar = leads.filter(l => l.estado === 'nuevo').length;
  if (sinContactar > 0) alertas.push({ tipo:'danger', msg:`⚡ Tenés ${sinContactar} lead(s) NUEVO(S) sin contactar. Actuá antes de que se enfríen.` });

  // Próximos contactos vencidos en propiedades
  const vencidos = props.filter(p => p.proximo_contacto && p.proximo_contacto < hoy).length;
  if (vencidos > 0) alertas.push({ tipo:'danger', msg:`⏰ Tenés ${vencidos} propiedad(es) con seguimiento vencido. Contactá hoy.` });

  // Base de contactos pequeña
  if (contactos.length < 50) alertas.push({ tipo:'info', msg:`📇 Base de relaciones: ${contactos.length} contactos. Agregá 2 nuevos por semana (Ritual #6).` });

  // Semana sin actividad registrada
  const hoyWeekStart = getInicioSemana(new Date());
  const tieneSemana = MET.planilla.some(s => {
    const fecha = s.semana || '';
    return fecha.includes(hoyWeekStart.toLocaleDateString('es-AR').slice(0,5));
  });
  if (!tieneSemana) alertas.push({ tipo:'warning', msg:`📋 No registraste actividad esta semana. Ingresá en la Planilla Semanal (Ritual #2).` });

  // Cara a cara última semana
  const ultimaSemana = MET.planilla[MET.planilla.length - 1];
  if (ultimaSemana && (ultimaSemana.cara_a_cara || 0) < 15) {
    alertas.push({ tipo:'warning', msg:`👥 Última semana: ${ultimaSemana.cara_a_cara||0}/15 cara a cara. Objetivo Viti: mínimo 15 por semana.` });
  }

  if (alertas.length === 0) {
    alertas.push({ tipo:'success', msg:'✅ Todo en orden. Mantené el ritmo.' });
  }

  const COLORES = { danger:'#FEF2F2', warning:'#FFFBEB', success:'#ECFDF5', info:'#EFF6FF' };
  const BORDES  = { danger:'#DC2626', warning:'#D97706', success:'#059669', info:'#2563EB' };

  alertasEl.innerHTML = alertas.map(a => `
    <div style="padding:10px 14px;border-radius:8px;background:${COLORES[a.tipo]};border-left:4px solid ${BORDES[a.tipo]};font-size:0.82rem;color:#374151;">
      ${a.msg}
    </div>`).join('');
}

// ═══════════════════════════════════════════════
// EMBUDO DE CONVERSIÓN
// ═══════════════════════════════════════════════
function renderEmbudo() {
  const props   = MET.propiedades;
  const leads   = MET.consultas;
  const cierres = MET.cierres;

  const cartera     = props.length;
  const captadas    = props.filter(p => ['captado','publicado','reservado','cerrado'].includes((p.estado_tasacion||'').toLowerCase())).length;
  const publicadas  = props.filter(p => ['publicado','reservado'].includes((p.estado_tasacion||'').toLowerCase())).length;
  const visitas     = leads.filter(l => ['visito','visitó'].includes((l.estado||'').toLowerCase())).length;
  const pendVisita  = leads.filter(l => l.estado === 'pendiente_visita').length;

  const pasos = [
    { label:'Cartera total',   num:cartera,       icon:'🏘️', color:'#2563EB', bg:'#EFF6FF', desc:'Propiedades en seguimiento' },
    { label:'Captadas',        num:captadas,       icon:'📋', color:'#7C3AED', bg:'#F5F3FF', desc:'Tasación aceptada' },
    { label:'Publicadas',      num:publicadas,     icon:'🟢', color:'#059669', bg:'#ECFDF5', desc:'Activas en mercado' },
    { label:'Consultas',       num:leads.length,   icon:'🔍', color:'#D97706', bg:'#FFFBEB', desc:'Leads entrantes' },
    { label:'Pend. visita',    num:pendVisita,     icon:'📅', color:'#7C3AED', bg:'#F5F3FF', desc:'Visita agendada' },
    { label:'Visitaron',       num:visitas,        icon:'👁️', color:'#2563EB', bg:'#EFF6FF', desc:'Visita realizada' },
    { label:'Cierres',         num:cierres.length, icon:'✅', color:'#059669', bg:'#ECFDF5', desc:'Operaciones cerradas' },
  ];

  const grid = document.getElementById('embudoGrid');
  if (grid) {
    grid.innerHTML = pasos.map((p, i) => {
      const pct = i > 0 && pasos[i-1].num > 0 ? Math.round(p.num / pasos[i-1].num * 100) : null;
      const pctColor = pct === null ? '' : pct >= 50 ? '#059669' : pct >= 20 ? '#D97706' : '#DC2626';
      return `
        <div class="card" style="padding:14px;text-align:center;border-top:4px solid ${p.color};">
          <div style="font-size:1.4rem;margin-bottom:4px;">${p.icon}</div>
          <div style="font-size:1.8rem;font-weight:800;color:${p.color};">${p.num}</div>
          <div style="font-size:0.78rem;font-weight:600;color:#374151;">${p.label}</div>
          <div style="font-size:0.62rem;color:#aaa;margin-top:2px;">${p.desc}</div>
          ${pct !== null ? `
            <div style="margin-top:6px;font-size:0.72rem;font-weight:700;color:${pctColor};background:${p.bg};padding:2px 8px;border-radius:10px;display:inline-block;">
              ${pct}% conversión
            </div>` : ''}
        </div>`;
    }).join('');
  }

  renderEmbudoChart(pasos);

  // Análisis textual
  const analisisEl = document.getElementById('embudoAnalisis');
  if (analisisEl) {
    const analisis = [];

    const tasaCapt  = cartera > 0 ? Math.round((captadas/cartera)*100) : 0;
    const tasaPubl  = captadas > 0 ? Math.round((publicadas/captadas)*100) : 0;
    const tasaConsultas = publicadas > 0 ? Math.round((leads.length/publicadas)*100) : 0;
    const tasaVisita = leads.length > 0 ? Math.round((visitas/leads.length)*100) : 0;
    const tasaCierre = visitas > 0 ? Math.round((cierres.length/visitas)*100) : 0;

    analisis.push({ label:'Cartera → Captadas', pct:tasaCapt, bench:'Tasa de aceptación pre-listing: 30%–50%', ok: tasaCapt >= 30 });
    analisis.push({ label:'Captadas → Publicadas', pct:tasaPubl, bench:'Objetivo: avanzar a publicación rápidamente', ok: tasaPubl >= 60 });
    analisis.push({ label:'Publicadas → Consultas', pct:tasaConsultas, bench:'Más consultas = mayor exposición en portales', ok: tasaConsultas >= 50 });
    analisis.push({ label:'Consultas → Visitas', pct:tasaVisita, bench:'Benchmark: 30% de consultas deben visitar', ok: tasaVisita >= 30 });
    analisis.push({ label:'Visitas → Cierres', pct:tasaCierre, bench:'Benchmark: 20% de visitas deben cerrar', ok: tasaCierre >= 20 });

    analisisEl.innerHTML = analisis.map(a => `
      <div style="display:flex;align-items:center;gap:12px;padding:10px;border-radius:8px;background:${a.ok?'#ECFDF5':'#FEF9C3'};border:1px solid ${a.ok?'#BBF7D0':'#FDE047'};">
        <span style="font-size:1.1rem;">${a.ok ? '✅' : '⚠️'}</span>
        <div style="flex:1;">
          <div style="font-size:0.82rem;font-weight:600;color:#374151;">${a.label}: <strong style="color:${a.ok?'#059669':'#D97706'};">${a.pct}%</strong></div>
          <div style="font-size:0.7rem;color:#888;">${a.bench}</div>
        </div>
      </div>`).join('');
  }
}

function renderEmbudoChart(pasos) {
  const canvas = document.getElementById('embudoChart');
  if (!canvas || typeof Chart === 'undefined') return;
  if (MET.chartInst) MET.chartInst.destroy();
  MET.chartInst = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: pasos.map(p => p.label),
      datasets: [{
        label: 'Cantidad',
        data: pasos.map(p => p.num),
        backgroundColor: ['#2563EBCC','#7C3AEDCC','#059669CC','#D97706CC','#7C3AEDCC','#2563EBCC','#059669CC'],
        borderRadius: 8,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: { legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y} unidades` } }
      },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: '#f3f4f6' } },
        x: { grid: { display: false } }
      }
    }
  });
}

// ═══════════════════════════════════════════════
// OBJETIVOS
// ═══════════════════════════════════════════════
async function cargarObjetivos() {
  try {
    const data = await apiGet('/api/objetivos');
    MET.objetivos = data.objetivos || {};
    renderObjetivos();
  } catch (e) { console.error(e); }
}

function renderObjetivos() {
  const container = document.getElementById('objetivosGrid');
  if (!container) return;

  const obj = MET.objetivos;
  const anual = obj.anual || {};
  const facAnual = parseFloat(anual.facturacion || 0);
  const cierresAnualObj = parseFloat(anual.cierres || 0);
  const captAnualObj = parseFloat(anual.captaciones || 0);
  const consultasAnualObj = parseFloat(anual.consultas || 0);
  const visitasAnualObj = parseFloat(anual.visitas || 0);

  // Datos reales del CRM
  const realCierres    = MET.cierres.length;
  const realCaptadas   = MET.propiedades.filter(p => ['captado','publicado','reservado','cerrado'].includes((p.estado_tasacion||'').toLowerCase())).length;
  const realConsultas  = MET.consultas.length;
  const realVisitas    = MET.consultas.filter(l => ['visito','visitó'].includes((l.estado||'').toLowerCase())).length;
  const realComision   = MET.planilla.reduce((s, x) => s + (parseFloat(x.comision)||0), 0);

  const trimestres = [
    { key:'Q1', label:'Q1 — Enero a Marzo',    pct:ESTACIONALIDAD.Q1, meses:'Ene, Feb, Mar', color:'#6B7280' },
    { key:'Q2', label:'Q2 — Abril a Junio',    pct:ESTACIONALIDAD.Q2, meses:'Abr, May, Jun', color:'#2563EB' },
    { key:'Q3', label:'Q3 — Julio a Septiembre', pct:ESTACIONALIDAD.Q3, meses:'Jul, Ago, Sep', color:'#7C3AED' },
    { key:'Q4', label:'Q4 — Octubre a Diciembre', pct:ESTACIONALIDAD.Q4, meses:'Oct, Nov, Dic', color:'#059669' },
  ];

  // Calcular en qué trimestre estamos
  const mesActual = new Date().getMonth() + 1;
  const trimActual = mesActual <= 3 ? 'Q1' : mesActual <= 6 ? 'Q2' : mesActual <= 9 ? 'Q3' : 'Q4';

  let html = '';

  // Sección: objetivo anual global
  html += `
    <div style="margin-bottom:28px;">
      <div style="font-size:0.95rem;font-weight:700;color:#374151;letter-spacing:0.5px;margin-bottom:12px;padding-bottom:6px;border-bottom:2px solid var(--rx-blue);display:flex;align-items:center;justify-content:space-between;">
        <span>🏆 Objetivos anuales — vs. CRM real</span>
        <button onclick="abrirEditarObjetivosAnual()" style="font-size:0.75rem;padding:4px 12px;border-radius:8px;border:none;background:var(--rx-blue);color:white;cursor:pointer;font-weight:600;">✏️ Editar</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin-bottom:8px;">
        ${renderObjetivoCard('💰 Facturación USD', realComision, facAnual, 'USD')}
        ${renderObjetivoCard('✅ Cierres', realCierres, cierresAnualObj, '')}
        ${renderObjetivoCard('📋 Captaciones', realCaptadas, captAnualObj, '')}
        ${renderObjetivoCard('🔍 Consultas', realConsultas, consultasAnualObj, '')}
        ${renderObjetivoCard('👁️ Visitas', realVisitas, visitasAnualObj, '')}
      </div>
      ${facAnual === 0 ? '<div style="font-size:0.75rem;color:#D97706;padding:8px;background:#FFFBEB;border-radius:6px;">⚠️ Configurá tus objetivos anuales para ver el progreso</div>' : ''}
    </div>`;

  // Sección por trimestre
  html += `
    <div>
      <div style="font-size:0.95rem;font-weight:700;color:#374151;letter-spacing:0.5px;margin-bottom:12px;padding-bottom:6px;border-bottom:2px solid var(--border);">
        📅 Desglose por trimestre — Estacionalidad Viti
      </div>`;

  trimestres.forEach(t => {
    const esActual = t.key === trimActual;
    const facTrim  = facAnual * t.pct;
    const objTrim  = obj[t.key.toLowerCase()] || {};

    // Calcular progreso real del trimestre por planilla
    const planTrim = MET.planilla.filter(s => perteneceATrimestre(s.semana, t.key));
    const realFacTrim = planTrim.reduce((s, x) => s + (parseFloat(x.comision)||0), 0);
    const realCierresTrim = planTrim.reduce((s, x) => s + (parseInt(x.cierres)||0), 0);

    html += `
      <div style="margin-bottom:20px;padding:16px;border-radius:12px;border:${esActual?'2px solid '+t.color:'1px solid var(--border)'};background:${esActual?'white':'#fafafa'};">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
          <div>
            <span style="font-weight:700;font-size:0.88rem;color:${t.color};">${t.label}</span>
            ${esActual ? '<span style="margin-left:8px;font-size:0.7rem;background:'+t.color+';color:white;padding:2px 8px;border-radius:10px;font-weight:600;">▶ ACTUAL</span>' : ''}
            <div style="font-size:0.72rem;color:#888;margin-top:2px;">${t.meses} · ${Math.round(t.pct*100)}% de facturación anual</div>
          </div>
          ${facAnual > 0 ? `<div style="text-align:right;">
            <div style="font-size:0.68rem;color:#888;text-transform:uppercase;">Objetivo facturación trimestre</div>
            <div style="font-size:1rem;font-weight:800;color:${t.color};">USD ${Math.round(facTrim).toLocaleString('es-AR')}</div>
          </div>` : ''}
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;">
          ${renderObjetivoCard('💰 Facturación USD', realFacTrim, facTrim, 'USD', t.color)}
          ${renderObjetivoCard('✅ Cierres', realCierresTrim, Math.ceil(cierresAnualObj * t.pct), '', t.color)}
        </div>
        <div style="font-size:0.68rem;color:#aaa;margin-top:8px;">
          📐 Calculado: ${Math.round(t.pct*100)}% del anual = Viti estacionalidad inmobiliaria
        </div>
      </div>`;
  });

  html += '</div>';
  container.innerHTML = html;
}

function renderObjetivoCard(label, real, meta, prefijo, color = 'var(--rx-blue)') {
  const pct = meta > 0 ? Math.min(100, Math.round((real/meta)*100)) : 0;
  const barColor = pct >= 100 ? '#059669' : pct >= 60 ? '#D97706' : color;
  return `
    <div class="card" style="padding:12px;">
      <div style="font-size:0.75rem;font-weight:600;color:#374151;margin-bottom:6px;">${label}</div>
      <div style="font-size:1.4rem;font-weight:800;color:${barColor};">${prefijo ? prefijo+' ' : ''}${real.toLocaleString('es-AR')}</div>
      <div style="font-size:0.68rem;color:#888;margin-bottom:5px;">Meta: ${prefijo ? prefijo+' ' : ''}${meta > 0 ? Math.round(meta).toLocaleString('es-AR') : '—'}</div>
      <div style="height:5px;background:#e5e7eb;border-radius:3px;overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:${barColor};border-radius:3px;transition:width 0.5s;"></div>
      </div>
      <div style="font-size:0.65rem;color:#888;margin-top:2px;">${pct}% ${pct>=100?'✅':''}</div>
    </div>`;
}

function perteneceATrimestre(semanaStr, trimKey) {
  if (!semanaStr) return false;
  // Detectar mes del string de semana
  const meses = { ene:1,feb:2,mar:3,abr:4,may:5,jun:6,jul:7,ago:8,sep:9,oct:10,nov:11,dic:12 };
  const lower = (semanaStr||'').toLowerCase();
  for (const [k, v] of Object.entries(meses)) {
    if (lower.includes(k)) {
      if (trimKey==='Q1') return v<=3;
      if (trimKey==='Q2') return v>=4 && v<=6;
      if (trimKey==='Q3') return v>=7 && v<=9;
      if (trimKey==='Q4') return v>=10;
    }
  }
  return false;
}

function abrirEditarObjetivosAnual() {
  const anual = MET.objetivos.anual || {};
  const campos = ['Fac','Cierres','Captaciones','Consultas','Visitas','CaraACara','PreListing','Contactos','Cartera'];
  campos.forEach(c => {
    const el = document.getElementById('objAnual' + c);
    if (el) el.value = anual[c.toLowerCase()] || anual[c] || '';
  });
  actualizarPreviewTrimestres();
  abrirModal('modalObjetivosAnual');
}

function actualizarPreviewTrimestres() {
  const fac = parseFloat(document.getElementById('objAnualFac')?.value || 0);
  const cierres = parseFloat(document.getElementById('objAnualCierres')?.value || 0);
  const prev = document.getElementById('previewTrimestres');
  if (!prev || !fac) { if(prev) prev.innerHTML=''; return; }

  prev.innerHTML = `
    <div style="font-size:0.72rem;font-weight:700;color:#374151;margin-bottom:8px;text-transform:uppercase;">Preview por trimestre:</div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;">
      ${[['Q1','#6B7280','17%'],['Q2','#2563EB','23%'],['Q3','#7C3AED','25%'],['Q4','#059669','35%']].map(([q,c,p])=>`
        <div style="background:white;border-radius:6px;padding:8px;text-align:center;border:1px solid ${c}44;">
          <div style="font-size:0.7rem;font-weight:700;color:${c};">${q} · ${p}</div>
          <div style="font-size:0.85rem;font-weight:700;">USD ${Math.round(fac*parseFloat(p)/100).toLocaleString('es-AR')}</div>
          ${cierres ? `<div style="font-size:0.68rem;color:#888;">${Math.ceil(cierres*parseFloat(p)/100)} cierres</div>` : ''}
        </div>`).join('')}
    </div>`;
}

async function guardarObjetivosAnual() {
  const anual = {
    facturacion:    parseFloat(document.getElementById('objAnualFac')?.value) || 0,
    cierres:        parseFloat(document.getElementById('objAnualCierres')?.value) || 0,
    captaciones:    parseFloat(document.getElementById('objAnualCaptaciones')?.value) || 0,
    consultas:      parseFloat(document.getElementById('objAnualConsultas')?.value) || 0,
    visitas:        parseFloat(document.getElementById('objAnualVisitas')?.value) || 0,
    cara_a_cara:    parseFloat(document.getElementById('objAnualCaraACara')?.value) || 15,
    pre_listing:    parseFloat(document.getElementById('objAnualPreListing')?.value) || 3,
    contactos:      parseFloat(document.getElementById('objAnualContactos')?.value) || 2,
    cartera:        parseFloat(document.getElementById('objAnualCartera')?.value) || 20,
  };
  MET.objetivos.anual = anual;
  try {
    await apiPost('/api/objetivos', { data: MET.objetivos });
    cerrarModal('modalObjetivosAnual');
    showToast('Objetivos guardados ✓', 'success');
    renderObjetivos();
    cargarDashboard();
  } catch(e) { showToast(e.message, 'error'); }
}

// ═══════════════════════════════════════════════
// RITUALES — Los 10 de Pablo Viti
// ═══════════════════════════════════════════════
async function cargarRitualesData() {
  try {
    const data = await apiGet('/api/objetivos');
    const obj = data.objetivos || {};
    MET.rituales = obj.rituales || {};
    renderRituales();
  } catch(e) {}
}

function renderRituales() {
  const listaEl = document.getElementById('ritualesLista');
  if (!listaEl) return;
  const semana = getSemanaKey();
  const checks = MET.rituales[semana] || {};
  let completados = 0;

  listaEl.innerHTML = LOS_10_RITUALES.map(r => {
    const checked = !!checks[r.num];
    if (checked) completados++;
    const COLOR_MAP = {1:'#2563EB',2:'#D97706',3:'#7C3AED',4:'#DC2626',5:'#059669',6:'#2563EB',7:'#D97706',8:'#7C3AED',9:'#059669',10:'#374151'};
    return `
      <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-radius:8px;background:${checked?'#ECFDF5':'#f9fafb'};border:1px solid ${checked?'#BBF7D0':'#e5e7eb'};cursor:pointer;"
        onclick="toggleRitual(${r.num})">
        <div style="width:22px;height:22px;border-radius:50%;border:2px solid ${checked?'#059669':COLOR_MAP[r.num]};background:${checked?'#059669':'white'};display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:0.7rem;font-weight:800;color:${checked?'white':COLOR_MAP[r.num]};">
          ${checked?'✓':r.num}
        </div>
        <div style="flex:1;">
          <div style="font-size:0.84rem;font-weight:${checked?'700':'600'};color:${checked?'#065F46':'#374151'};text-decoration:${checked?'none':'none'};">${r.texto}</div>
          <div style="font-size:0.7rem;color:#888;margin-top:1px;">${r.desc}</div>
        </div>
      </div>`;
  }).join('');

  // Barra de progreso
  const pct = Math.round((completados/10)*100);
  const barEl = document.getElementById('ritualProgresoBarra');
  const lblEl = document.getElementById('ritualProgresoLabel');
  if (barEl) { barEl.style.width = pct+'%'; barEl.style.background = pct>=100?'#059669':pct>=50?'#D97706':'var(--rx-blue)'; }
  if (lblEl) lblEl.textContent = `${completados} / 10`;
}

function toggleRitual(num) {
  const semana = getSemanaKey();
  if (!MET.rituales[semana]) MET.rituales[semana] = {};
  MET.rituales[semana][num] = !MET.rituales[semana][num];
  renderRituales();
}

async function guardarRituales() {
  MET.objetivos.rituales = MET.rituales;
  try {
    await apiPost('/api/objetivos', { data: MET.objetivos });
    showToast('Rituales de la semana guardados ✓', 'success');
  } catch(e) { showToast(e.message, 'error'); }
}

// ═══════════════════════════════════════════════
// CAJA DIARIA
// ═══════════════════════════════════════════════
async function cargarCajaData() {
  try {
    const data = await apiGet('/api/planilla');
    const all = data.planilla || [];
    MET.caja = all.filter(x => x.tipo === 'caja');
    renderCajaHistorial();
    renderCajaDiariaResumen();
  } catch(e) {}
}

function abrirCargaCaja() {
  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('cajaFecha').value = hoy;
  ['cajaContactos','cajaSeguimientos','cajaReuniones','cajaPreListing','cajaOportunidades','cajaNuevos'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value = '0';
  });
  const obs = document.getElementById('cajaObservaciones'); if(obs) obs.value = '';
  abrirModal('modalCajaDiaria');
}

async function guardarCajaDiaria() {
  const entrada = {
    tipo: 'caja',
    fecha: document.getElementById('cajaFecha')?.value || new Date().toISOString().split('T')[0],
    contactos:     parseInt(document.getElementById('cajaContactos')?.value)||0,
    seguimientos:  parseInt(document.getElementById('cajaSeguimientos')?.value)||0,
    reuniones:     parseInt(document.getElementById('cajaReuniones')?.value)||0,
    pre_listing:   parseInt(document.getElementById('cajaPreListing')?.value)||0,
    oportunidades: parseInt(document.getElementById('cajaOportunidades')?.value)||0,
    nuevos:        parseInt(document.getElementById('cajaNuevos')?.value)||0,
    observaciones: document.getElementById('cajaObservaciones')?.value || '',
  };

  // Reemplazar o agregar
  const idx = MET.caja.findIndex(x => x.fecha === entrada.fecha);
  if (idx >= 0) MET.caja[idx] = entrada;
  else MET.caja.push(entrada);

  // Guardar todo (caja + planilla)
  const todosLosRegistros = [...MET.planilla, ...MET.caja];
  try {
    await apiPost('/api/planilla', { data: todosLosRegistros });
    cerrarModal('modalCajaDiaria');
    showToast('Día registrado ✓', 'success');
    renderCajaHistorial();
    renderCajaDiariaResumen();
  } catch(e) { showToast(e.message, 'error'); }
}

function cargarCajaHoy() {
  const hoy = new Date().toISOString().split('T')[0];
  const entradaHoy = MET.caja.find(x => x.fecha === hoy);
  if (entradaHoy) {
    document.getElementById('cajaFecha').value = entradaHoy.fecha;
    document.getElementById('cajaContactos').value = entradaHoy.contactos || 0;
    document.getElementById('cajaSeguimientos').value = entradaHoy.seguimientos || 0;
    document.getElementById('cajaReuniones').value = entradaHoy.reuniones || 0;
    document.getElementById('cajaPreListing').value = entradaHoy.pre_listing || 0;
    document.getElementById('cajaOportunidades').value = entradaHoy.oportunidades || 0;
    document.getElementById('cajaNuevos').value = entradaHoy.nuevos || 0;
    document.getElementById('cajaObservaciones').value = entradaHoy.observaciones || '';
    abrirModal('modalCajaDiaria');
  } else {
    abrirCargaCaja();
  }
}

function renderCajaDiariaResumen() {
  const el = document.getElementById('cajaDiariaResumen');
  if (!el) return;
  const hoy = new Date().toISOString().split('T')[0];
  const entrada = MET.caja.find(x => x.fecha === hoy);
  if (!entrada) {
    el.innerHTML = `<div style="grid-column:span 6;font-size:0.8rem;color:#aaa;padding:8px;">No registraste actividad hoy todavía. 📋</div>`;
    return;
  }
  const items = [
    { label:'Contactos',     val:entrada.contactos||0,     icon:'📞', color:'#2563EB' },
    { label:'Seguimientos',  val:entrada.seguimientos||0,  icon:'🔄', color:'#7C3AED' },
    { label:'Reuniones',     val:entrada.reuniones||0,     icon:'🤝', color:'#059669' },
    { label:'Pre-listings',  val:entrada.pre_listing||0,   icon:'📋', color:'#D97706' },
    { label:'Oportunidades', val:entrada.oportunidades||0, icon:'💡', color:'#DC2626' },
    { label:'Nuevos base',   val:entrada.nuevos||0,        icon:'➕', color:'#374151' },
  ];
  el.innerHTML = items.map(i => `
    <div class="stat-mini" style="border-left:3px solid ${i.color};padding:8px 10px;">
      <div style="font-size:0.62rem;color:${i.color};font-weight:600;text-transform:uppercase;">${i.icon} ${i.label}</div>
      <div style="font-size:1.3rem;font-weight:800;color:${i.color};">${i.val}</div>
    </div>`).join('');
}

function renderCajaHistorial() {
  const el = document.getElementById('cajaHistorial');
  if (!el) return;
  const datos = [...MET.caja].sort((a,b) => (b.fecha||'').localeCompare(a.fecha||'')).slice(0, 14);
  if (datos.length === 0) {
    el.innerHTML = `<div class="empty-state" style="font-size:0.82rem;">Registrá tu primer día para ver el historial.</div>`;
    return;
  }
  el.innerHTML = `
    <table class="table" style="font-size:0.8rem;">
      <thead><tr>
        <th>Fecha</th><th>Contactos</th><th>Seguim.</th><th>Reuniones</th><th>Pre-listing</th><th>Nuevos</th><th>Observaciones</th>
      </tr></thead>
      <tbody>
        ${datos.map(d => `
          <tr>
            <td style="font-weight:600;color:var(--rx-blue);">${formatFechaCaja(d.fecha)}</td>
            <td>${d.contactos||0}</td>
            <td>${d.seguimientos||0}</td>
            <td>${d.reuniones||0}</td>
            <td>${d.pre_listing||0}</td>
            <td>${d.nuevos||0}</td>
            <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#888;">${d.observaciones||'—'}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function formatFechaCaja(str) {
  if (!str) return '—';
  try {
    const d = new Date(str + 'T00:00:00');
    return d.toLocaleDateString('es-AR', { weekday:'short', day:'2-digit', month:'2-digit' });
  } catch(e) { return str; }
}

// ═══════════════════════════════════════════════
// PLANILLA SEMANAL
// ═══════════════════════════════════════════════
async function cargarPlanilla() {
  try {
    const data = await apiGet('/api/planilla');
    const all = data.planilla || [];
    MET.planilla = all.filter(x => x.tipo !== 'caja');
    renderPlanilla();
  } catch(e) { console.error(e); }
}

function renderPlanilla() {
  const container = document.getElementById('planillaTable');
  if (!container) return;

  // Totales
  const totalesEl = document.getElementById('planillaTotales');
  if (totalesEl && MET.planilla.length > 0) {
    const tot = {
      cara_a_cara: MET.planilla.reduce((s,x)=>s+(parseInt(x.cara_a_cara)||0),0),
      pre_listing: MET.planilla.reduce((s,x)=>s+(parseInt(x.pre_listing)||0),0),
      consultas:   MET.planilla.reduce((s,x)=>s+(parseInt(x.consultas)||0),0),
      visitas:     MET.planilla.reduce((s,x)=>s+(parseInt(x.visitas)||0),0),
      captaciones: MET.planilla.reduce((s,x)=>s+(parseInt(x.captaciones)||0),0),
      cierres:     MET.planilla.reduce((s,x)=>s+(parseInt(x.cierres)||0),0),
      comision:    MET.planilla.reduce((s,x)=>s+(parseFloat(x.comision)||0),0),
    };
    const benchmarks = { cara_a_cara:15*MET.planilla.length, pre_listing:3*MET.planilla.length, consultas:0, visitas:0, captaciones:0, cierres:0, comision:0 };
    totalesEl.innerHTML = [
      { label:'👥 Cara a cara', val:tot.cara_a_cara, bench:benchmarks.cara_a_cara, color:'#059669' },
      { label:'📋 Pre-listings', val:tot.pre_listing, bench:benchmarks.pre_listing, color:'#2563EB' },
      { label:'🔍 Consultas', val:tot.consultas, bench:0, color:'#7C3AED' },
      { label:'👁️ Visitas', val:tot.visitas, bench:0, color:'#D97706' },
      { label:'📦 Captaciones', val:tot.captaciones, bench:0, color:'#374151' },
      { label:'✅ Cierres', val:tot.cierres, bench:0, color:'#059669' },
      { label:'💰 Comisión USD', val:tot.comision, bench:0, color:'#DC2626', prefix:'USD ' },
    ].map(k => {
      const pct = k.bench > 0 ? Math.min(100,Math.round((k.val/k.bench)*100)) : null;
      return `
        <div class="stat-mini" style="border-left:4px solid ${k.color};">
          <div class="stat-mini-label" style="color:${k.color};">${k.label}</div>
          <div class="stat-mini-num" style="color:${k.color};">${k.prefix||''}${k.val.toLocaleString('es-AR')}</div>
          ${pct!==null?`<div style="font-size:0.65rem;color:${pct>=100?'#059669':'#D97706'};">${pct}% del obj.</div>`:''}
        </div>`;
    }).join('');
  }

  if (MET.planilla.length === 0) {
    container.innerHTML = `<div class="empty-state">No hay semanas cargadas. ¡Registrá tu primera semana!</div>`;
    return;
  }

  const OBJ_SEMANA = { cara_a_cara: 15, pre_listing: 3, contactos_nuevos: 2 };

  container.innerHTML = `
    <table class="table">
      <thead><tr>
        <th>Semana</th>
        <th>👥 Cara a cara<br><span style="font-size:0.65rem;color:#aaa;">obj:${OBJ_SEMANA.cara_a_cara}</span></th>
        <th>📋 Pre-listing<br><span style="font-size:0.65rem;color:#aaa;">obj:${OBJ_SEMANA.pre_listing}</span></th>
        <th>➕ Contactos nuevos<br><span style="font-size:0.65rem;color:#aaa;">obj:${OBJ_SEMANA.contactos_nuevos}</span></th>
        <th>🔍 Consultas</th>
        <th>👁️ Visitas</th>
        <th>📦 Captaciones</th>
        <th>✅ Cierres</th>
        <th>💰 Comisión</th>
        <th style="text-align:right">Acc.</th>
      </tr></thead>
      <tbody>
        ${MET.planilla.map((s, i) => {
          const semaforo_cac   = semaforo(s.cara_a_cara, OBJ_SEMANA.cara_a_cara);
          const semaforo_pl    = semaforo(s.pre_listing, OBJ_SEMANA.pre_listing);
          const semaforo_cn    = semaforo(s.contactos_nuevos, OBJ_SEMANA.contactos_nuevos);
          return `
            <tr>
              <td style="font-weight:600;font-size:0.82rem;">${escHtml(s.semana||'Sem '+(i+1))}</td>
              <td><span style="font-weight:700;color:${semaforo_cac.color};">${s.cara_a_cara||0}</span> ${semaforo_cac.icon}</td>
              <td><span style="font-weight:700;color:${semaforo_pl.color};">${s.pre_listing||0}</span> ${semaforo_pl.icon}</td>
              <td><span style="font-weight:700;color:${semaforo_cn.color};">${s.contactos_nuevos||0}</span> ${semaforo_cn.icon}</td>
              <td>${s.consultas||0}</td>
              <td>${s.visitas||0}</td>
              <td>${s.captaciones||0}</td>
              <td>${s.cierres||0}</td>
              <td>${s.comision?'USD '+parseFloat(s.comision).toLocaleString('es-AR'):'—'}</td>
              <td style="text-align:right;">
                <button class="btn-icon-sm danger" data-idx="${i}" onclick="eliminarSemana(this.dataset.idx)">🗑️</button>
              </td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>`;

  renderPlanillaChart();
}

function semaforo(val, obj) {
  const n = parseInt(val)||0;
  if (n >= obj) return { color:'#059669', icon:'✅' };
  if (n >= obj*0.6) return { color:'#D97706', icon:'⚠️' };
  return { color:'#DC2626', icon:'❌' };
}

function renderPlanillaChart() {
  const cardEl = document.getElementById('planillaChartCard');
  const canvas = document.getElementById('planillaChart');
  if (!canvas || !cardEl || MET.planilla.length < 2) { if(cardEl) cardEl.style.display='none'; return; }
  cardEl.style.display = '';
  if (MET.planillaChartInst) MET.planillaChartInst.destroy();
  MET.planillaChartInst = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: MET.planilla.map(s => s.semana||'—'),
      datasets: [
        { label:'Cara a cara', data: MET.planilla.map(s=>parseInt(s.cara_a_cara)||0), borderColor:'#059669', backgroundColor:'#05966922', tension:0.3, fill:true },
        { label:'Pre-listings', data: MET.planilla.map(s=>parseInt(s.pre_listing)||0), borderColor:'#2563EB', backgroundColor:'transparent', tension:0.3 },
        { label:'Consultas', data: MET.planilla.map(s=>parseInt(s.consultas)||0), borderColor:'#7C3AED', backgroundColor:'transparent', tension:0.3, borderDash:[4,4] },
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:true,
      plugins:{ legend:{ position:'bottom', labels:{ font:{ size:11 } } } },
      scales:{ y:{ beginAtZero:true }, x:{ grid:{ display:false } } }
    }
  });
}

function agregarSemana() {
  const hoy = new Date();
  const lunes = getInicioSemana(hoy);
  const semanaStr = `Sem del ${lunes.toLocaleDateString('es-AR',{day:'2-digit',month:'short'})}`;
  document.getElementById('semPeriodo').value = semanaStr;
  ['semCaraACara','semPreListing','semContactosNuevos','semConsultas','semVisitas','semCaptaciones','semCierres','semComision'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value='0';
  });
  const sem = document.getElementById('semSemaforo'); if(sem) sem.style.display='none';
  abrirModal('modalSemana');
}

async function guardarSemana() {
  const semana = {
    semana:           document.getElementById('semPeriodo')?.value || '',
    cara_a_cara:      parseInt(document.getElementById('semCaraACara')?.value)||0,
    pre_listing:      parseInt(document.getElementById('semPreListing')?.value)||0,
    contactos_nuevos: parseInt(document.getElementById('semContactosNuevos')?.value)||0,
    consultas:        parseInt(document.getElementById('semConsultas')?.value)||0,
    visitas:          parseInt(document.getElementById('semVisitas')?.value)||0,
    captaciones:      parseInt(document.getElementById('semCaptaciones')?.value)||0,
    cierres:          parseInt(document.getElementById('semCierres')?.value)||0,
    comision:         parseFloat(document.getElementById('semComision')?.value)||0,
  };
  MET.planilla.push(semana);
  const todosLosRegistros = [...MET.planilla, ...MET.caja];
  try {
    await apiPost('/api/planilla', { data: todosLosRegistros });
    cerrarModal('modalSemana');
    showToast('Semana guardada ✓', 'success');
    renderPlanilla();
  } catch(e) { showToast(e.message, 'error'); }
}

async function eliminarSemana(idx) {
  if (!confirmar('¿Eliminar esta semana?')) return;
  MET.planilla.splice(parseInt(idx), 1);
  const todosLosRegistros = [...MET.planilla, ...MET.caja];
  try {
    await apiPost('/api/planilla', { data: todosLosRegistros });
    showToast('Semana eliminada');
    renderPlanilla();
  } catch(e) { showToast(e.message, 'error'); }
}

// ═══════════════════════════════════════════════
// CALCULADORA NÚMERO CRÍTICO
// ═══════════════════════════════════════════════
function calcularNumeroCritico() {
  const facAnual   = parseFloat(document.getElementById('calcFacAnual')?.value)||0;
  const comision   = parseFloat(document.getElementById('calcComision')?.value)||0;
  const tasaCierre = parseFloat(document.getElementById('calcTasaCierre')?.value)||20;
  const tasaVisita = parseFloat(document.getElementById('calcTasaVisita')?.value)||30;
  const resEl = document.getElementById('calcResultado');
  const gridEl = document.getElementById('calcResultadoGrid');
  if (!facAnual || !comision || !resEl || !gridEl) return;

  const cierresAnual  = Math.ceil(facAnual / comision);
  const visitasAnual  = Math.ceil(cierresAnual / (tasaCierre/100));
  const consultasAnual= Math.ceil(visitasAnual / (tasaVisita/100));
  const cierresSemana = Math.ceil(cierresAnual / 52);
  const visitasSemana = Math.ceil(visitasAnual / 52);
  const consultasSemana=Math.ceil(consultasAnual / 52);
  const prelistingsSemana = Math.max(3, Math.ceil(cierresSemana * 3));
  const caraACaraSemana = Math.max(15, prelistingsSemana * 5);
  const caraACaraDia = Math.ceil(caraACaraSemana / 5);

  resEl.style.display = '';
  gridEl.innerHTML = [
    { label:'💰 Cierres/año', val:cierresAnual, desc:`USD ${comision.toLocaleString('es-AR')} c/u` },
    { label:'👁️ Visitas/año', val:visitasAnual, desc:`Conv. cierre ${tasaCierre}%` },
    { label:'🔍 Consultas/año', val:consultasAnual, desc:`Conv. visita ${tasaVisita}%` },
    { label:'✅ Cierres/semana', val:cierresSemana, desc:'número crítico', highlight:true },
    { label:'👁️ Visitas/semana', val:visitasSemana, desc:'número crítico', highlight:true },
    { label:'🔍 Consultas/semana', val:consultasSemana, desc:'número crítico', highlight:true },
    { label:'📋 Pre-listings/semana', val:prelistingsSemana, desc:`Viti mínimo: 3`, highlight:true },
    { label:'👥 Cara a cara/semana', val:caraACaraSemana, desc:`Viti mínimo: 15`, highlight:true },
    { label:'🗓️ Cara a cara/día', val:caraACaraDia, desc:'Viti: al menos 1 diario', highlight:true },
  ].map(k => `
    <div style="background:${k.highlight?'white':'#f8f9fa'};border-radius:8px;padding:10px 12px;border:${k.highlight?'1.5px solid #BFDBFE':'1px solid #e5e7eb'};">
      <div style="font-size:0.68rem;color:#888;font-weight:600;text-transform:uppercase;">${k.label}</div>
      <div style="font-size:1.5rem;font-weight:800;color:${k.highlight?'#1E40AF':'#374151'};">${k.val}</div>
      <div style="font-size:0.65rem;color:#aaa;">${k.desc}</div>
    </div>`).join('');
}

// ═══════════════════════════════════════════════
// FODA
// ═══════════════════════════════════════════════
async function cargarFoda() {
  try {
    const data = await apiGet('/api/objetivos');
    MET.foda = (data.objetivos||{}).foda || {};
    const campos = ['F','D','O','A'];
    campos.forEach(c => {
      const el = document.getElementById('foda'+c);
      if (el) el.value = MET.foda[c] || '';
    });
  } catch(e) {}
}

async function guardarFoda() {
  MET.foda = {
    F: document.getElementById('fodaF')?.value || '',
    D: document.getElementById('fodaD')?.value || '',
    O: document.getElementById('fodaO')?.value || '',
    A: document.getElementById('fodaA')?.value || '',
  };
  MET.objetivos.foda = MET.foda;
  try {
    await apiPost('/api/objetivos', { data: MET.objetivos });
    showToast('FODA guardado ✓', 'success');
  } catch(e) { showToast(e.message, 'error'); }
}

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════
function getInicioSemana(fecha) {
  const d = new Date(fecha);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

function getSemanaKey() {
  const lunes = getInicioSemana(new Date());
  return `semana_${lunes.toISOString().split('T')[0]}`;
}

function marcarTrimestresActivos() {
  const mes = new Date().getMonth() + 1;
  const trimActual = mes<=3?1:mes<=6?2:mes<=9?3:4;
  const COLORES = { 1:'#6B7280', 2:'#2563EB', 3:'#7C3AED', 4:'#059669' };
  const PCTS    = { 1:'17%', 2:'23%', 3:'25%', 4:'35%' };
  const MESES   = { 1:'Ene-Mar', 2:'Abr-Jun', 3:'Jul-Sep', 4:'Oct-Dic' };

  for (let i=1; i<=4; i++) {
    const el = document.getElementById(`trim${i}Card`);
    if (!el) continue;
    const esActual = i === trimActual;
    el.style.background = esActual ? COLORES[i]+'22' : '#f9fafb';
    el.style.border = esActual ? `2px solid ${COLORES[i]}` : '1px solid #e5e7eb';
    el.innerHTML = `
      <div style="font-size:0.65rem;font-weight:700;color:${COLORES[i]};">Q${i}${esActual?' ▶':''}</div>
      <div style="font-size:1rem;font-weight:800;color:${COLORES[i]};">${PCTS[i]}</div>
      <div style="font-size:0.6rem;color:#888;">${MESES[i]}</div>
      ${esActual?'<div style="font-size:0.58rem;color:'+COLORES[i]+';font-weight:700;margin-top:2px;">ACTUAL</div>':''}`;
  }

  // Texto estacionalidad
  const facAnual = parseFloat(MET.objetivos.anual?.facturacion||0);
  const estEl = document.getElementById('dashEstacionalidad');
  if (estEl) {
    const trimKey = ['Q1','Q2','Q3','Q4'][trimActual-1];
    const pctTrim = ESTACIONALIDAD[trimKey];
    const colTrim = COLORES[trimActual];
    estEl.innerHTML = `
      <span style="font-size:0.9rem;font-weight:700;color:${colTrim};">Q${trimActual} — ${PCTS[trimActual]} del año</span><br>
      <span style="font-size:0.78rem;color:#666;">Estás en el trimestre ${trimActual === 4 ? '🔥 más fuerte del año':'con potencial '+PCTS[trimActual]}</span>
      ${facAnual>0?`<br><span style="font-size:0.78rem;font-weight:600;color:${colTrim};">Objetivo Q${trimActual}: USD ${Math.round(facAnual*pctTrim).toLocaleString('es-AR')}</span>`:''}`;
  }
}
