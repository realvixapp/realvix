"""
appfirma/app.py
Blueprint de Firma Electrónica — se registra en el app.py principal del CRM
Rutas: /firma, /firmar/<doc_id>/<token>
       /api/documento, /api/documentos, /api/firmar, /api/documento/<id>/estado
       /api/documento/<id>/certificado, /api/documentos/historial
Tabla: documents (JSONB) — la misma que ya existe en el CRM
"""

import base64, json, secrets, uuid
from datetime import datetime
from io import BytesIO

from flask import Blueprint, request, jsonify, render_template, redirect, url_for, send_file
from psycopg2.extras import RealDictCursor

bp = Blueprint('firma', __name__, template_folder='templates', static_folder='static')

def _db():
    from app import get_connection, get_current_user, login_required
    return get_connection, get_current_user, login_required


# ══════════════════════════
#  PÁGINAS
# ══════════════════════════

@bp.route('/firma')
def firma_page():
    from app import get_current_user
    _, get_current_user, _ = _db()
    user = get_current_user()
    if not user:
        return redirect('/login?next=/firma')
    return render_template('appfirma/firma.html')


@bp.route('/firmar/<doc_id>/<token>')
def firmar_page(doc_id, token):
    get_connection, _, _ = _db()
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
        data = row['data']
        firmante = next((f for f in data.get('firmantes', []) if f.get('token') == token), None)
        if not firmante:
            return 'Link de firma inválido', 404
        return render_template('appfirma/firmar.html', doc=data, doc_id=doc_id, token=token, firmante=firmante)
    except Exception as e:
        return str(e), 500


# ══════════════════════════
#  API
# ══════════════════════════

@bp.route('/api/documento', methods=['POST'])
def crear_documento():
    get_connection, get_current_user, _ = _db()
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
        'id':             doc_id,
        'title':          title,
        'organizer_name': organizer_name,
        'organizer_id':   user['id'],
        'firmantes':      firmantes,
        'completado':     False,
        'pdf_base64':     pdf_b64,
        'created_at':     datetime.now().isoformat(),
    }

    get_connection, _, _ = _db()
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        cur.execute("INSERT INTO documents (id, data) VALUES (%s, %s)",
                    (doc_id, json.dumps(doc_data)))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True, 'doc_id': doc_id, 'firmantes': firmantes})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/api/documentos', methods=['GET'])
def listar_documentos():
    get_connection, get_current_user, _ = _db()
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
            docs.append(d)
        return jsonify({'documentos': docs})
    except Exception as e:
        return jsonify({'documentos': [], 'error': str(e)})


@bp.route('/api/documento/<doc_id>/estado', methods=['GET'])
def estado_documento(doc_id):
    get_connection, get_current_user, _ = _db()
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
        d['id'] = doc_id
        return jsonify(d)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/api/firmar/<doc_id>/<token>', methods=['POST'])
def guardar_firma(doc_id, token):
    get_connection, _, _ = _db()
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

        all_signed = all(f.get('signed') for f in doc.get('firmantes', []))
        if all_signed:
            doc['completado']   = True
            doc['completed_at'] = datetime.now().isoformat()

        cur2 = conn.cursor()
        cur2.execute("UPDATE documents SET data=%s WHERE id=%s", (json.dumps(doc), doc_id))
        conn.commit(); cur.close(); cur2.close(); conn.close()

        signed_count = sum(1 for f in doc['firmantes'] if f.get('signed'))
        return jsonify({'ok': True, 'all_signed': all_signed,
                        'signed_count': signed_count, 'total': len(doc['firmantes'])})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/api/documento/<doc_id>/certificado', methods=['GET'])
def descargar_certificado(doc_id):
    get_connection, get_current_user, _ = _db()
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
        pdf_b64 = doc.get('pdf_base64')
        if not pdf_b64: return jsonify({'error': 'No hay PDF disponible'}), 404
        return send_file(BytesIO(base64.b64decode(pdf_b64)),
                         mimetype='application/pdf', as_attachment=True,
                         download_name=f"certificado_{doc_id[:8]}.pdf")
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/api/documento/<doc_id>', methods=['DELETE'])
def eliminar_documento(doc_id):
    get_connection, get_current_user, _ = _db()
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
    get_connection, get_current_user, _ = _db()
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
            fecha = r['created_at'] or datetime.now()
            clave = fecha.strftime('%B %Y') if hasattr(fecha, 'strftime') else 'Sin fecha'
            carpetas.setdefault(clave, []).append(d)
        result = [{'nombre': k, 'cantidad': len(v), 'docs': v} for k, v in carpetas.items()]
        return jsonify({'carpetas': result})
    except Exception as e:
        return jsonify({'carpetas': [], 'error': str(e)})


@bp.route('/api/documentos/historial/<nombre>', methods=['DELETE'])
def eliminar_carpeta_historial(nombre):
    get_connection, get_current_user, _ = _db()
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
        rows    = cur.fetchall()
        to_del  = [r['id'] for r in rows
                   if hasattr(r['created_at'], 'strftime') and r['created_at'].strftime('%B %Y') == nombre]
        if to_del:
            cur2 = conn.cursor()
            cur2.execute("DELETE FROM documents WHERE id = ANY(%s)", (to_del,))
            conn.commit(); cur2.close()
        cur.close(); conn.close()
        return jsonify({'ok': True, 'eliminados': len(to_del)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
