"""
Blueprint: Firma Electrónica
Rutas: /api/documento, /api/documentos, /firmar/<doc_id>/<token>
Tablas: documents
"""
import os, uuid, json, base64, secrets, urllib.request, tempfile
from datetime import datetime
from io import BytesIO
from collections import defaultdict
from flask import Blueprint, request, jsonify, render_template, redirect, Response
from psycopg2.extras import RealDictCursor

# ReportLab
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.units import mm

bp = Blueprint('firma', __name__)

# ── Storage in-memory fallback ──
_documents = {}


def _get_connection():
    from app import get_connection
    return get_connection()

def _get_current_user():
    from app import get_current_user
    return get_current_user()

def _send_email(to_email, to_name, subject, html_body, attachment_pdf_bytes=None, attachment_name=None):
    api_key = os.environ.get('BREVO_API_KEY', '')
    if not api_key:
        print(f"[EMAIL] Sin BREVO_API_KEY. Para: {to_email}"); return False
    try:
        payload = {
            "sender": {"name": "Realvix CRM", "email": "realvixapp@gmail.com"},
            "to": [{"email": to_email, "name": to_name or to_email}],
            "subject": subject,
            "htmlContent": html_body
        }
        if attachment_pdf_bytes and attachment_name:
            payload["attachment"] = [{
                "name": attachment_name,
                "content": base64.b64encode(attachment_pdf_bytes).decode()
            }]
        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(
            'https://api.brevo.com/v3/smtp/email', data=data,
            headers={'api-key': api_key, 'Content-Type': 'application/json', 'Accept': 'application/json'})
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read())
            print(f"[EMAIL] OK → {to_email}"); return True
    except Exception as e:
        print(f"[EMAIL ERROR] {e}"); return False


def save_doc(doc_id, doc_data):
    conn = _get_connection()
    if not conn:
        _documents[doc_id] = doc_data; return
    try:
        cur = conn.cursor()
        cur.execute("INSERT INTO documents (id, data) VALUES (%s, %s) ON CONFLICT (id) DO UPDATE SET data=%s",
            (doc_id, json.dumps(doc_data), json.dumps(doc_data)))
        conn.commit(); cur.close(); conn.close()
    except Exception as e:
        print(f"[DB ERROR] save_doc: {e}"); _documents[doc_id] = doc_data

def get_doc(doc_id):
    conn = _get_connection()
    if not conn:
        return _documents.get(doc_id)
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT data FROM documents WHERE id=%s", (doc_id,))
        row = cur.fetchone(); cur.close(); conn.close()
        return row['data'] if row else None
    except Exception as e:
        return _documents.get(doc_id)


def generate_certificate_pdf(doc_data):
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    W, H = A4
    margin = 18*mm

    # ── Fondo general ──
    c.setFillColor(colors.HexColor('#f7f8fc'))
    c.rect(0, 0, W, H, fill=1, stroke=0)

    # ── Header: barra oscura con logo ──
    c.setFillColor(colors.HexColor('#0a0f2e'))
    c.rect(0, H-42*mm, W, 42*mm, fill=1, stroke=0)
    # línea azul accent bajo header
    c.setFillColor(colors.HexColor('#1B3FE4'))
    c.rect(0, H-44*mm, W, 2*mm, fill=1, stroke=0)

    # Logo text "Realvix CRM"
    c.setFont('Helvetica-Bold', 16)
    c.setFillColor(colors.white)
    c.drawString(margin, H-18*mm, 'Realvix')
    c.setFont('Helvetica', 10)
    c.setFillColor(colors.HexColor('#1B3FE4'))
    c.drawString(margin + 38*mm, H-18*mm, 'CRM')
    c.setFont('Helvetica', 7)
    c.setFillColor(colors.HexColor('#8899bb'))
    c.drawString(margin, H-25*mm, 'SISTEMA DE FIRMA ELECTRÓNICA')

    # Título centrado en header
    c.setFont('Helvetica-Bold', 14)
    c.setFillColor(colors.white)
    c.drawCentredString(W/2, H-16*mm, 'Certificado de Auditoría')
    c.drawCentredString(W/2, H-23*mm, 'de Firma Electrónica')

    # ── Ref + Emitido (bajo header) ──
    y = H - 54*mm
    ref = doc_data['id'].upper()
    emitido = datetime.now().strftime('%d/%m/%Y a las %H:%M:%S')
    c.setFont('Helvetica-Bold', 8); c.setFillColor(colors.HexColor('#333333'))
    c.drawString(margin, y, f'Ref:  {ref}')
    y -= 6*mm
    c.setFont('Helvetica', 8); c.setFillColor(colors.HexColor('#555555'))
    c.drawString(margin, y, f'Emitido el: {emitido}')
    y -= 8*mm

    # ── Tabla info principal ──
    sc = sum(1 for f in doc_data['firmantes'] if f['signed'])
    tot = len(doc_data['firmantes'])
    estado = 'Completado' if sc == tot else f'{sc} de {tot} firmantes'
    rows_info = [
        ('DOCUMENTO', doc_data.get('title', 'Sin nombre')),
        ('ESTADO', estado),
        ('FIRMANTES', str(tot)),
    ]
    row_h = 9*mm
    table_w = W - 2*margin
    for label, value in rows_info:
        c.setFillColor(colors.white)
        c.roundRect(margin, y - row_h, table_w, row_h, 1*mm, fill=1, stroke=0)
        c.setStrokeColor(colors.HexColor('#dde3f0'))
        c.setLineWidth(0.4)
        c.roundRect(margin, y - row_h, table_w, row_h, 1*mm, fill=0, stroke=1)
        c.setFont('Helvetica-Bold', 7); c.setFillColor(colors.HexColor('#7788aa'))
        c.drawString(margin + 4*mm, y - 5.5*mm, label)
        c.setFont('Helvetica', 9); c.setFillColor(colors.HexColor('#0f0f0f'))
        c.drawString(margin + 52*mm, y - 5.5*mm, value)
        y -= row_h + 1.5*mm

    y -= 6*mm

    # ── Título registro de firmas ──
    c.setFont('Helvetica-Bold', 8); c.setFillColor(colors.HexColor('#7788aa'))
    c.drawString(margin, y, 'REGISTRO DE FIRMAS')
    c.setStrokeColor(colors.HexColor('#dde3f0')); c.setLineWidth(0.5)
    c.line(margin + 43*mm, y + 1.5*mm, W - margin, y + 1.5*mm)
    y -= 7*mm

    # ── Bloque por firmante ──
    for f in doc_data['firmantes']:
        signed = f.get('signed', False)
        card_h = 32*mm if signed else 20*mm
        if y - card_h < 22*mm:
            # footer antes de nueva página
            _draw_cert_footer(c, W, margin)
            c.showPage()
            # fondo nueva página
            c.setFillColor(colors.HexColor('#f7f8fc'))
            c.rect(0, 0, W, H, fill=1, stroke=0)
            y = H - 18*mm

        # Tarjeta fondo
        c.setFillColor(colors.HexColor('#ffffff'))
        c.roundRect(margin, y - card_h, table_w, card_h, 2.5*mm, fill=1, stroke=0)
        # Borde izquierdo de color
        border_col = colors.HexColor('#1B3FE4') if signed else colors.HexColor('#aab0c0')
        c.setFillColor(border_col)
        c.rect(margin, y - card_h, 2*mm, card_h, fill=1, stroke=0)
        # Borde exterior sutil
        c.setStrokeColor(colors.HexColor('#dde3f0')); c.setLineWidth(0.4)
        c.roundRect(margin, y - card_h, table_w, card_h, 2.5*mm, fill=0, stroke=1)

        # Badge FIRMADO / PENDIENTE
        if signed:
            c.setFillColor(colors.HexColor('#1B3FE4'))
            badge_w = 22*mm; badge_h = 7*mm
            c.roundRect(W - margin - badge_w, y - 9*mm, badge_w, badge_h, 1.5*mm, fill=1, stroke=0)
            c.setFont('Helvetica-Bold', 7); c.setFillColor(colors.white)
            c.drawCentredString(W - margin - badge_w/2, y - 5.5*mm, 'FIRMADO')
        else:
            c.setFillColor(colors.HexColor('#e8ebf5'))
            badge_w = 24*mm; badge_h = 7*mm
            c.roundRect(W - margin - badge_w, y - 9*mm, badge_w, badge_h, 1.5*mm, fill=1, stroke=0)
            c.setFont('Helvetica-Bold', 7); c.setFillColor(colors.HexColor('#7788aa'))
            c.drawCentredString(W - margin - badge_w/2, y - 5.5*mm, 'PENDIENTE')

        # Nombre en negrita
        c.setFont('Helvetica-Bold', 11); c.setFillColor(colors.HexColor('#0a0f2e'))
        c.drawString(margin + 5*mm, y - 8.5*mm, f['name'])

        # Email
        c.setFont('Helvetica', 8); c.setFillColor(colors.HexColor('#555566'))
        c.drawString(margin + 5*mm, y - 14*mm, f.get('email', ''))

        if signed:
            dt_str = ''
            if f.get('signed_at'):
                try:
                    dt_obj = datetime.fromisoformat(f['signed_at'])
                    meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
                    dt_str = f"Firmado el {dt_obj.day} de {meses[dt_obj.month-1]} de {dt_obj.year} a las {dt_obj.strftime('%H:%M:%S')}"
                except:
                    dt_str = f"Firmado el {f['signed_at']}"
            c.setFont('Helvetica', 7.5); c.setFillColor(colors.HexColor('#333355'))
            c.drawString(margin + 5*mm, y - 19.5*mm, dt_str)
            ip_val = f.get('ip', 'N/D')
            c.setFont('Helvetica', 7); c.setFillColor(colors.HexColor('#7788aa'))
            c.drawString(margin + 5*mm, y - 24.5*mm, f'IP: {ip_val}')

            # Firma imagen
            if f.get('signature_dataurl'):
                try:
                    tmp = tempfile.NamedTemporaryFile(delete=False, suffix='.png')
                    tmp.write(base64.b64decode(f['signature_dataurl'].split(',')[1])); tmp.close()
                    sig_w = 38*mm; sig_h = 18*mm
                    c.drawImage(tmp.name, W - margin - badge_w - 5*mm - sig_w,
                                y - card_h + 3*mm, width=sig_w, height=sig_h,
                                preserveAspectRatio=True, mask='auto')
                    os.unlink(tmp.name)
                except: pass

        y -= card_h + 4*mm

    # ── Texto legal ──
    y -= 4*mm
    legal = ("Por medio del presente instrumento digital, los firmantes declaran bajo juramento ser autores "
             "del documento suscripto, reconociendo la plena validez jurídica de la firma electrónica "
             "incorporada. Este certificado valida la firma del documento especificado mediante los mecanismos "
             "de autenticación y cifrado utilizados conforme a la Ley N° 25.506 y sus Decretos Reglamentarios "
             "de la República Argentina.")
    from reportlab.lib.utils import simpleSplit
    lines = simpleSplit(legal, 'Helvetica', 7.5, table_w)
    c.setFont('Helvetica', 7.5); c.setFillColor(colors.HexColor('#555566'))
    for line in lines:
        if y < 22*mm:
            _draw_cert_footer(c, W, margin)
            c.showPage()
            c.setFillColor(colors.HexColor('#f7f8fc'))
            c.rect(0, 0, W, H, fill=1, stroke=0)
            y = H - 18*mm
        c.drawString(margin, y, line)
        y -= 4.5*mm

    # ── Footer ──
    _draw_cert_footer(c, W, margin)
    c.save()
    return buffer.getvalue()


def _draw_cert_footer(c, W, margin):
    from reportlab.lib import colors as _colors
    c.setFillColor(_colors.HexColor('#0a0f2e'))
    c.rect(0, 0, W, 14*mm, fill=1, stroke=0)
    c.setFillColor(_colors.HexColor('#1B3FE4'))
    c.rect(0, 14*mm, W, 0.8*mm, fill=1, stroke=0)
    c.setFont('Helvetica', 7); c.setFillColor(_colors.HexColor('#8899bb'))
    c.drawCentredString(W/2, 5.5*mm, 'www.realvix.com.ar')


def generate_full_pdf(doc_data):
    import io as _io
    pdf_b64 = doc_data.get('pdf_base64', '')
    firmantes = doc_data.get('firmantes', [])
    audit_bytes = generate_certificate_pdf(doc_data)
    if not pdf_b64:
        return audit_bytes
    try:
        import fitz
        doc_pdf = fitz.open(stream=base64.b64decode(pdf_b64), filetype="pdf")
        by_page = defaultdict(list)
        for f in firmantes:
            if f.get('sign_zone') and f.get('signed') and f.get('signature_dataurl'):
                by_page[f['sign_zone'].get('page', 1)].append(f)
        for page_num, pf in by_page.items():
            if page_num < 1 or page_num > len(doc_pdf): continue
            pg = doc_pdf[page_num-1]
            for firmante in pf:
                z = firmante['sign_zone']
                sx = pg.rect.width / z.get('canvasW', 1)
                sy = pg.rect.height / z.get('canvasH', 1)
                try:
                    img_bytes = base64.b64decode(firmante['signature_dataurl'].split(',')[1])
                    tmp = tempfile.NamedTemporaryFile(delete=False, suffix='.png')
                    tmp.write(img_bytes); tmp.close()
                    rect = fitz.Rect(z['x']*sx, z['y']*sy, (z['x']+z['w'])*sx, (z['y']+z['h'])*sy)
                    pg.insert_image(rect, filename=tmp.name, overlay=True)
                    os.unlink(tmp.name)
                except Exception as e:
                    print(f"[PDF EMBED] {e}")
        audit_doc = fitz.open(stream=audit_bytes, filetype="pdf")
        doc_pdf.insert_pdf(audit_doc); audit_doc.close()
        out = _io.BytesIO(); doc_pdf.save(out); doc_pdf.close()
        return out.getvalue()
    except Exception as e:
        print(f"[FULL PDF ERROR] {e}"); return audit_bytes


# ── RUTAS ──

@bp.route('/api/documento', methods=['POST'])
def crear_documento():
    user = _get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    title = request.form.get('title', 'Sin título')
    organizer_name = request.form.get('organizer_name', '')
    organizer_email = request.form.get('organizer_email', '')
    firmantes_raw = request.form.get('firmantes', '[]')
    firmantes_data = json.loads(firmantes_raw)
    pdf_file = request.files.get('pdf_file')
    pdf_base64 = ''
    if pdf_file:
        pdf_base64 = base64.b64encode(pdf_file.read()).decode()
    doc_id = str(uuid.uuid4())
    firmantes = []
    for f in firmantes_data:
        token = secrets.token_urlsafe(20)
        base_url = os.environ.get('BASE_URL', '').rstrip('/')
        sign_url = f"{base_url}/firmar/{doc_id}/{token}"
        firmantes.append({
            'name': f.get('name', ''),
            'email': f.get('email', ''),
            'token': token,
            'sign_url': sign_url,
            'sign_zone': f.get('sign_zone', None),
            'signed': False,
            'signed_at': None,
            'ip': None,
            'signature_dataurl': None,
        })
    doc = {
        'id': doc_id,
        'title': title,
        'organizer_name': organizer_name,
        'organizer_email': organizer_email,
        'pdf_base64': pdf_base64,
        'firmantes': firmantes,
        'created_at': datetime.now().isoformat(),
        'completado': False,
    }
    save_doc(doc_id, doc)

    EMAIL_HEADER = """<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');</style>
</head>
<body style="margin:0;padding:0;background:#eef0f7;font-family:'Inter','Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f7;padding:40px 0;">
  <tr><td align="center">
    <table width="540" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(27,63,228,0.10);">
      <tr><td style="background:#0a0f2e;padding:28px 36px 0 36px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td><span style="font-size:1.4rem;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Realvix</span><span style="font-size:1.4rem;color:#1B3FE4;font-weight:800;">.</span><span style="display:block;font-size:0.6rem;color:#5566aa;letter-spacing:3px;text-transform:uppercase;margin-top:2px;">CRM — Firma Electrónica</span></td>
          <td align="right"><span style="background:#1B3FE4;color:#fff;font-size:0.65rem;font-weight:700;letter-spacing:1.5px;padding:5px 10px;border-radius:6px;text-transform:uppercase;">✍️ Firma Requerida</span></td>
        </tr></table>
        <div style="height:3px;background:linear-gradient(90deg,#1B3FE4,#4466ff);margin-top:20px;"></div>
      </td></tr>"""

    for f in firmantes:
        if f['email']:
            html = EMAIL_HEADER + f"""
      <tr><td style="padding:36px 36px 28px;">
        <p style="margin:0 0 6px;font-size:0.82rem;color:#7788aa;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Hola,</p>
        <h2 style="margin:0 0 4px;font-size:1.5rem;font-weight:800;color:#0a0f2e;letter-spacing:-0.5px;">{f['name']}</h2>
        <p style="margin:0 0 24px;font-size:0.92rem;color:#556688;">Te solicitamos que firmes el siguiente documento:</p>
        
        <div style="background:#f0f4ff;border:1.5px solid #c4d0ff;border-radius:10px;padding:16px 20px;margin-bottom:28px;">
          <div style="font-size:0.7rem;color:#7788aa;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:5px;">DOCUMENTO</div>
          <div style="font-weight:700;font-size:1.05rem;color:#0a0f2e;">{title}</div>
          <div style="font-size:0.78rem;color:#7788aa;margin-top:4px;">Solicitado por <strong style="color:#0a0f2e;">{organizer_name or 'el organizador'}</strong></div>
        </div>

        <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
          <tr><td style="background:#1B3FE4;border-radius:10px;padding:0;">
            <a href="{f['sign_url']}" style="display:block;padding:15px 40px;color:#ffffff;font-weight:700;font-size:1rem;text-decoration:none;letter-spacing:0.3px;">✍️ &nbsp;Firmar documento ahora</a>
          </td></tr>
        </table>

        <div style="background:#f8f9fb;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
          <div style="font-size:0.7rem;color:#aabbcc;margin-bottom:4px;">Si el botón no funciona, copiá este link:</div>
          <div style="font-size:0.72rem;font-family:monospace;color:#7788aa;word-break:break-all;">{f['sign_url']}</div>
        </div>

        <div style="border-top:1px solid #eef0f7;padding-top:16px;">
          <p style="font-size:0.75rem;color:#aabbcc;margin:0;">Este mensaje fue enviado automáticamente por Realvix CRM. Si no esperabas este documento, podés ignorar este correo.</p>
        </div>
      </td></tr>
      <tr><td style="background:#0a0f2e;padding:16px 36px;text-align:center;">
        <p style="font-size:0.7rem;color:#4455aa;margin:0;letter-spacing:0.5px;">Realvix CRM — Sistema de Firma Electrónica</p>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>"""
            import threading
            threading.Thread(target=_send_email, args=(
                f["email"], f["name"], f"📄 Documento para firmar: {title}", html)).start()

    return jsonify({
        'doc_id': doc_id,
        'firmantes': [{'name': f['name'], 'email': f['email'],
                       'token': f['token'], 'sign_url': f['sign_url']} for f in firmantes]
    })


@bp.route('/api/documentos', methods=['GET'])
def listar_documentos():
    user = _get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    conn = _get_connection()
    if not conn:
        docs = list(_documents.values())
        for d in docs:
            d['completado'] = all(f['signed'] for f in d.get('firmantes', []))
        docs.sort(key=lambda x: x.get('created_at', ''), reverse=True)
        return jsonify({'documentos': docs})
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT id, data FROM documents ORDER BY created_at DESC")
        rows = cur.fetchall(); cur.close(); conn.close()
        docs = []
        for row in rows:
            d = row['data']
            d['completado'] = all(f['signed'] for f in d.get('firmantes', []))
            docs.append(d)
        return jsonify({'documentos': docs})
    except Exception as e:
        return jsonify({'documentos': []})


@bp.route('/api/documento/<doc_id>', methods=['DELETE'])
def eliminar_documento(doc_id):
    user = _get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    conn = _get_connection()
    if conn:
        try:
            cur = conn.cursor()
            cur.execute("DELETE FROM documents WHERE id=%s", (doc_id,))
            conn.commit(); cur.close(); conn.close()
        except Exception as e:
            print(f"[DB ERROR] eliminar: {e}")
    else:
        _documents.pop(doc_id, None)
    return jsonify({'ok': True})


@bp.route('/api/documento/<doc_id>/estado', methods=['GET'])
def estado_documento(doc_id):
    doc = get_doc(doc_id)
    if not doc:
        return jsonify({'error': 'No encontrado'}), 404
    firmantes = doc.get('firmantes', [])
    all_signed = all(f['signed'] for f in firmantes)
    return jsonify({'id': doc_id, 'title': doc.get('title'),
                    'firmantes': firmantes, 'all_signed': all_signed})


@bp.route('/firmar/<doc_id>/<token>')
def pagina_firmar(doc_id, token):
    doc = get_doc(doc_id)
    if not doc:
        return "Documento no encontrado", 404
    firmante = next((f for f in doc['firmantes'] if f['token'] == token), None)
    if not firmante:
        return "Link inválido", 404
    return render_template('firmar.html', doc=doc, firmante=firmante, doc_id=doc_id, token=token)


@bp.route('/api/firmar/<doc_id>/<token>', methods=['POST'])
def guardar_firma(doc_id, token):
    doc = get_doc(doc_id)
    if not doc:
        return jsonify({'error': 'Documento no encontrado'}), 404
    firmante = next((f for f in doc['firmantes'] if f['token'] == token), None)
    if not firmante:
        return jsonify({'error': 'Token inválido'}), 404
    if firmante['signed']:
        return jsonify({'error': 'Ya firmaste este documento'}), 400
    data = request.json or {}
    signature_dataurl = data.get('signature_dataurl', '')
    if not signature_dataurl:
        return jsonify({'error': 'Firma vacía'}), 400
    email_confirmado = data.get('email_confirmado', '').strip()
    if email_confirmado and firmante.get('email') and email_confirmado.lower() != firmante['email'].lower():
        return jsonify({'error': 'El email no coincide con el registrado'}), 400
    ip = request.headers.get('X-Forwarded-For', request.remote_addr)
    firmante['signed'] = True
    firmante['signed_at'] = datetime.now().isoformat()
    firmante['ip'] = ip
    firmante['signature_dataurl'] = signature_dataurl
    save_doc(doc_id, doc)
    all_signed = all(f['signed'] for f in doc['firmantes'])
    
    # Email de confirmación al firmante que acaba de firmar
    if firmante.get('email'):
        html_firmante = f"""<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#eef0f7;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f7;padding:40px 0;">
  <tr><td align="center">
    <table width="540" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(27,63,228,0.10);">
      <tr><td style="background:#0a0f2e;padding:28px 36px 0 36px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td><span style="font-size:1.4rem;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Realvix</span><span style="font-size:1.4rem;color:#1B3FE4;font-weight:800;">.</span><span style="display:block;font-size:0.6rem;color:#5566aa;letter-spacing:3px;text-transform:uppercase;margin-top:2px;">CRM — Firma Electrónica</span></td>
          <td align="right"><span style="background:#1B3FE4;color:#fff;font-size:0.65rem;font-weight:700;letter-spacing:1.5px;padding:5px 10px;border-radius:6px;text-transform:uppercase;">✅ Firmado</span></td>
        </tr></table>
        <div style="height:3px;background:linear-gradient(90deg,#1B3FE4,#4466ff);margin-top:20px;"></div>
      </td></tr>
      <tr><td style="padding:36px 36px 28px;">
        <p style="margin:0 0 6px;font-size:0.82rem;color:#7788aa;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Tu firma fue registrada</p>
        <h2 style="margin:0 0 4px;font-size:1.5rem;font-weight:800;color:#0a0f2e;letter-spacing:-0.5px;">Hola {firmante['name']},</h2>
        <p style="margin:0 0 24px;font-size:0.92rem;color:#556688;">Tu firma electrónica fue registrada exitosamente en el siguiente documento:</p>
        <div style="background:#f0f4ff;border:1.5px solid #c4d0ff;border-radius:10px;padding:16px 20px;margin-bottom:28px;">
          <div style="font-size:0.7rem;color:#7788aa;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:5px;">DOCUMENTO</div>
          <div style="font-weight:700;font-size:1.05rem;color:#0a0f2e;">{doc.get('title')}</div>
          <div style="font-size:0.78rem;color:#7788aa;margin-top:8px;">Firmado el {datetime.now().strftime('%d/%m/%Y a las %H:%M:%S')}</div>
        </div>
        <div style="border-top:1px solid #eef0f7;padding-top:16px;">
          <p style="font-size:0.75rem;color:#aabbcc;margin:0;">Recibirás una copia del documento completo una vez que todos los firmantes hayan completado el proceso.</p>
        </div>
      </td></tr>
      <tr><td style="background:#0a0f2e;padding:16px 36px;text-align:center;">
        <p style="font-size:0.7rem;color:#4455aa;margin:0;letter-spacing:0.5px;">Realvix CRM — Sistema de Firma Electrónica</p>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>"""
        import threading
        threading.Thread(target=_send_email, args=(
            firmante['email'], firmante['name'],
            f"✅ Firmaste: {doc.get('title')}", html_firmante)).start()

    if all_signed and doc.get('organizer_email'):
        pdf_bytes = generate_full_pdf(doc)
        html = f"""<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#eef0f7;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f7;padding:40px 0;">
  <tr><td align="center">
    <table width="540" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(27,63,228,0.10);">
      <tr><td style="background:#0a0f2e;padding:28px 36px 0 36px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td><span style="font-size:1.4rem;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Realvix</span><span style="font-size:1.4rem;color:#1B3FE4;font-weight:800;">.</span><span style="display:block;font-size:0.6rem;color:#5566aa;letter-spacing:3px;text-transform:uppercase;margin-top:2px;">CRM — Firma Electrónica</span></td>
          <td align="right"><span style="background:#1a9e5c;color:#fff;font-size:0.65rem;font-weight:700;letter-spacing:1.5px;padding:5px 10px;border-radius:6px;text-transform:uppercase;">✅ Completado</span></td>
        </tr></table>
        <div style="height:3px;background:linear-gradient(90deg,#1a9e5c,#2dce8a);margin-top:20px;"></div>
      </td></tr>
      <tr><td style="padding:36px 36px 28px;">
        <p style="margin:0 0 6px;font-size:0.82rem;color:#7788aa;text-transform:uppercase;letter-spacing:1px;font-weight:600;">¡Buenas noticias!</p>
        <h2 style="margin:0 0 4px;font-size:1.5rem;font-weight:800;color:#0a0f2e;letter-spacing:-0.5px;">Documento completado</h2>
        <p style="margin:0 0 24px;font-size:0.92rem;color:#556688;">Todos los firmantes completaron el documento. Te adjuntamos el PDF firmado con el certificado de auditoría.</p>
        <div style="background:#f0f4ff;border:1.5px solid #c4d0ff;border-radius:10px;padding:16px 20px;margin-bottom:28px;">
          <div style="font-size:0.7rem;color:#7788aa;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:5px;">DOCUMENTO</div>
          <div style="font-weight:700;font-size:1.05rem;color:#0a0f2e;">{doc.get('title')}</div>
        </div>
        <div style="border-top:1px solid #eef0f7;padding-top:16px;">
          <p style="font-size:0.75rem;color:#aabbcc;margin:0;">Adjunto encontrarás el documento firmado con el certificado de auditoría de firmas.</p>
        </div>
      </td></tr>
      <tr><td style="background:#0a0f2e;padding:16px 36px;text-align:center;">
        <p style="font-size:0.7rem;color:#4455aa;margin:0;letter-spacing:0.5px;">Realvix CRM — Sistema de Firma Electrónica</p>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>"""
        import threading
        threading.Thread(target=_send_email, args=(
            doc['organizer_email'], doc.get('organizer_name', ''),
            f"✅ Firmado: {doc.get('title')}", html,
            pdf_bytes, f"documento-firmado-{doc_id[:8]}.pdf"
        )).start()
        # Copia a cada firmante
        for cada_f in doc['firmantes']:
            if cada_f.get('email'):
                html_copia = f"""<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#eef0f7;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f7;padding:40px 0;">
  <tr><td align="center">
    <table width="540" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(27,63,228,0.10);">
      <tr><td style="background:#0a0f2e;padding:28px 36px 0 36px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td><span style="font-size:1.4rem;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Realvix</span><span style="font-size:1.4rem;color:#1B3FE4;font-weight:800;">.</span><span style="display:block;font-size:0.6rem;color:#5566aa;letter-spacing:3px;text-transform:uppercase;margin-top:2px;">CRM — Firma Electrónica</span></td>
          <td align="right"><span style="background:#1a9e5c;color:#fff;font-size:0.65rem;font-weight:700;letter-spacing:1.5px;padding:5px 10px;border-radius:6px;text-transform:uppercase;">📄 Copia firmada</span></td>
        </tr></table>
        <div style="height:3px;background:linear-gradient(90deg,#1a9e5c,#2dce8a);margin-top:20px;"></div>
      </td></tr>
      <tr><td style="padding:36px 36px 28px;">
        <p style="margin:0 0 6px;font-size:0.82rem;color:#7788aa;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Copia para tus registros</p>
        <h2 style="margin:0 0 4px;font-size:1.5rem;font-weight:800;color:#0a0f2e;letter-spacing:-0.5px;">Hola {cada_f['name']},</h2>
        <p style="margin:0 0 24px;font-size:0.92rem;color:#556688;">Todos los firmantes completaron el documento. Te adjuntamos una copia firmada para tus registros.</p>
        <div style="background:#f0f4ff;border:1.5px solid #c4d0ff;border-radius:10px;padding:16px 20px;margin-bottom:28px;">
          <div style="font-size:0.7rem;color:#7788aa;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:5px;">DOCUMENTO</div>
          <div style="font-weight:700;font-size:1.05rem;color:#0a0f2e;">{doc.get('title')}</div>
        </div>
        <div style="border-top:1px solid #eef0f7;padding-top:16px;">
          <p style="font-size:0.75rem;color:#aabbcc;margin:0;">Este documento tiene validez legal conforme a la Ley N° 25.506 de Firma Digital de la República Argentina.</p>
        </div>
      </td></tr>
      <tr><td style="background:#0a0f2e;padding:16px 36px;text-align:center;">
        <p style="font-size:0.7rem;color:#4455aa;margin:0;letter-spacing:0.5px;">Realvix CRM — Sistema de Firma Electrónica</p>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>"""
                threading.Thread(target=_send_email, args=(
                    cada_f['email'], cada_f['name'],
                    f"✅ Copia firmada: {doc.get('title')}", html_copia,
                    pdf_bytes, f"documento-firmado-{doc_id[:8]}.pdf"
                )).start()
    signed_count = sum(1 for f in doc['firmantes'] if f['signed'])
    total = len(doc['firmantes'])
    return jsonify({'ok': True, 'all_signed': all_signed, 'signed_count': signed_count, 'total': total})


@bp.route('/api/documento/<doc_id>/certificado')
def descargar_certificado(doc_id):
    user = _get_current_user()
    if not user: return redirect('/login')
    doc = get_doc(doc_id)
    if not doc:
        return "No encontrado", 404
    pdf_bytes = generate_full_pdf(doc)
    resp = Response(pdf_bytes, mimetype='application/pdf')
    resp.headers['Content-Disposition'] = f'attachment; filename="firmado-{doc_id[:8]}.pdf"'
    return resp


@bp.route('/estado/<doc_id>')
def pagina_estado(doc_id):
    user = _get_current_user()
    if not user: return redirect('/login')
    return redirect(f'/firma?doc={doc_id}')
