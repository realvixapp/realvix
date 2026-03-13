/**
 * asistente.js — Chat IA con contexto del negocio
 */
const CHAT = { historial: [] };

async function initAsistente() {
  // Cargar contexto del negocio para el sistema
  CHAT.historial = [];
}

async function enviarMensaje() {
  const input = document.getElementById('chatInput');
  const msg = (input?.value || '').trim();
  if (!msg) return;
  input.value = '';

  agregarBurbuja('user', msg);
  CHAT.historial.push({ role: 'user', content: msg });

  const sendBtn = document.getElementById('chatSend');
  if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = '...'; }

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: CHAT.historial })
    });
    const data = await res.json();
    const respuesta = data.reply || data.message || 'Sin respuesta';
    agregarBurbuja('assistant', respuesta);
    CHAT.historial.push({ role: 'assistant', content: respuesta });
  } catch (e) {
    agregarBurbuja('assistant', 'Error al conectar con el asistente. Intentá de nuevo.');
  } finally {
    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Enviar'; }
  }
}

function agregarBurbuja(rol, texto) {
  const container = document.getElementById('chatMessages');
  if (!container) return;
  const esUser = rol === 'user';
  const div = document.createElement('div');
  div.style.cssText = `display:flex;justify-content:${esUser ? 'flex-end' : 'flex-start'};`;
  div.innerHTML = `
    <div style="max-width:75%;padding:10px 14px;border-radius:${esUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px'};background:${esUser ? 'var(--rx-blue)' : 'white'};color:${esUser ? 'white' : 'var(--text-primary)'};font-size:0.85rem;line-height:1.5;border:${esUser ? 'none' : '1px solid var(--border)'};box-shadow:var(--shadow-sm);">
      ${escHtml(texto).replace(/\n/g, '<br>')}
    </div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}
