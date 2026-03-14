"""
appfirma/app.py
Blueprint de Firma Electrónica
- Emails via Brevo (BREVO_API_KEY en env)
- PDF con firma incrustada en zona exacta (PyMuPDF)
- Certificado de auditoría al final del PDF
- Descarga con nombre del documento
"""

import base64, json, secrets, uuid, os, re, urllib.request, urllib.error
from datetime import datetime
from io import BytesIO

from flask import Blueprint, request, jsonify, render_template, redirect, send_file
from psycopg2.extras import RealDictCursor

bp = Blueprint('firma', __name__, template_folder='templates', static_folder='static')

def _db():
    from app import get_connection, get_current_user
    return get_connection, get_current_user


# ══════════════════════════
#  EMAIL — BREVO
# ══════════════════════════

def _send_email(to_email, to_name, subject, html, attachments=None):
    api_key = os.environ.get('BREVO_API_KEY', '')
    if not api_key:
        print('[EMAIL] Sin BREVO_API_KEY')
        return False
    from_email = os.environ.get('MAIL_FROM', 'noreply@realvix.com')
    from_name  = os.environ.get('MAIL_FROM_NAME', 'Realvix Firma')
    payload = {
        'sender':      {'email': from_email, 'name': from_name},
        'to':          [{'email': to_email, 'name': to_name or to_email}],
        'subject':     subject,
        'htmlContent': html,
    }
    if attachments:
        payload['attachment'] = attachments
    body = json.dumps(payload).encode('utf-8')
    req  = urllib.request.Request(
        'https://api.brevo.com/v3/smtp/email',
        data=body,
        headers={'api-key': api_key, 'Content-Type': 'application/json', 'Accept': 'application/json'},
        method='POST'
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            print(f'[EMAIL] OK → {to_email} | {resp.status}')
            return True
    except urllib.error.HTTPError as e:
        print(f'[EMAIL] HTTP {e.code} → {to_email}: {e.read().decode()}')
        return False
    except Exception as e:
        print(f'[EMAIL] Error → {to_email}: {e}')
        return False


def _email_invitacion(firmante, doc_title, organizer_name):
    """Email al firmante con su link personal."""
    nombre = firmante.get('name') or firmante.get('email', '')
    link   = firmante.get('sign_url', '')
    html = f"""
<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#fff;">
  <div style="font-size:2.2rem;margin-bottom:10px;">✍️</div>
  <h2 style="font-size:1.25rem;color:#0f0f0f;margin:0 0 8px 0;">{organizer_name} te envió un documento para firmar</h2>
  <p style="color:#555;font-size:0.9rem;margin:0 0 24px 0;"><strong>{doc_title}</strong></p>
  <a href="{link}" style="display:inline-block;background:#1B3FE4;color:#fff;padding:13px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:0.95rem;">Firmar documento →</a>
  <p style="color:#888;font-size:0.78rem;margin-top:20px;">O copiá este link:<br><span style="color:#1B3FE4;">{link}</span></p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="color:#aaa;font-size:0.72rem;">Al firmar confirmás haber leído y aceptado el contenido del documento.</p>
</div>"""
    _send_email(firmante['email'], nombre, f'Documento para firmar: {doc_title}', html)


def _email_firma_recibida(organizer_email, organizer_name, firmante_name, doc_title, firmados, total):
    """Email al organizador cuando alguien firma."""
    html = f"""
<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#fff;">
  <div style="font-size:2rem;margin-bottom:8px;">✅</div>
  <h2 style="font-size:1.2rem;color:#0f0f0f;margin:0 0 8px 0;">{firmante_name} firmó el documento</h2>
  <p style="color:#555;font-size:0.9rem;"><strong>{doc_title}</strong></p>
  <div style="background:#f0faf4;border:1px solid #A7F3D0;border-radius:8px;padding:14px 18px;margin:20px 0;">
    <strong style="color:#065F46;">Progreso: {firmados} de {total} firmas completadas</strong>
  </div>
  {'<p style="color:#555;font-size:0.85rem;">Cuando todos firmen recibirás el documento completo con el certificado adjunto.</p>' if firmados < total else ''}
</div>"""
    _send_email(organizer_email, organizer_name,
                f'Nueva firma recibida: {doc_title} ({firmados}/{total})', html)


def _email_completado(doc, pdf_bytes):
    """Email a todos cuando completan con el PDF firmado adjunto."""
    doc_title      = doc.get('title', 'Documento')
    organizer_name = doc.get('organizer_name', '')
    firmantes      = doc.get('firmantes', [])
    completed_at   = doc.get('completed_at', '')[:16].replace('T', ' ')
    safe_name      = re.sub(r'[^\w\s-]', '', doc_title).strip().replace(' ', '_')
    filename       = f"{safe_name}_firmado.pdf"
    attachment     = [{'name': filename, 'content': base64.b64encode(pdf_bytes).decode('utf-8')}]

    firmantes_html = ''.join(
        f'<li style="margin-bottom:4px;color:#374151;"><strong>{f.get("name") or f.get("email","")}</strong>'
        f' — {f.get("email","")} <span style="color:#065F46;">✅ {(f.get("signed_at","")[:16] or "").replace("T"," ")}</span></li>'
        for f in firmantes
    )
    html = f"""
<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#fff;">
  <div style="font-size:2.5rem;margin-bottom:8px;">🎉</div>
  <h2 style="font-size:1.3rem;color:#0f0f0f;margin:0 0 8px 0;">¡Todos firmaron!</h2>
  <p style="color:#555;font-size:0.9rem;margin:0 0 20px 0;"><strong>{doc_title}</strong></p>
  <div style="background:#f0faf4;border:1px solid #A7F3D0;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
    <p style="margin:0 0 10px 0;font-weight:600;color:#065F46;">Firmantes:</p>
    <ul style="margin:0;padding-left:18px;">{firmantes_html}</ul>
    <p style="margin:10px 0 0 0;font-size:0.78rem;color:#6B7280;">Completado el {completed_at}</p>
  </div>
  <p style="color:#555;font-size:0.85rem;">Encontrás el documento firmado con el certificado de auditoría adjunto a este email.</p>
</div>"""

    # Al organizador
    org_email = doc.get('organizer_email', '')
    if org_email:
        _send_email(org_email, organizer_name, f'✅ Documento completado: {doc_title}', html, attachment)
    # A cada firmante
    for f in firmantes:
        _send_email(f['email'], f.get('name') or f['email'],
                    f'✅ Documento completado: {doc_title}', html, attachment)


# ══════════════════════════
#  PDF — FIRMAS + CERTIFICADO
# ══════════════════════════

def _generar_pdf_firmado(doc):
    """
    Incrusta las firmas en las zonas marcadas y agrega
    una página de certificado de auditoría al final.
    """
    try:
        import fitz

    except ImportError as e:
        print(f'[PDF] Import error: {e}')
        return None

    pdf_b64 = doc.get('pdf_base64')
    if not pdf_b64:
        return None

    try:
        pdf_doc = fitz.open(stream=base64.b64decode(pdf_b64), filetype='pdf')
    except Exception as e:
        print(f'[PDF] Error abriendo PDF: {e}')
        return None

    firmantes = doc.get('firmantes', [])

    # ── Incrustar cada firma en su zona ──
    for f in firmantes:
        if not f.get('signed') or not f.get('signature') or not f.get('sign_zone'):
            continue
        zona = f['sign_zone']
        try:
            page_num  = int(zona.get('page', 1)) - 1
            page_num  = max(0, min(page_num, pdf_doc.page_count - 1))
            page      = pdf_doc[page_num]
            pw, ph    = page.rect.width, page.rect.height
            cw        = float(zona.get('canvasW', 1))
            ch        = float(zona.get('canvasH', 1))
            x0 = pw * float(zona['x']) / cw
            y0 = ph * float(zona['y']) / ch
            x1 = x0 + pw * float(zona['w']) / cw
            y1 = y0 + ph * float(zona['h']) / ch

            sig_data  = f['signature']
            if ',' in sig_data:
                sig_data = sig_data.split(',', 1)[1]
            page.insert_image(fitz.Rect(x0, y0, x1, y1),
                              stream=base64.b64decode(sig_data),
                              keep_proportion=True)

            # Etiqueta debajo de la firma
            signed_at = (f.get('signed_at', '')[:16] or '').replace('T', ' ')
            label     = f"{f.get('name') or f.get('email', '')} — {signed_at}"
            page.insert_text(fitz.Point(x0, y1 + 10), label,
                             fontsize=7, color=(0.4, 0.4, 0.4))
        except Exception as e:
            print(f'[PDF] Firma {f.get("email")}: {e}')

    # ── Certificado de auditoría (100% PyMuPDF) ──
    try:
        cert_doc  = fitz.open()
        cert_page = cert_doc.new_page(width=595, height=842)
        W, H      = 595, 842
        BLUE      = (0.106, 0.247, 0.894)
        BLUE_DARK = (0.08,  0.13,  0.30)
        WHITE     = (1.0,   1.0,   1.0)
        DARK      = (0.1,   0.1,   0.1)
        GRAY      = (0.45,  0.45,  0.45)
        LGRAY     = (0.82,  0.82,  0.82)
        BLUE_LT   = (0.93,  0.95,  0.99)

        def _t(page, x, y, text, size=9, color=DARK, bold=False):
            safe = str(text).encode('latin-1', errors='replace').decode('latin-1')
            page.insert_text(fitz.Point(x, y), safe,
                             fontname='hebo' if bold else 'helv',
                             fontsize=size, color=color)

        def _r(page, x0, y0, x1, y1, fill, stroke=None, sw=0.5):
            s = page.new_shape()
            s.draw_rect(fitz.Rect(x0, y0, x1, y1))
            s.finish(fill=fill, color=stroke, width=sw if stroke else 0)
            s.commit()

        def _l(page, x0, y0, x1, y1, color=LGRAY, w=0.5):
            s = page.new_shape()
            s.draw_line(fitz.Point(x0, y0), fitz.Point(x1, y1))
            s.finish(color=color, width=w)
            s.commit()

        # Fondo blanco
        _r(cert_page, 0, 0, W, H, WHITE)

        # Logo Realvix - rombo azul + texto
        sq = cert_page.new_shape()
        cx, cy, rr = 50, 36, 8
        sq.draw_quad(fitz.Quad(
            fitz.Point(cx, cy-rr), fitz.Point(cx+rr, cy),
            fitz.Point(cx, cy+rr), fitz.Point(cx-rr, cy)))
        sq.finish(fill=BLUE, color=None, width=0)
        sq.commit()
        _t(cert_page, 63, 41, 'Realvix', size=13, color=DARK, bold=True)
        _t(cert_page, 116, 41, 'CRM', size=7, color=GRAY)

        # Titulo centrado
        _t(cert_page, 128, 98,  'Certificado de Auditoria', size=17, color=DARK, bold=True)
        _t(cert_page, 145, 118, 'de Firma Electronica',     size=17, color=DARK, bold=True)
        _l(cert_page, 60, 128, W-60, 128, color=BLUE, w=1.5)

        # Ref + Emitido
        doc_id_up = doc.get('id', '').upper()
        emitido_raw = doc.get('completed_at', doc.get('created_at', ''))
        try:
            dt = datetime.fromisoformat(emitido_raw)
            emitido_str = dt.strftime('%d/%m/%Y a las %H:%M:%S')
        except Exception:
            emitido_str = emitido_raw[:16].replace('T', ' ')

        y = 148
        _t(cert_page, 60, y, 'Ref:  ' + doc_id_up, size=9, bold=True); y += 16
        _t(cert_page, 60, y, 'Emitido el: ' + emitido_str, size=9, color=GRAY); y += 24

        # Tabla resumen
        rh = 22
        c1 = 160
        for i, (lbl, val) in enumerate([
            ('DOCUMENTO', doc.get('title','')),
            ('ESTADO',    'Completado'),
            ('FIRMANTES', str(len(firmantes))),
        ]):
            bg = BLUE_LT if i % 2 == 0 else WHITE
            _r(cert_page, 60, y, W-60, y+rh, bg, stroke=LGRAY, sw=0.3)
            _r(cert_page, 60, y, 60+c1, y+rh, bg, stroke=LGRAY, sw=0.3)
            _t(cert_page, 66,    y+15, lbl, size=8, color=BLUE, bold=True)
            _t(cert_page, 66+c1, y+15, val, size=9, color=DARK)
            y += rh
        y += 18

        # Header registro de firmas
        _r(cert_page, 60, y, W-60, y+22, BLUE_LT, stroke=LGRAY, sw=0.3)
        _t(cert_page, 66, y+14, 'REGISTRO DE FIRMAS', size=8, color=BLUE, bold=True)
        y += 22

        for f in firmantes:
            card_h = 92
            if y + card_h > H - 80:
                cert_doc.insert_page(-1, width=595, height=842)
                cert_page = cert_doc[-1]
                _r(cert_page, 0, 0, W, H, WHITE)
                y = 40

            _r(cert_page, 60, y, W-60, y+card_h, WHITE, stroke=LGRAY, sw=0.5)

            nombre = f.get('name') or f.get('email', '')
            email  = f.get('email', '')
            sat_raw2 = f.get('signed_at', '')
            try:
                sd = datetime.fromisoformat(sat_raw2)
                meses = ['enero','febrero','marzo','abril','mayo','junio',
                         'julio','agosto','septiembre','octubre','noviembre','diciembre']
                sat_str = 'el %d de %s de %d a las %s' % (
                    sd.day, meses[sd.month-1], sd.year, sd.strftime('%H:%M:%S'))
            except Exception:
                sat_str = sat_raw2[:16].replace('T',' ')

            ip_str = f.get('ip', '')
            _t(cert_page, 70, y+18, nombre, size=10, bold=True)
            _t(cert_page, 70, y+32, email,  size=9, color=GRAY)
            _t(cert_page, 70, y+46, 'Firmado ' + sat_str, size=8, color=GRAY)
            if ip_str:
                _t(cert_page, 70, y+58, 'IP: ' + ip_str, size=7, color=GRAY)

            # Miniatura de la firma dibujada
            sig_d = f.get('signature', '')
            if sig_d:
                try:
                    if ',' in sig_d:
                        sig_d = sig_d.split(',',1)[1]
                    cert_page.insert_image(
                        fitz.Rect(W-200, y+8, W-68, y+72),
                        stream=base64.b64decode(sig_d),
                        keep_proportion=True)
                except Exception as se:
                    print('[PDF] miniatura: ' + str(se))

            # Badge FIRMADO
            _r(cert_page, W-122, y+14, W-66, y+30, BLUE)
            _t(cert_page, W-115, y+25, 'FIRMADO', size=7, color=WHITE, bold=True)
            y += card_h + 8

        y += 10

        # Texto legal
        legal_lines = [
            'Por medio del presente instrumento digital, los firmantes declaran bajo juramento',
            'ser autores del documento suscripto, reconociendo la plena validez juridica de la',
            'firma electronica incorporada. Este certificado valida la firma del documento',
            'especificado mediante los mecanismos de autenticacion y cifrado utilizados',
            'conforme a la Ley N 25.506 y sus Decretos Reglamentarios de la Republica Argentina.',
        ]
        if y + len(legal_lines)*12 + 70 > H - 50:
            cert_doc.insert_page(-1, width=595, height=842)
            cert_page = cert_doc[-1]
            _r(cert_page, 0, 0, W, H, WHITE)
            y = 40
        for ln in legal_lines:
            _t(cert_page, 60, y, ln, size=8, color=GRAY); y += 12
        y += 18

        # Caja Repor rf Id
        _r(cert_page, W-222, y, W-60, y+44, WHITE, stroke=LGRAY, sw=0.5)
        _t(cert_page, W-216, y+15, 'Repor rf Id:', size=8, color=BLUE, bold=True)
        _t(cert_page, W-216, y+29, '#:' + doc_id_up, size=7, color=DARK)

        # Footer azul oscuro
        _r(cert_page, 0, H-34, W, H, BLUE_DARK)
        _t(cert_page, W//2-42, H-14, 'www.realvix.com.ar', size=9, color=WHITE)

        pdf_doc.insert_pdf(cert_doc)
        cert_doc.close()
        print('[PDF] Certificado OK')
    except Exception as e:
        print('[PDF] Error certificado: ' + str(e))

    try:
        out = BytesIO()
        pdf_doc.save(out)
        pdf_doc.close()
        return out.getvalue()
    except Exception as e:
        print(f'[PDF] Error serializando: {e}')
        return None


# ══════════════════════════
#  PÁGINAS
# ══════════════════════════

@bp.route('/firma')
def firma_page():
    get_connection, get_current_user = _db()
    user = get_current_user()
    if not user:
        return redirect('/login?next=/firma')
    return render_template('appfirma/firma.html')


@bp.route('/firmar/<doc_id>/<token>')
def firmar_page(doc_id, token):
    get_connection, _ = _db()
    conn = get_connection()
    if not conn:
        return 'Error de conexión', 500
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM documents WHERE id=%s", (doc_id,))
        row = cur.fetchone()
        cur.close(); conn.close()
        if not row:
            return 'Documento no encontrado', 404
        data     = row['data']
        firmante = next((f for f in data.get('firmantes', []) if f.get('token') == token), None)
        if not firmante:
            return 'Link de firma inválido', 404
        return render_template('appfirma/firmar.html',
                               doc=data, doc_id=doc_id, token=token, firmante=firmante)
    except Exception as e:
        return str(e), 500


# ══════════════════════════
#  API — CREAR DOCUMENTO
# ══════════════════════════

@bp.route('/api/documento', methods=['POST'])
def crear_documento():
    get_connection, get_current_user = _db()
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401

    title          = request.form.get('title', '').strip()
    organizer_name = request.form.get('organizer_name', user['name'])
    firmantes_json = request.form.get('firmantes', '[]')
    pdf_file       = request.files.get('pdf_file')

    if not title:
        return jsonify({'error': 'El título es requerido'}), 400
    try:
        firmantes = json.loads(firmantes_json)
    except Exception:
        return jsonify({'error': 'Firmantes inválidos'}), 400

    pdf_b64 = None
    if pdf_file:
        pdf_b64 = base64.b64encode(pdf_file.read()).decode('utf-8')

    doc_id   = str(uuid.uuid4())
    base_url = request.host_url.rstrip('/')

    for f in firmantes:
        f['token']    = secrets.token_urlsafe(24)
        f['signed']   = False
        f['sign_url'] = f"{base_url}/firmar/{doc_id}/{f['token']}"

    doc_data = {
        'id':              doc_id,
        'title':           title,
        'organizer_name':  organizer_name,
        'organizer_id':    user['id'],
        'organizer_email': user.get('email', ''),
        'firmantes':       firmantes,
        'completado':      False,
        'pdf_base64':      pdf_b64,
        'created_at':      datetime.now().isoformat(),
    }

    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        cur.execute("INSERT INTO documents (id, data) VALUES (%s, %s)",
                    (doc_id, json.dumps(doc_data)))
        conn.commit(); cur.close(); conn.close()

        # Email de invitación a cada firmante
        for f in firmantes:
            _email_invitacion(f, title, organizer_name)

        return jsonify({'ok': True, 'doc_id': doc_id, 'firmantes': firmantes})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ══════════════════════════
#  API — GUARDAR FIRMA
# ══════════════════════════

@bp.route('/api/firmar/<doc_id>/<token>', methods=['POST'])
def guardar_firma(doc_id, token):
    get_connection, _ = _db()
    data_req    = request.json or {}
    sig_dataurl = data_req.get('signature_dataurl', '')
    email_conf  = data_req.get('email_confirmado', '').strip().lower()

    if not sig_dataurl:
        return jsonify({'error': 'Firma requerida'}), 400

    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT data FROM documents WHERE id=%s", (doc_id,))
        row = cur.fetchone()
        if not row: cur.close(); conn.close(); return jsonify({'error': 'Documento no encontrado'}), 404

        doc      = row['data']
        firmante = next((f for f in doc.get('firmantes', []) if f.get('token') == token), None)
        if not firmante:
            cur.close(); conn.close(); return jsonify({'error': 'Token inválido'}), 404
        if firmante.get('signed'):
            cur.close(); conn.close(); return jsonify({'error': 'Ya firmaste este documento'}), 400
        if email_conf and email_conf != firmante.get('email', '').lower():
            cur.close(); conn.close(); return jsonify({'error': 'El email no coincide'}), 400

        firmante['signed']    = True
        firmante['signed_at'] = datetime.now().isoformat()
        firmante['signature'] = sig_dataurl
        # Capturar IP del firmante
        ip = request.headers.get('X-Forwarded-For', request.remote_addr or '')
        firmante['ip'] = ip

        all_signed   = all(f.get('signed') for f in doc.get('firmantes', []))
        signed_count = sum(1 for f in doc['firmantes'] if f.get('signed'))
        total        = len(doc['firmantes'])

        if all_signed:
            doc['completado']   = True
            doc['completed_at'] = datetime.now().isoformat()

        cur2 = conn.cursor()
        cur2.execute("UPDATE documents SET data=%s WHERE id=%s", (json.dumps(doc), doc_id))
        conn.commit(); cur.close(); cur2.close(); conn.close()

        # Email al organizador: alguien firmó
        org_email = doc.get('organizer_email', '')
        if org_email:
            _email_firma_recibida(
                org_email, doc.get('organizer_name', ''),
                firmante.get('name') or firmante.get('email', ''),
                doc.get('title', ''), signed_count, total
            )

        # Todos firmaron → generar PDF + enviar a todos
        if all_signed:
            pdf_final = _generar_pdf_firmado(doc)
            if pdf_final:
                _email_completado(doc, pdf_final)
                # Guardar PDF firmado para descarga posterior
                doc['pdf_firmado_b64'] = base64.b64encode(pdf_final).decode('utf-8')
                conn3 = get_connection()
                if conn3:
                    try:
                        cur3 = conn3.cursor()
                        cur3.execute("UPDATE documents SET data=%s WHERE id=%s",
                                     (json.dumps(doc), doc_id))
                        conn3.commit(); cur3.close(); conn3.close()
                    except Exception as e:
                        print(f'[PDF] Error guardando pdf_firmado: {e}')

        return jsonify({'ok': True, 'all_signed': all_signed,
                        'signed_count': signed_count, 'total': total})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ══════════════════════════
#  API — RESTO
# ══════════════════════════

@bp.route('/api/documentos', methods=['GET'])
def listar_documentos():
    get_connection, get_current_user = _db()
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    conn = get_connection()
    if not conn: return jsonify({'documentos': []})
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT id, data, created_at FROM documents
            WHERE data->>'organizer_id' = %s
              AND (data->>'archivado' IS NULL OR data->>'archivado' = 'false')
            ORDER BY created_at DESC
        """, (user['id'],))
        rows = cur.fetchall()
        cur.close(); conn.close()
        docs = []
        for r in rows:
            d = r['data']
            d['id']         = r['id']
            d['created_at'] = r['created_at'].isoformat() if r['created_at'] else d.get('created_at')
            d.pop('pdf_base64', None)
            d.pop('pdf_firmado_b64', None)
            docs.append(d)
        return jsonify({'documentos': docs})
    except Exception as e:
        return jsonify({'documentos': [], 'error': str(e)})


@bp.route('/api/documento/<doc_id>/estado', methods=['GET'])
def estado_documento(doc_id):
    get_connection, get_current_user = _db()
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT data FROM documents WHERE id=%s", (doc_id,))
        row = cur.fetchone(); cur.close(); conn.close()
        if not row: return jsonify({'error': 'No encontrado'}), 404
        d = row['data']
        if d.get('organizer_id') != user['id']:
            return jsonify({'error': 'Sin permiso'}), 403
        d.pop('pdf_base64', None)
        d.pop('pdf_firmado_b64', None)
        d['id'] = doc_id
        return jsonify(d)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/api/documento/<doc_id>/certificado', methods=['GET'])
def descargar_certificado(doc_id):
    get_connection, get_current_user = _db()
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT data FROM documents WHERE id=%s", (doc_id,))
        row = cur.fetchone(); cur.close(); conn.close()
        if not row: return jsonify({'error': 'No encontrado'}), 404
        doc = row['data']
        if doc.get('organizer_id') != user['id']:
            return jsonify({'error': 'Sin permiso'}), 403

        # PDF firmado guardado, o generarlo al vuelo
        if doc.get('pdf_firmado_b64'):
            pdf_bytes = base64.b64decode(doc['pdf_firmado_b64'])
        elif doc.get('pdf_base64'):
            pdf_bytes = _generar_pdf_firmado(doc) or base64.b64decode(doc['pdf_base64'])
        else:
            return jsonify({'error': 'No hay PDF disponible'}), 404

        safe_name = re.sub(r'[^\w\s-]', '', doc.get('title', 'documento')).strip().replace(' ', '_')
        filename  = f"{safe_name}_firmado.pdf"

        return send_file(BytesIO(pdf_bytes), mimetype='application/pdf',
                         as_attachment=True, download_name=filename)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/api/documento/<doc_id>', methods=['DELETE'])
def eliminar_documento(doc_id):
    get_connection, get_current_user = _db()
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT data FROM documents WHERE id=%s", (doc_id,))
        row = cur.fetchone()
        if not row: cur.close(); conn.close(); return jsonify({'error': 'No encontrado'}), 404
        if row['data'].get('organizer_id') != user['id']:
            cur.close(); conn.close(); return jsonify({'error': 'Sin permiso'}), 403
        cur2 = conn.cursor()
        cur2.execute("DELETE FROM documents WHERE id=%s", (doc_id,))
        conn.commit(); cur.close(); cur2.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/api/documentos/historial', methods=['GET'])
def historial_documentos():
    get_connection, get_current_user = _db()
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    conn = get_connection()
    if not conn: return jsonify({'carpetas': []})
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT id, data, created_at FROM documents
            WHERE data->>'organizer_id' = %s
              AND data->>'completado' = 'true'
              AND created_at < NOW() - INTERVAL '1 month'
            ORDER BY created_at DESC
        """, (user['id'],))
        rows = cur.fetchall()
        cur.close(); conn.close()
        carpetas = {}
        for r in rows:
            d = r['data']
            d['id']         = r['id']
            d['created_at'] = r['created_at'].isoformat() if r['created_at'] else d.get('created_at')
            d.pop('pdf_base64', None)
            d.pop('pdf_firmado_b64', None)
            fecha = r['created_at'] or datetime.now()
            clave = fecha.strftime('%B %Y') if hasattr(fecha, 'strftime') else 'Sin fecha'
            carpetas.setdefault(clave, []).append(d)
        result = [{'nombre': k, 'cantidad': len(v), 'docs': v} for k, v in carpetas.items()]
        return jsonify({'carpetas': result})
    except Exception as e:
        return jsonify({'carpetas': [], 'error': str(e)})


@bp.route('/api/documentos/historial/<nombre>', methods=['DELETE'])
def eliminar_carpeta_historial(nombre):
    get_connection, get_current_user = _db()
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT id, created_at FROM documents
            WHERE data->>'organizer_id' = %s AND data->>'completado' = 'true'
              AND created_at < NOW() - INTERVAL '1 month'
        """, (user['id'],))
        rows   = cur.fetchall()
        to_del = [r['id'] for r in rows
                  if hasattr(r['created_at'], 'strftime')
                  and r['created_at'].strftime('%B %Y') == nombre]
        if to_del:
            cur2 = conn.cursor()
            cur2.execute("DELETE FROM documents WHERE id = ANY(%s)", (to_del,))
            conn.commit(); cur2.close()
        cur.close(); conn.close()
        return jsonify({'ok': True, 'eliminados': len(to_del)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
