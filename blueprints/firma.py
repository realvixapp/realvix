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
    c.setFillColor(colors.HexColor('#0f0f0f'))
    c.rect(0, H-55*mm, W, 55*mm, fill=1, stroke=0)
    c.setFillColor(colors.HexColor('#1B3FE4'))
    c.rect(0, H-57*mm, W, 2*mm, fill=1, stroke=0)
    c.setFillColor(colors.HexColor('#faf8f4'))
    c.setFont('Helvetica-Bold', 20)
    c.drawString(18*mm, H-22*mm, 'Certificado de Firma Electrónica')
    c.setFont('Helvetica', 8); c.setFillColor(colors.HexColor('#888888'))
    c.drawString(18*mm, H-31*mm, f"Ref: {doc_data['id'].upper()}")
    c.drawString(18*mm, H-37*mm, f"Emitido: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")
    y = H-68*mm

    def draw_row(label, value):
        nonlocal y
        c.setFont('Helvetica-Bold', 7); c.setFillColor(colors.HexColor('#888888'))
        c.drawString(18*mm, y, label.upper())
        c.setFont('Helvetica', 10); c.setFillColor(colors.HexColor('#0f0f0f'))
        c.drawString(58*mm, y, str(value))
        y -= 5*mm; c.setStrokeColor(colors.HexColor('#e8e4dc'))
        c.line(18*mm, y, W-18*mm, y); y -= 4*mm

    draw_row('Documento', doc_data.get('title', 'Sin nombre'))
    sc = sum(1 for f in doc_data['firmantes'] if f['signed'])
    tot = len(doc_data['firmantes'])
    draw_row('Estado', 'Completado' if sc == tot else f'{sc} de {tot}')
    draw_row('Firmantes', str(tot))
    y -= 4*mm
    c.setFont('Helvetica-Bold', 7); c.setFillColor(colors.HexColor('#888888'))
    c.drawString(18*mm, y, 'REGISTRO DE FIRMAS'); y -= 8*mm

    for f in doc_data['firmantes']:
        ch = 28*mm if f['signed'] else 18*mm
        if y - ch < 20*mm:
            c.showPage(); y = H-20*mm
        c.setFillColor(colors.HexColor('#f0faf4') if f['signed'] else colors.HexColor('#fff8e1'))
        c.roundRect(18*mm, y-ch, W-36*mm, ch, 3*mm, fill=1, stroke=0)
        c.setStrokeColor(colors.HexColor('#52b788') if f['signed'] else colors.HexColor('#1B3FE4'))
        c.setLineWidth(0.5)
        c.roundRect(18*mm, y-ch, W-36*mm, ch, 3*mm, fill=0, stroke=1)
        c.setFont('Helvetica-Bold', 11); c.setFillColor(colors.HexColor('#0f0f0f'))
        c.drawString(22*mm, y-8*mm, f['name'])
        c.setFont('Helvetica', 8); c.setFillColor(colors.HexColor('#666666'))
        c.drawString(22*mm, y-13*mm, f['email'])
        if f['signed']:
            dt = datetime.fromisoformat(f['signed_at']).strftime('%d/%m/%Y %H:%M:%S')
            c.setFont('Helvetica', 7); c.setFillColor(colors.HexColor('#2d6a4f'))
            c.drawString(22*mm, y-19*mm, f"Firmado el {dt}")
            c.drawString(22*mm, y-24*mm, f"IP: {f.get('ip','N/D')}")
            if f.get('signature_dataurl'):
                try:
                    tmp = tempfile.NamedTemporaryFile(delete=False, suffix='.png')
                    tmp.write(base64.b64decode(f['signature_dataurl'].split(',')[1])); tmp.close()
                    c.drawImage(tmp.name, W-65*mm, y-ch+2*mm, width=42*mm, height=22*mm,
                                preserveAspectRatio=True, mask='auto')
                    os.unlink(tmp.name)
                except: pass
            c.setFillColor(colors.HexColor('#2d6a4f'))
            c.roundRect(W-50*mm, y-13*mm, 18*mm, 6*mm, 1.5*mm, fill=1, stroke=0)
            c.setFont('Helvetica-Bold', 6); c.setFillColor(colors.white)
            c.drawCentredString(W-41*mm, y-10*mm, 'FIRMADO')
        else:
            c.setFillColor(colors.HexColor('#1B3FE4'))
            c.roundRect(W-50*mm, y-13*mm, 24*mm, 6*mm, 1.5*mm, fill=1, stroke=0)
            c.setFont('Helvetica-Bold', 6); c.setFillColor(colors.white)
            c.drawCentredString(W-38*mm, y-10*mm, 'PENDIENTE')
        y -= ch + 4*mm

    c.setFillColor(colors.HexColor('#f8f8f8')); c.rect(0, 0, W, 14*mm, fill=1, stroke=0)
    c.setStrokeColor(colors.HexColor('#d4c9b8')); c.line(0, 14*mm, W, 14*mm)
    c.setFont('Helvetica', 7); c.setFillColor(colors.HexColor('#999999'))
    c.drawString(18*mm, 6*mm, 'Realvix CRM — Sistema de Firma Electrónica')
    c.drawRightString(W-18*mm, 6*mm, f"Ref: {doc_data['id'].upper()}")
    c.save()
    return buffer.getvalue()


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

    EMAIL_HEADER = """<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f1eb;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1eb;padding:32px 0;">
  <tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
      <tr><td style="background:#0f0f0f;padding:24px 32px;border-bottom:3px solid #1B3FE4;">
        <div style="font-family:'Inter',Arial,sans-serif;font-size:1.3rem;font-weight:700;color:#ffffff;">Realvix<span style="color:#1B3FE4;">.</span></div>
        <div style="font-size:0.65rem;color:#888;letter-spacing:2px;text-transform:uppercase;margin-top:3px;">Sistema de Firma Electrónica</div>
      </td></tr>"""

    for f in firmantes:
        if f['email']:
            html = EMAIL_HEADER + f"""
      <tr><td style="padding:32px;">
        <h2 style="margin:0 0 8px;font-family:Georgia,serif;font-size:1.4rem;color:#0f0f0f;">Tenés un documento para firmar</h2>
        <p style="color:#666;font-size:0.9rem;margin:0 0 24px;">Hola <strong style="color:#0f0f0f;">{f['name']}</strong>,</p>
        <p style="color:#555;font-size:0.9rem;margin:0 0 16px;"><strong style="color:#0f0f0f;">{organizer_name or 'El organizador'}</strong> te solicita que firmes el siguiente documento:</p>
        <div style="background:#EEF2FF;border-left:4px solid #1B3FE4;border-radius:6px;padding:14px 18px;margin:0 0 24px;">
          <div style="font-weight:700;font-size:1rem;color:#0f0f0f;">{title}</div>
        </div>
        <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
          <tr><td style="background:#1B3FE4;border-radius:8px;padding:14px 32px;">
            <a href="{f['sign_url']}" style="color:#ffffff;font-weight:700;font-size:0.95rem;text-decoration:none;display:block;">✍️ Firmar ahora</a>
          </td></tr>
        </table>
        <p style="font-size:0.78rem;color:#aaa;margin:0 0 8px;">Si el botón no funciona, copiá y pegá este link en tu navegador:</p>
        <p style="font-size:0.75rem;font-family:monospace;color:#888;background:#f8f8f8;padding:10px 12px;border-radius:6px;word-break:break-all;margin:0;">{f['sign_url']}</p>
      </td></tr>
      <tr><td style="background:#f8f7f4;border-top:1px solid #e8e4dc;padding:16px 32px;text-align:center;">
        <p style="font-size:0.72rem;color:#bbb;margin:0;">Realvix CRM — Sistema de Firma Electrónica</p>
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
    if all_signed and doc.get('organizer_email'):
        pdf_bytes = generate_full_pdf(doc)
        html = f"""<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f1eb;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 0;">
  <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;">
    <tr><td style="background:#0f0f0f;padding:24px 32px;border-bottom:3px solid #1B3FE4;">
      <div style="font-weight:700;font-size:1.3rem;color:#fff;">Realvix<span style="color:#1B3FE4;">.</span></div>
    </td></tr>
    <tr><td style="padding:32px;text-align:center;">
      <div style="font-size:2rem;margin-bottom:12px;">✅</div>
      <h2 style="margin:0 0 8px;font-size:1.4rem;color:#0f0f0f;">Documento completado</h2>
      <p style="color:#666;font-size:0.9rem;margin:0 0 24px;">Todos los firmantes completaron el documento</p>
      <div style="background:#EEF2FF;border-left:4px solid #1B3FE4;border-radius:6px;padding:14px 18px;text-align:left;">
        <div style="font-weight:700;font-size:1rem;color:#0f0f0f;">{doc.get('title')}</div>
      </div>
    </td></tr>
    <tr><td style="background:#f8f7f4;border-top:1px solid #e8e4dc;padding:16px 32px;text-align:center;">
      <p style="font-size:0.72rem;color:#bbb;margin:0;">Realvix CRM — Sistema de Firma Electrónica</p>
    </td></tr>
  </table>
</td></tr></table></body></html>"""
        import threading
        # Enviar a cada firmante con el documento firmado adjunto
        for f_send in doc['firmantes']:
            if f_send.get('email'):
                html_firmante = f"""<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f1eb;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 0;">
  <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;">
    <tr><td style="background:#0f0f0f;padding:24px 32px;border-bottom:3px solid #1B3FE4;">
      <div style="font-weight:700;font-size:1.3rem;color:#fff;">Realvix<span style="color:#1B3FE4;">.</span></div>
    </td></tr>
    <tr><td style="padding:32px;text-align:center;">
      <div style="font-size:2rem;margin-bottom:12px;">✅</div>
      <h2 style="margin:0 0 8px;font-size:1.4rem;color:#0f0f0f;">Documento completado</h2>
      <p style="color:#666;font-size:0.9rem;margin:0 0 8px;">Hola <strong style="color:#0f0f0f;">{f_send['name']}</strong>,</p>
      <p style="color:#666;font-size:0.9rem;margin:0 0 24px;">Todos los firmantes completaron el documento. Te adjuntamos una copia firmada para tus registros.</p>
      <div style="background:#EEF2FF;border-left:4px solid #1B3FE4;border-radius:6px;padding:14px 18px;text-align:left;">
        <div style="font-weight:700;font-size:1rem;color:#0f0f0f;">{doc.get('title')}</div>
      </div>
    </td></tr>
    <tr><td style="background:#f8f7f4;border-top:1px solid #e8e4dc;padding:16px 32px;text-align:center;">
      <p style="font-size:0.72rem;color:#bbb;margin:0;">Realvix CRM — Sistema de Firma Electrónica</p>
    </td></tr>
  </table>
</td></tr></table></body></html>"""
                threading.Thread(target=_send_email, args=(
                    f_send['email'], f_send['name'],
                    f"✅ Copia firmada: {doc.get('title')}", html_firmante,
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
