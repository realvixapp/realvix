"""
firma_blueprint.py — Firma Electrónica (independiente del CRM)
Usa Brevo (BREVO_API_KEY) para envío de emails.
"""

import os, io, json, uuid, base64, secrets, urllib.request, urllib.error
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, render_template, make_response

bp_firma = Blueprint('firma', __name__)

# ── DB helpers ──
def _db():
    from app import get_connection
    return get_connection()

def _user():
    from app import get_current_user
    return get_current_user()

# ── Brevo email ──
def _brevo_send(to_email, to_name, subject, html_body):
    api_key    = os.environ.get('BREVO_API_KEY', '')
    from_email = os.environ.get('BREVO_FROM_EMAIL', 'noreply@realvix.com')
    from_name  = os.environ.get('BREVO_FROM_NAME', 'Realvix CRM')
    if not api_key:
        print(f"[FIRMA][EMAIL] BREVO_API_KEY no configurada — saltando {to_email}")
        return False
    payload = json.dumps({
        'sender':      {'name': from_name, 'email': from_email},
        'to':          [{'email': to_email, 'name': to_name or to_email}],
        'subject':     subject,
        'htmlContent': html_body,
    }).encode('utf-8')
    req = urllib.request.Request(
        'https://api.brevo.com/v3/smtp/email',
        data=payload,
        headers={'Content-Type':'application/json','Accept':'application/json','api-key':api_key},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            print(f"[FIRMA][EMAIL] OK {to_email} status={r.status}")
            return True
    except urllib.error.HTTPError as e:
        print(f"[FIRMA][EMAIL] HTTPError {e.code} to={to_email}: {e.read().decode('utf-8','replace')}")
        return False
    except Exception as e:
        print(f"[FIRMA][EMAIL] Error to={to_email}: {e}")
        return False

def _brevo_send_attachment(to_email, to_name, subject, html_body, pdf_bytes, filename):
    api_key    = os.environ.get('BREVO_API_KEY', '')
    from_email = os.environ.get('BREVO_FROM_EMAIL', 'noreply@realvix.com')
    from_name  = os.environ.get('BREVO_FROM_NAME', 'Realvix CRM')
    if not api_key:
        print(f"[FIRMA][CERT] BREVO_API_KEY no configurada — saltando {to_email}")
        return False
    payload = json.dumps({
        'sender':      {'name': from_name, 'email': from_email},
        'to':          [{'email': to_email, 'name': to_name or to_email}],
        'subject':     subject,
        'htmlContent': html_body,
        'attachment':  [{'content': base64.b64encode(pdf_bytes).decode(), 'name': filename}],
    }).encode('utf-8')
    req = urllib.request.Request(
        'https://api.brevo.com/v3/smtp/email',
        data=payload,
        headers={'Content-Type':'application/json','Accept':'application/json','api-key':api_key},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            print(f"[FIRMA][CERT] OK {to_email} status={r.status}")
            return True
    except urllib.error.HTTPError as e:
        print(f"[FIRMA][CERT] HTTPError {e.code} to={to_email}: {e.read().decode('utf-8','replace')}")
        return False
    except Exception as e:
        print(f"[FIRMA][CERT] Error to={to_email}: {e}")
        return False

def _email_invitacion(firmante_name, firmante_email, doc_title, org_name, sign_url):
    nd = firmante_name or firmante_email
    return f"""<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f7f5f0;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f5f0;padding:40px 20px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.08);">
<tr><td style="background:#1B3FE4;padding:28px 36px;">
  <div style="font-size:1.3rem;font-weight:700;color:white;">Rx Realvix</div>
  <div style="font-size:0.78rem;color:rgba(255,255,255,0.7);margin-top:2px;">Firma Electrónica</div>
</td></tr>
<tr><td style="padding:32px 36px;">
  <h2 style="margin:0 0 8px;font-size:1.25rem;color:#0D1117;">✍️ Te invitaron a firmar un documento</h2>
  <p style="margin:0 0 20px;color:#555;font-size:0.9rem;line-height:1.6;">
    Hola <strong>{nd}</strong>,<br>
    <strong>{org_name}</strong> te envió el documento <strong>"{doc_title}"</strong> para que lo firmes digitalmente.
  </p>
  <table cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr><td style="background:#1B3FE4;border-radius:10px;">
      <a href="{sign_url}" style="display:inline-block;padding:14px 32px;font-size:0.95rem;font-weight:600;color:white;text-decoration:none;">✅ Firmar ahora →</a>
    </td></tr>
  </table>
  <p style="margin:0 0 8px;color:#888;font-size:0.78rem;">O copiá este link:</p>
  <p style="margin:0 0 24px;word-break:break-all;"><a href="{sign_url}" style="color:#1B3FE4;font-size:0.78rem;">{sign_url}</a></p>
  <div style="background:#fff8e1;border:1px solid #f0c040;border-radius:8px;padding:14px 16px;font-size:0.82rem;color:#7a5700;">
    ⚠️ Este link es personal. Necesitarás confirmar tu email (<strong>{firmante_email}</strong>) antes de firmar.
  </div>
</td></tr>
<tr><td style="padding:16px 36px;border-top:1px solid #f0ebe0;">
  <p style="margin:0;font-size:0.74rem;color:#aaa;">Realvix CRM · Firma Electrónica</p>
</td></tr>
</table></td></tr></table>
</body></html>"""

def _email_certificado(destinatario_name, destinatario_email, doc_title, pdf_bytes):
    safe  = doc_title.replace(' ','_').replace('/','-')[:40]
    html  = f"""<html><body style="font-family:Arial,sans-serif;color:#333;padding:32px;">
  <h2 style="color:#1B3FE4;">🎉 Documento firmado por todos</h2>
  <p>El documento <strong>"{doc_title}"</strong> fue firmado por todos los firmantes.</p>
  <p>Adjuntamos el certificado PDF con las firmas registradas.</p>
  <p style="font-size:0.8rem;color:#888;margin-top:24px;">Realvix CRM · Firma Electrónica</p>
</body></html>"""
    return _brevo_send_attachment(
        to_email=destinatario_email, to_name=destinatario_name or '',
        subject=f'✅ Documento firmado: {doc_title}',
        html_body=html, pdf_bytes=pdf_bytes, filename=f"{safe}_firmado.pdf",
    )

# ── PDF helpers ──
def _incrustar_firmas(pdf_bytes, firmantes):
    try:
        import pypdf
        from pypdf import PdfWriter, PdfReader
        import pypdf.generic as pg

        reader = PdfReader(io.BytesIO(pdf_bytes))
        writer = PdfWriter()
        for page in reader.pages:
            writer.add_page(page)

        for f in firmantes:
            zona    = f.get('sign_zone')
            sig_raw = f.get('signature_dataurl', '')
            if not zona or not sig_raw:
                continue
            try:
                sig_b64 = sig_raw.split(',')[1] if ',' in sig_raw else sig_raw
                sig_bytes = base64.b64decode(sig_b64)
                page_num  = int(zona.get('page', 1)) - 1
                if page_num < 0 or page_num >= len(writer.pages):
                    continue
                page = writer.pages[page_num]
                pw   = float(page.mediabox.width)
                ph   = float(page.mediabox.height)
                cw   = float(zona.get('canvasW', pw))
                ch   = float(zona.get('canvasH', ph))
                x  = float(zona['x']) * pw / cw
                y  = float(zona['y']) * ph / ch
                w  = float(zona['w']) * pw / cw
                h  = float(zona['h']) * ph / ch
                pdf_y = ph - y - h

                from pypdf.generic import (NameObject, DecodedStreamObject,
                                           ArrayObject, NumberObject)
                img = DecodedStreamObject()
                img.set_data(sig_bytes)
                img.update({
                    NameObject('/Type'):    NameObject('/XObject'),
                    NameObject('/Subtype'): NameObject('/Image'),
                    NameObject('/Filter'):  NameObject('/DCTDecode'),
                    NameObject('/Width'):   NumberObject(int(w)),
                    NameObject('/Height'):  NumberObject(int(h)),
                    NameObject('/ColorSpace'): NameObject('/DeviceRGB'),
                    NameObject('/BitsPerComponent'): NumberObject(8),
                })
                xname = f'/Sig{page_num}_{id(f)%9999}'
                if '/Resources' not in page:
                    page[NameObject('/Resources')] = pg.DictionaryObject()
                res = page['/Resources']
                if '/XObject' not in res:
                    res[NameObject('/XObject')] = pg.DictionaryObject()
                res['/XObject'][NameObject(xname)] = img
                draw = f'q {w:.2f} 0 0 {h:.2f} {x:.2f} {pdf_y:.2f} cm {xname} Do Q\n'.encode()
                ns = DecodedStreamObject(); ns.set_data(draw)
                if '/Contents' in page:
                    ex = page['/Contents']
                    if hasattr(ex, '__iter__') and not hasattr(ex, 'get_data'):
                        ex.append(ns)
                    else:
                        page[NameObject('/Contents')] = ArrayObject([ex, ns])
                else:
                    page[NameObject('/Contents')] = ns
            except Exception as e:
                print(f"[FIRMA][PDF] firma de {f.get('email')}: {e}")

        out = io.BytesIO()
        writer.write(out)
        return out.getvalue()
    except ImportError:
        return pdf_bytes
    except Exception as e:
        print(f"[FIRMA][PDF] error general: {e}")
        return pdf_bytes

# ── DB helpers ──
def _get_doc(doc_id):
    conn = _db()
    if not conn: return None
    try:
        from psycopg2.extras import RealDictCursor
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM documents WHERE id=%s", (doc_id,))
        row = cur.fetchone(); cur.close(); conn.close()
        if not row: return None
        d = dict(row)
        d['data'] = d['data'] if isinstance(d['data'], dict) else json.loads(d['data'])
        return d
    except Exception as e:
        print(f"[FIRMA][DB] _get_doc: {e}"); return None

def _save_doc(doc_id, data):
    conn = _db()
    if not conn: return False
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO documents (id, data, created_at) VALUES (%s, %s::jsonb, NOW())
            ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data
        """, (doc_id, json.dumps(data)))
        conn.commit(); cur.close(); conn.close()
        return True
    except Exception as e:
        print(f"[FIRMA][DB] _save_doc: {e}")
        try: conn.rollback(); conn.close()
        except: pass
        return False

# ══════════════════════════════════════════════
#  RUTAS
# ══════════════════════════════════════════════

@bp_firma.route('/api/documento', methods=['POST'])
def crear_documento():
    user = _user()
    if not user: return jsonify({'error': 'No autenticado'}), 401

    title           = request.form.get('title', '').strip()
    organizer_name  = request.form.get('organizer_name', user.get('name', ''))
    organizer_email = request.form.get('organizer_email', user.get('email', ''))
    firmantes_json  = request.form.get('firmantes', '[]')
    pdf_file        = request.files.get('pdf_file')

    if not title:
        return jsonify({'error': 'Título requerido'}), 400
    try:
        firmantes = json.loads(firmantes_json)
    except Exception:
        return jsonify({'error': 'firmantes JSON inválido'}), 400
    if not firmantes:
        return jsonify({'error': 'Agregá al menos un firmante'}), 400

    pdf_bytes  = pdf_file.read() if pdf_file else b''
    pdf_base64 = base64.b64encode(pdf_bytes).decode() if pdf_bytes else ''

    doc_id   = str(uuid.uuid4())
    base_url = request.host_url.rstrip('/')

    for f in firmantes:
        f['token']             = secrets.token_urlsafe(24)
        f['signed']            = False
        f['signed_at']         = None
        f['signature_dataurl'] = None
        f['sign_url']          = f"{base_url}/firmar/{doc_id}/{f['token']}"

    data = {
        'id': doc_id, 'title': title,
        'organizer_name': organizer_name, 'organizer_email': organizer_email,
        'user_id': user['id'], 'firmantes': firmantes,
        'pdf_base64': pdf_base64, 'status': 'pending',
        'created_at': datetime.utcnow().isoformat(),
    }
    if not _save_doc(doc_id, data):
        return jsonify({'error': 'Error al guardar el documento'}), 500

    emails_ok, emails_err = [], []
    for f in firmantes:
        ok = _brevo_send(
            to_email  = f['email'],
            to_name   = f.get('name', ''),
            subject   = f'✍️ {organizer_name} te envió un documento para firmar: {title}',
            html_body = _email_invitacion(f.get('name',''), f['email'], title, organizer_name, f['sign_url']),
        )
        (emails_ok if ok else emails_err).append(f['email'])

    resp = {
        'ok': True, 'doc_id': doc_id,
        'firmantes': [{'name': f.get('name',''), 'email': f['email'], 'sign_url': f['sign_url']} for f in firmantes],
        'emails_ok': emails_ok, 'emails_err': emails_err,
    }
    if emails_err:
        resp['warning'] = f'No se pudo enviar email a: {", ".join(emails_err)}. Compartí el link manualmente.'
    return jsonify(resp)


@bp_firma.route('/api/documento/<doc_id>', methods=['GET'])
def estado_documento(doc_id):
    user = _user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    doc = _get_doc(doc_id)
    if not doc: return jsonify({'error': 'No encontrado'}), 404
    d = doc['data']
    firmantes_pub = [{'name': f.get('name',''), 'email': f.get('email',''),
                      'signed': f.get('signed', False), 'signed_at': f.get('signed_at'),
                      'sign_url': f.get('sign_url','')} for f in d.get('firmantes',[])]
    signed_count = sum(1 for f in d.get('firmantes',[]) if f.get('signed'))
    total        = len(d.get('firmantes',[]))
    return jsonify({'id': doc_id, 'title': d.get('title',''), 'status': d.get('status','pending'),
                    'created_at': d.get('created_at',''), 'firmantes': firmantes_pub,
                    'signed_count': signed_count, 'total': total, 'all_signed': signed_count==total})


@bp_firma.route('/api/documentos', methods=['GET'])
def listar_documentos():
    user = _user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    conn = _db()
    if not conn: return jsonify({'documentos': []})
    try:
        from psycopg2.extras import RealDictCursor
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT id, data, created_at FROM documents ORDER BY created_at DESC")
        rows = cur.fetchall(); cur.close(); conn.close()
    except Exception:
        return jsonify({'documentos': []})

    filtro       = request.args.get('status', '')
    un_mes_atras = datetime.utcnow() - timedelta(days=30)
    docs = []
    for row in rows:
        d = row['data'] if isinstance(row['data'], dict) else json.loads(row['data'])
        if d.get('user_id') != user['id']: continue
        fms        = d.get('firmantes', [])
        all_signed = all(f.get('signed') for f in fms) and len(fms) > 0
        status     = 'completed' if all_signed else 'pending'
        try:
            created_dt = datetime.fromisoformat(d.get('created_at',''))
        except Exception:
            created_dt = datetime.utcnow()
        es_historial = all_signed and created_dt < un_mes_atras
        if filtro and status != filtro: continue
        if es_historial and filtro != 'historial': continue
        signed_count = sum(1 for f in fms if f.get('signed'))
        docs.append({
            'id': row['id'], 'title': d.get('title',''), 'status': status,
            'created_at': d.get('created_at',''), 'signed_count': signed_count,
            'total': len(fms),
            'firmantes': [{'name': f.get('name',''), 'email': f.get('email',''),
                           'signed': f.get('signed',False), 'sign_url': f.get('sign_url','')} for f in fms],
        })
    return jsonify({'documentos': docs})


@bp_firma.route('/api/documentos/historial', methods=['GET'])
def historial_documentos():
    user = _user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    conn = _db()
    if not conn: return jsonify({'carpetas': []})
    try:
        from psycopg2.extras import RealDictCursor
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT id, data, created_at FROM documents ORDER BY created_at DESC")
        rows = cur.fetchall(); cur.close(); conn.close()
    except Exception:
        return jsonify({'carpetas': []})
    un_mes_atras = datetime.utcnow() - timedelta(days=30)
    carpetas = {}
    for row in rows:
        d = row['data'] if isinstance(row['data'], dict) else json.loads(row['data'])
        if d.get('user_id') != user['id']: continue
        fms = d.get('firmantes', [])
        if not (all(f.get('signed') for f in fms) and len(fms) > 0): continue
        try:
            cdt = datetime.fromisoformat(d.get('created_at',''))
        except Exception:
            continue
        if cdt >= un_mes_atras: continue
        mes = cdt.strftime('%B %Y').capitalize()
        carpetas.setdefault(mes, []).append({'id': row['id'], 'title': d.get('title',''), 'created_at': d.get('created_at','')})
    return jsonify({'carpetas': [{'nombre': m, 'cantidad': len(docs), 'docs': docs} for m, docs in carpetas.items()]})


@bp_firma.route('/api/documentos/historial/<nombre>', methods=['DELETE'])
def eliminar_carpeta_historial(nombre):
    user = _user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    conn = _db()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        from psycopg2.extras import RealDictCursor
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT id, data FROM documents")
        rows = cur.fetchall()
        un_mes_atras = datetime.utcnow() - timedelta(days=30)
        eliminados = 0
        for row in rows:
            d = row['data'] if isinstance(row['data'], dict) else json.loads(row['data'])
            if d.get('user_id') != user['id']: continue
            fms = d.get('firmantes', [])
            if not (all(f.get('signed') for f in fms) and len(fms) > 0): continue
            try:
                cdt = datetime.fromisoformat(d.get('created_at',''))
            except Exception:
                continue
            if cdt >= un_mes_atras: continue
            if cdt.strftime('%B %Y').capitalize() == nombre:
                cur.execute("DELETE FROM documents WHERE id=%s", (row['id'],))
                eliminados += 1
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True, 'eliminados': eliminados})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp_firma.route('/api/documento/<doc_id>', methods=['DELETE'])
def eliminar_documento(doc_id):
    user = _user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    doc = _get_doc(doc_id)
    if not doc: return jsonify({'error': 'No encontrado'}), 404
    if doc['data'].get('user_id') != user['id']: return jsonify({'error': 'Sin permiso'}), 403
    conn = _db()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM documents WHERE id=%s", (doc_id,))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp_firma.route('/api/documento/<doc_id>/certificado', methods=['GET'])
def descargar_certificado(doc_id):
    user = _user()
    if not user: return 'No autenticado', 401
    doc = _get_doc(doc_id)
    if not doc: return 'No encontrado', 404
    d         = doc['data']
    pdf_bytes = base64.b64decode(d.get('pdf_base64','')) if d.get('pdf_base64') else b''
    pdf_final = _incrustar_firmas(pdf_bytes, d.get('firmantes', []))
    safe      = d.get('title','documento').replace(' ','_').replace('/','-')[:40]
    resp      = make_response(pdf_final)
    resp.headers['Content-Type']        = 'application/pdf'
    resp.headers['Content-Disposition'] = f'attachment; filename="{safe}_firmado.pdf"'
    return resp


@bp_firma.route('/firmar/<doc_id>/<token>', methods=['GET'])
def pagina_firmar(doc_id, token):
    doc = _get_doc(doc_id)
    if not doc: return '<h2>Documento no encontrado o expirado.</h2>', 404
    d        = doc['data']
    firmante = next((f for f in d.get('firmantes',[]) if f.get('token') == token), None)
    if not firmante: return '<h2>Link inválido.</h2>', 404
    doc_pub  = {'title': d.get('title',''), 'pdf_base64': d.get('pdf_base64','')}
    return render_template('firmar.html', doc_id=doc_id, token=token, doc=doc_pub, firmante=firmante)


@bp_firma.route('/api/firmar/<doc_id>/<token>', methods=['POST'])
def guardar_firma(doc_id, token):
    doc = _get_doc(doc_id)
    if not doc: return jsonify({'error': 'Documento no encontrado'}), 404
    d        = doc['data']
    firmante = next((f for f in d.get('firmantes',[]) if f.get('token') == token), None)
    if not firmante: return jsonify({'error': 'Token inválido'}), 404
    if firmante.get('signed'): return jsonify({'error': 'Ya firmaste', 'already_signed': True}), 400

    body          = request.json or {}
    sig_dataurl   = body.get('signature_dataurl', '')
    email_confirm = body.get('email_confirmado', '').strip().lower()

    if not sig_dataurl: return jsonify({'error': 'Firma requerida'}), 400
    if email_confirm != firmante.get('email','').lower():
        return jsonify({'error': 'Email no coincide'}), 400

    firmante['signed']            = True
    firmante['signed_at']         = datetime.utcnow().isoformat()
    firmante['signature_dataurl'] = sig_dataurl

    all_signed = all(f.get('signed') for f in d.get('firmantes', []))
    if all_signed:
        d['status'] = 'completed'
    _save_doc(doc_id, d)

    signed_count = sum(1 for f in d.get('firmantes',[]) if f.get('signed'))
    total        = len(d.get('firmantes',[]))

    if all_signed:
        pdf_bytes = base64.b64decode(d.get('pdf_base64','')) if d.get('pdf_base64') else b''
        pdf_final = _incrustar_firmas(pdf_bytes, d.get('firmantes',[]))
        title     = d.get('title','documento')
        for f in d.get('firmantes',[]):
            _email_certificado(f.get('name',''), f['email'], title, pdf_final)
        org_email = d.get('organizer_email','')
        if org_email:
            _email_certificado(d.get('organizer_name',''), org_email, title, pdf_final)

    return jsonify({'ok': True, 'all_signed': all_signed, 'signed_count': signed_count, 'total': total})
