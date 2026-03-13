import os
import uuid
import json
import base64
import hashlib
import secrets
import urllib.request
from datetime import datetime, timedelta
from functools import wraps
from io import BytesIO
import psycopg2
from psycopg2.extras import RealDictCursor

from flask import (Flask, request, jsonify, render_template,
                   abort, redirect, url_for, session, make_response)
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT

from werkzeug.middleware.proxy_fix import ProxyFix

app = Flask(__name__, static_folder='static', static_url_path='/static')
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)
app.secret_key = os.environ.get('SECRET_KEY', 'tintorero-dev-2024')
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=30)

documents = {}

def get_connection():
    url = os.environ.get('DATABASE_URL', '')
    if not url:
        return None
    try:
        return psycopg2.connect(url)
    except Exception as e:
        print(f"[DB ERROR] connect: {e}")
        return None

def init_db():
    conn = get_connection()
    if not conn:
        print("[DB] No DATABASE_URL")
        return
    try:
        cur = conn.cursor()
        cur.execute("""CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY, data JSONB NOT NULL, created_at TIMESTAMP DEFAULT NOW())""")
        cur.execute("""CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
            password_hash TEXT NOT NULL, role TEXT DEFAULT 'member',
            created_at TIMESTAMP DEFAULT NOW(), last_login TIMESTAMP)""")
        cur.execute("""CREATE TABLE IF NOT EXISTS user_sessions (
            token TEXT PRIMARY KEY, user_id TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW(), expires_at TIMESTAMP NOT NULL)""")
        cur.execute("""CREATE TABLE IF NOT EXISTS propiedades (
            id TEXT PRIMARY KEY,
            direccion TEXT NOT NULL,
            localidad TEXT,
            zona TEXT,
            tipologia TEXT,
            nombre_propietario TEXT,
            telefono TEXT,
            email TEXT,
            estado_tasacion TEXT DEFAULT 'Pendiente Visita',
            estadio TEXT,
            ultimo_contacto DATE,
            proximo_contacto DATE,
            fecha_prelisting DATE,
            observaciones TEXT,
            referido TEXT,
            url TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )""")
        cur.execute("""CREATE TABLE IF NOT EXISTS estados_tasacion (
            id TEXT PRIMARY KEY,
            nombre TEXT UNIQUE NOT NULL,
            color TEXT DEFAULT 'gray',
            orden INTEGER DEFAULT 0,
            activo BOOLEAN DEFAULT TRUE
        )""")
        estados_default = [
            ('est-1', 'Pendiente Visita', 'purple', 1),
            ('est-2', 'Pendiente Respuesta', 'yellow', 2),
            ('est-3', 'A Realizar', 'gray', 3),
            ('est-4', 'Aceptada', 'green', 4),
            ('est-5', 'No contesta hacer seguimiento', 'orange', 5),
            ('est-6', 'Decide Esperar', 'blue', 6),
            ('est-7', 'Rechazada', 'red', 7),
            ('est-8', 'Vendio con Otro', 'pink', 8),
        ]
        for e in estados_default:
            cur.execute("""INSERT INTO estados_tasacion (id, nombre, color, orden)
                VALUES (%s, %s, %s, %s) ON CONFLICT (nombre) DO NOTHING""", e)
        conn.commit(); cur.close(); conn.close()
        print("[DB] Tables ready")
    except Exception as e:
        print(f"[DB ERROR] init: {e}")

def save_doc(doc_id, doc_data):
    conn = get_connection()
    if not conn:
        documents[doc_id] = doc_data; return
    try:
        cur = conn.cursor()
        cur.execute("INSERT INTO documents (id, data) VALUES (%s, %s) ON CONFLICT (id) DO UPDATE SET data = %s",
            (doc_id, json.dumps(doc_data), json.dumps(doc_data)))
        conn.commit(); cur.close(); conn.close()
    except Exception as e:
        print(f"[DB ERROR] save: {e}"); documents[doc_id] = doc_data

def get_doc(doc_id):
    conn = get_connection()
    if not conn:
        return documents.get(doc_id)
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT data FROM documents WHERE id = %s", (doc_id,))
        row = cur.fetchone(); cur.close(); conn.close()
        return row['data'] if row else None
    except Exception as e:
        print(f"[DB ERROR] get: {e}"); return documents.get(doc_id)

def get_env(key):
    return os.environ.get(key, '')

# ── AUTH ──
def hash_password(password):
    salt = os.environ.get('PASSWORD_SALT', 'tintorero-salt-2024')
    return hashlib.sha256(f"{salt}{password}".encode()).hexdigest()

def get_user_by_email(email):
    conn = get_connection()
    if not conn: return None
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM users WHERE email = %s", (email.lower().strip(),))
        row = cur.fetchone(); cur.close(); conn.close()
        return dict(row) if row else None
    except: return None

def get_user_by_id(uid):
    conn = get_connection()
    if not conn: return None
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM users WHERE id = %s", (uid,))
        row = cur.fetchone(); cur.close(); conn.close()
        return dict(row) if row else None
    except: return None

def list_users():
    conn = get_connection()
    if not conn: return []
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT id, email, name, role, created_at, last_login FROM users ORDER BY created_at")
        rows = cur.fetchall(); cur.close(); conn.close()
        return [dict(r) for r in rows]
    except: return []

def create_user(email, name, password, role='member'):
    conn = get_connection()
    if not conn: return None
    uid = str(uuid.uuid4())
    try:
        cur = conn.cursor()
        cur.execute("INSERT INTO users (id,email,name,password_hash,role) VALUES (%s,%s,%s,%s,%s)",
            (uid, email.lower().strip(), name, hash_password(password), role))
        conn.commit(); cur.close(); conn.close(); return uid
    except Exception as e:
        print(f"[AUTH] create_user error: {e}"); return None

def create_session(user_id, remember=False):
    token = secrets.token_urlsafe(32)
    expires = datetime.now() + timedelta(days=30 if remember else 1)
    conn = get_connection()
    if conn:
        try:
            cur = conn.cursor()
            cur.execute("INSERT INTO user_sessions (token,user_id,expires_at) VALUES (%s,%s,%s)",
                (token, user_id, expires))
            cur.execute("UPDATE users SET last_login=NOW() WHERE id=%s", (user_id,))
            conn.commit(); cur.close(); conn.close()
        except Exception as e:
            print(f"[AUTH] session error: {e}")
    return token

def validate_session(token):
    if not token: return None
    conn = get_connection()
    if not conn: return None
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT user_id FROM user_sessions WHERE token=%s AND expires_at>NOW()", (token,))
        row = cur.fetchone(); cur.close(); conn.close()
        return get_user_by_id(row['user_id']) if row else None
    except: return None

def delete_session(token):
    conn = get_connection()
    if not conn: return
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM user_sessions WHERE token=%s", (token,))
        conn.commit(); cur.close(); conn.close()
    except: pass

def get_current_user():
    token = request.cookies.get('auth_token')
    return validate_session(token) if token else None

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not get_current_user():
            return redirect(url_for('login_page', next=request.path))
        return f(*args, **kwargs)
    return decorated

def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        user = get_current_user()
        if not user: return redirect(url_for('login_page'))
        if user.get('role') != 'admin': abort(403)
        return f(*args, **kwargs)
    return decorated

# ── EMAIL (Brevo API HTTP) ──
def send_email(to_email, to_name, subject, html_body, attachment_pdf_bytes=None, attachment_name=None):
    api_key = get_env('BREVO_API_KEY')
    if not api_key:
        print(f"[EMAIL] Sin BREVO_API_KEY. Para: {to_email}"); return False
    try:
        payload = {
            "sender": {"name": "#confiaenfede", "email": "confiaenfede@gmail.com"},
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
            'https://api.brevo.com/v3/smtp/email',
            data=data,
            headers={
                'api-key': api_key,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        )
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read())
            print(f"[EMAIL] OK → {to_email} messageId={result.get('messageId','?')}"); return True
    except Exception as e:
        print(f"[EMAIL ERROR] {e}"); return False

# ── PDF ──
def generate_full_pdf(doc_data):
    import io as _io, tempfile, os as _os
    from collections import defaultdict
    pdf_b64 = doc_data.get('pdf_base64', '')
    firmantes = doc_data.get('firmantes', [])
    audit_bytes = generate_certificate_pdf(doc_data)
    if not pdf_b64: return audit_bytes
    try:
        import fitz
        doc_pdf = fitz.open(stream=base64.b64decode(pdf_b64), filetype="pdf")
        by_page = defaultdict(list)
        for f in firmantes:
            if f.get('sign_zone') and f.get('signed') and f.get('signature_dataurl'):
                by_page[f['sign_zone'].get('page',1)].append(f)
        for page_num, pf in by_page.items():
            if page_num<1 or page_num>len(doc_pdf): continue
            pg = doc_pdf[page_num-1]
            for firmante in pf:
                z = firmante['sign_zone']
                sx = pg.rect.width/z.get('canvasW',1); sy = pg.rect.height/z.get('canvasH',1)
                try:
                    img_bytes = base64.b64decode(firmante['signature_dataurl'].split(',')[1])
                    tmp = tempfile.NamedTemporaryFile(delete=False, suffix='.png')
                    tmp.write(img_bytes); tmp.close()
                    rect = fitz.Rect(z['x']*sx, z['y']*sy, (z['x']+z['w'])*sx, (z['y']+z['h'])*sy)
                    pg.insert_image(rect, filename=tmp.name, overlay=True)
                    _os.unlink(tmp.name)
                except Exception as e:
                    print(f"[PDF EMBED] {e}")
        audit_doc = fitz.open(stream=audit_bytes, filetype="pdf")
        doc_pdf.insert_pdf(audit_doc); audit_doc.close()
        out = _io.BytesIO(); doc_pdf.save(out); doc_pdf.close()
        return out.getvalue()
    except Exception as e:
        print(f"[FULL PDF ERROR] {e}"); return audit_bytes

def generate_certificate_pdf(doc_data):
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    W, H = A4
    c.setFillColor(colors.HexColor('#0f0f0f'))
    c.rect(0, H-55*mm, W, 55*mm, fill=1, stroke=0)
    c.setFillColor(colors.HexColor('#c9a84c'))
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
        c.setFont('Helvetica-Bold',7); c.setFillColor(colors.HexColor('#888888'))
        c.drawString(18*mm, y, label.upper())
        c.setFont('Helvetica',10); c.setFillColor(colors.HexColor('#0f0f0f'))
        c.drawString(58*mm, y, str(value))
        y-=5*mm; c.setStrokeColor(colors.HexColor('#e8e4dc'))
        c.line(18*mm, y, W-18*mm, y); y-=4*mm
    draw_row('Documento', doc_data.get('title','Sin nombre'))
    sc = sum(1 for f in doc_data['firmantes'] if f['signed']); tot=len(doc_data['firmantes'])
    draw_row('Estado','Completado' if sc==tot else f'{sc} de {tot}')
    draw_row('Firmantes', str(tot))
    y-=4*mm; c.setFont('Helvetica-Bold',7); c.setFillColor(colors.HexColor('#888888'))
    c.drawString(18*mm, y,'REGISTRO DE FIRMAS'); y-=8*mm
    for f in doc_data['firmantes']:
        ch=28*mm if f['signed'] else 18*mm
        if y-ch<20*mm: c.showPage(); y=H-20*mm
        c.setFillColor(colors.HexColor('#f0faf4') if f['signed'] else colors.HexColor('#fff8e1'))
        c.roundRect(18*mm,y-ch,W-36*mm,ch,3*mm,fill=1,stroke=0)
        c.setStrokeColor(colors.HexColor('#52b788') if f['signed'] else colors.HexColor('#c9a84c'))
        c.setLineWidth(0.5); c.roundRect(18*mm,y-ch,W-36*mm,ch,3*mm,fill=0,stroke=1)
        c.setFont('Helvetica-Bold',11); c.setFillColor(colors.HexColor('#0f0f0f'))
        c.drawString(22*mm,y-8*mm,f['name'])
        c.setFont('Helvetica',8); c.setFillColor(colors.HexColor('#666666'))
        c.drawString(22*mm,y-13*mm,f['email'])
        if f['signed']:
            dt=datetime.fromisoformat(f['signed_at']).strftime('%d/%m/%Y %H:%M:%S')
            c.setFont('Helvetica',7); c.setFillColor(colors.HexColor('#2d6a4f'))
            c.drawString(22*mm,y-19*mm,f"Firmado el {dt}")
            c.drawString(22*mm,y-24*mm,f"IP: {f.get('ip','N/D')}")
            if f.get('signature_dataurl'):
                try:
                    import tempfile, os as _os
                    tmp=tempfile.NamedTemporaryFile(delete=False,suffix='.png')
                    tmp.write(base64.b64decode(f['signature_dataurl'].split(',')[1])); tmp.close()
                    c.drawImage(tmp.name,W-65*mm,y-ch+2*mm,width=42*mm,height=22*mm,preserveAspectRatio=True,mask='auto')
                    _os.unlink(tmp.name)
                except: pass
            c.setFillColor(colors.HexColor('#2d6a4f'))
            c.roundRect(W-50*mm,y-13*mm,18*mm,6*mm,1.5*mm,fill=1,stroke=0)
            c.setFont('Helvetica-Bold',6); c.setFillColor(colors.white)
            c.drawCentredString(W-41*mm,y-10*mm,'FIRMADO')
        else:
            c.setFillColor(colors.HexColor('#c9a84c'))
            c.roundRect(W-50*mm,y-13*mm,24*mm,6*mm,1.5*mm,fill=1,stroke=0)
            c.setFont('Helvetica-Bold',6); c.setFillColor(colors.white)
            c.drawCentredString(W-38*mm,y-10*mm,'PENDIENTE')
        y-=ch+4*mm
    c.setFillColor(colors.HexColor('#f8f8f8')); c.rect(0,0,W,14*mm,fill=1,stroke=0)
    c.setStrokeColor(colors.HexColor('#d4c9b8')); c.line(0,14*mm,W,14*mm)
    c.setFont('Helvetica',7); c.setFillColor(colors.HexColor('#999999'))
    c.drawString(18*mm,6*mm,'Tintorero CRM — Sistema de Firma Electrónica')
    c.drawRightString(W-18*mm,6*mm,f"Ref: {doc_data['id'].upper()}")
    c.save(); return buffer.getvalue()


# ══════════════════════════════════════════
#  ROUTES: AUTH
# ══════════════════════════════════════════

@app.route('/login')
def login_page():
    if get_current_user():
        return redirect('/')
    return render_template('login.html', next_url=request.args.get('next','/'))

@app.route('/api/auth/login', methods=['POST'])
def api_login():
    data = request.json or {}
    email = data.get('email','').strip().lower()
    password = data.get('password','')
    remember = data.get('remember', False)
    next_url = data.get('next', '/')
    if not email or not password:
        return jsonify({'error': 'Email y contraseña requeridos'}), 400
    user = get_user_by_email(email)
    if not user or user['password_hash'] != hash_password(password):
        return jsonify({'error': 'Email o contraseña incorrectos'}), 401
    token = create_session(user['id'], remember=remember)
    resp = make_response(jsonify({'ok': True, 'redirect': next_url or '/'}))
    max_age = 60*60*24*30 if remember else 60*60*24
    resp.set_cookie('auth_token', token,
                   max_age=max_age,
                   httponly=True,
                   samesite='Lax',
                   secure=True,
                   path='/')
    return resp

@app.route('/api/auth/logout', methods=['POST'])
def api_logout():
    token = request.cookies.get('auth_token')
    if token: delete_session(token)
    resp = make_response(jsonify({'ok': True}))
    resp.delete_cookie('auth_token')
    return resp

@app.route('/api/auth/me')
def api_me():
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    return jsonify({'id': user['id'], 'name': user['name'],
                    'email': user['email'], 'role': user['role']})

@app.route('/api/admin/users', methods=['GET'])
@admin_required
def admin_list_users():
    return jsonify({'users': list_users()})

@app.route('/api/admin/users', methods=['POST'])
@admin_required
def admin_create_user():
    data = request.json or {}
    email = data.get('email','').strip()
    name = data.get('name','').strip()
    password = data.get('password','').strip()
    role = data.get('role','member')
    if not email or not name or not password:
        return jsonify({'error': 'Todos los campos son requeridos'}), 400
    if get_user_by_email(email):
        return jsonify({'error': 'Ya existe una cuenta con ese email'}), 409
    uid = create_user(email, name, password, role)
    if not uid: return jsonify({'error': 'Error al crear usuario'}), 500
    return jsonify({'ok': True, 'user_id': uid})

@app.route('/api/admin/users/<user_id>', methods=['DELETE'])
@admin_required
def admin_delete_user(user_id):
    curr = get_current_user()
    if curr['id'] == user_id:
        return jsonify({'error': 'No podés eliminarte a vos mismo'}), 400
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    cur = conn.cursor()
    cur.execute("DELETE FROM users WHERE id=%s", (user_id,))
    cur.execute("DELETE FROM user_sessions WHERE user_id=%s", (user_id,))
    conn.commit(); cur.close(); conn.close()
    return jsonify({'ok': True})

@app.route('/api/admin/users/<user_id>/password', methods=['POST'])
@admin_required
def admin_change_password(user_id):
    data = request.json or {}
    pw = data.get('password','').strip()
    if len(pw) < 6: return jsonify({'error': 'Mínimo 6 caracteres'}), 400
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    cur = conn.cursor()
    cur.execute("UPDATE users SET password_hash=%s WHERE id=%s", (hash_password(pw), user_id))
    conn.commit(); cur.close(); conn.close()
    return jsonify({'ok': True})

@app.route('/setup', methods=['GET','POST'])
def setup():
    # Only accessible if NO users exist
    conn = get_connection()
    if conn:
        try:
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM users")
            if cur.fetchone()[0] > 0:
                cur.close(); conn.close()
                return redirect('/login')
            cur.close(); conn.close()
        except: pass
    if request.method == 'POST':
        data = request.json or {}
        if data.get('setup_key') != os.environ.get('SETUP_KEY','tintorero2024'):
            return jsonify({'error': 'Clave incorrecta'}), 403
        email = data.get('email','').strip()
        name = data.get('name','').strip()
        password = data.get('password','').strip()
        if not email or not name or not password:
            return jsonify({'error': 'Todos los campos son requeridos'}), 400
        uid = create_user(email, name, password, role='admin')
        if uid: return jsonify({'ok': True})
        return jsonify({'error': 'Error al crear admin'}), 500
    return render_template('setup.html')


# ══════════════════════════════════════════
#  ROUTES: MAIN (protected)
# ══════════════════════════════════════════

@app.route('/')
@login_required
def index():
    return render_template('index.html')

# ─────────────────────────────────────────
#  PROPIEDADES
# ─────────────────────────────────────────

def init_propiedades():
    conn = get_connection()
    if not conn:
        return
    try:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS propiedades (
                id TEXT PRIMARY KEY,
                direccion TEXT,
                localidad TEXT,
                zona TEXT,
                tipologia TEXT,
                nombre_propietario TEXT,
                telefono TEXT,
                email TEXT,
                estado_tasacion TEXT DEFAULT 'Pendiente Visita',
                estadio TEXT,
                observaciones TEXT,
                referido TEXT,
                url TEXT,
                ultimo_contacto TEXT,
                proximo_contacto TEXT,
                fecha_prelisting TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS estado_opciones (
                id SERIAL PRIMARY KEY,
                nombre TEXT UNIQUE NOT NULL,
                color TEXT DEFAULT 'gray',
                vista TEXT DEFAULT 'listing',
                orden INTEGER DEFAULT 99
            )
        """)
        cur.execute("SELECT COUNT(*) FROM estado_opciones")
        if cur.fetchone()[0] == 0:
            estados = [
                ('Pendiente Visita', 'purple', 'listing', 1),
                ('A Realizar', 'gray', 'listing', 2),
                ('Pendiente Respuesta', 'yellow', 'listing', 3),
                ('Aceptada', 'green', 'listing', 4),
                ('No contesta hacer seguimiento', 'orange', 'seguimiento', 5),
                ('Decide Esperar', 'blue', 'seguimiento', 6),
                ('Rechazada', 'red', 'rechazados', 7),
                ('Vendio con Otro', 'red', 'rechazados', 8),
            ]
            for e in estados:
                cur.execute(
                    "INSERT INTO estado_opciones (nombre, color, vista, orden) VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING",
                    e
                )
        conn.commit()
        cur.close()
        conn.close()
        print("[DB] Propiedades tables ready")
    except Exception as e:
        print(f"[DB ERROR] init_propiedades: {e}")

@app.route('/listing')
@login_required
def pagina_listing():
    return render_template('listing.html')

@app.route('/api/propiedades', methods=['GET'])
@login_required
def listar_propiedades():
    vista = request.args.get('vista', 'all')
    conn = get_connection()
    if not conn:
        return jsonify({'propiedades': [], 'estados': []})
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM estado_opciones ORDER BY orden")
        estados = [dict(r) for r in cur.fetchall()]
        if vista == 'all':
            cur.execute("SELECT * FROM propiedades ORDER BY updated_at DESC")
        elif vista in ('listing','seguimiento','rechazados'):
            cur.execute("""
                SELECT p.* FROM propiedades p
                JOIN estado_opciones e ON p.estado_tasacion = e.nombre
                WHERE e.vista = %s ORDER BY p.updated_at DESC
            """, (vista,))
        elif vista == 'mensuales':
            cur.execute("""
                SELECT * FROM propiedades
                WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
                ORDER BY created_at DESC
            """)
        elif vista.startswith('estado:'):
            estado_nombre = vista[len('estado:'):]
            cur.execute("SELECT * FROM propiedades WHERE estado_tasacion = %s ORDER BY updated_at DESC", (estado_nombre,))
        else:
            cur.execute("SELECT * FROM propiedades WHERE estado_tasacion = %s ORDER BY updated_at DESC", (vista,))
        props = [dict(r) for r in cur.fetchall()]
        for p in props:
            for k,v in p.items():
                if hasattr(v, 'isoformat'):
                    p[k] = v.isoformat()
        cur.close()
        conn.close()
        return jsonify({'propiedades': props, 'estados': estados})
    except Exception as e:
        print(f"[DB ERROR] listar_propiedades: {e}")
        return jsonify({'propiedades': [], 'estados': []})

@app.route('/api/propiedades', methods=['POST'])
@login_required
def crear_propiedad():
    data = request.json or {}
    pid = str(uuid.uuid4())
    conn = get_connection()
    if not conn:
        return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO propiedades
            (id, direccion, localidad, zona, tipologia, nombre_propietario, telefono, email,
             estado_tasacion, estadio, observaciones, referido, url, ultimo_contacto, proximo_contacto, fecha_prelisting)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """, (
            pid,
            data.get('direccion',''), data.get('localidad',''), data.get('zona',''),
            data.get('tipologia',''), data.get('nombre_propietario',''),
            data.get('telefono',''), data.get('email',''),
            data.get('estado_tasacion','Pendiente Visita'), data.get('estadio',''),
            data.get('observaciones',''), data.get('referido',''), data.get('url',''),
            data.get('ultimo_contacto') or None, data.get('proximo_contacto') or None,
            data.get('fecha_prelisting') or None,
        ))
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({'ok': True, 'id': pid})
    except Exception as e:
        print(f"[DB ERROR] crear_propiedad: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/propiedades/<pid>', methods=['PUT'])
@login_required
def actualizar_propiedad_v2(pid):
    data = request.json or {}
    conn = get_connection()
    if not conn:
        return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        cur.execute("""
            UPDATE propiedades SET
                direccion=%s, localidad=%s, zona=%s, tipologia=%s,
                nombre_propietario=%s, telefono=%s, email=%s,
                estado_tasacion=%s, estadio=%s, observaciones=%s,
                referido=%s, url=%s, ultimo_contacto=%s,
                proximo_contacto=%s, fecha_prelisting=%s, updated_at=NOW()
            WHERE id=%s
        """, (
            data.get('direccion',''), data.get('localidad',''), data.get('zona',''),
            data.get('tipologia',''), data.get('nombre_propietario',''),
            data.get('telefono',''), data.get('email',''),
            data.get('estado_tasacion',''), data.get('estadio',''),
            data.get('observaciones',''), data.get('referido',''), data.get('url',''),
            data.get('ultimo_contacto') or None, data.get('proximo_contacto') or None,
            data.get('fecha_prelisting') or None, pid
        ))
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/propiedades/<pid>', methods=['DELETE'])
@login_required
def eliminar_propiedad_v2(pid):
    conn = get_connection()
    if not conn:
        return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM propiedades WHERE id=%s", (pid,))
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/estados', methods=['GET'])
@login_required
def listar_estados_v2():
    conn = get_connection()
    if not conn:
        return jsonify({'estados': []})
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM estado_opciones ORDER BY orden")
        estados = [dict(r) for r in cur.fetchall()]
        cur.close()
        conn.close()
        return jsonify({'estados': estados})
    except Exception as e:
        return jsonify({'estados': []})

@app.route('/api/estados', methods=['POST'])
@login_required
def crear_estado_v2():
    data = request.json or {}
    nombre = data.get('nombre','').strip()
    if not nombre:
        return jsonify({'error': 'Nombre requerido'}), 400
    conn = get_connection()
    if not conn:
        return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO estado_opciones (nombre, color, vista, orden) VALUES (%s,%s,%s,99) ON CONFLICT DO NOTHING",
            (nombre, data.get('color','gray'), data.get('vista','listing'))
        )
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

init_db()

# ══════════════════════════════════════════
#  ROUTES: FIRMA ELECTRÓNICA
# ══════════════════════════════════════════

@app.route('/api/documento', methods=['POST'])
@login_required
def crear_documento():
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
        # Usar BASE_URL si existe, si no, auto-detectar desde request
        base_url = get_env('BASE_URL').rstrip('/') if get_env('BASE_URL') else request.host_url.rstrip('/')
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
    # Send email to each firmante
    for f in firmantes:
        if f['email']:
            html = f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f1eb;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1eb;padding:32px 0;">
  <tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
      <!-- Header -->
      <tr><td style="background:#0f0f0f;padding:24px 32px;border-bottom:3px solid #c9a84c;">
        <div style="font-family:Georgia,serif;font-size:1.3rem;color:#faf8f4;">#confiaenfede<span style="color:#c9a84c;">.</span></div>
        <div style="font-size:0.65rem;color:#888;letter-spacing:2px;text-transform:uppercase;margin-top:3px;">Sistema de Firma Electrónica</div>
      </td></tr>
      <!-- Body -->
      <tr><td style="padding:32px;">
        <h2 style="margin:0 0 8px;font-family:Georgia,serif;font-size:1.4rem;color:#0f0f0f;">Tenés un documento para firmar</h2>
        <p style="color:#666;font-size:0.9rem;margin:0 0 24px;">Hola <strong style="color:#0f0f0f;">{f['name']}</strong>,</p>
        <p style="color:#555;font-size:0.9rem;margin:0 0 16px;"><strong style="color:#0f0f0f;">{organizer_name or 'El organizador'}</strong> te solicita que firmes el siguiente documento:</p>
        <div style="background:#faf8f4;border-left:4px solid #c9a84c;border-radius:6px;padding:14px 18px;margin:0 0 24px;">
          <div style="font-weight:700;font-size:1rem;color:#0f0f0f;">{title}</div>
        </div>
        <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
          <tr><td style="background:#c9a84c;border-radius:8px;padding:14px 32px;">
            <a href="{f['sign_url']}" style="color:#0f0f0f;font-weight:700;font-size:0.95rem;text-decoration:none;display:block;">✍️ Firmar ahora</a>
          </td></tr>
        </table>
        <p style="font-size:0.78rem;color:#aaa;margin:0 0 8px;">Si el botón no funciona, copiá y pegá este link en tu navegador:</p>
        <p style="font-size:0.75rem;font-family:monospace;color:#888;background:#f8f8f8;padding:10px 12px;border-radius:6px;word-break:break-all;margin:0;">{f['sign_url']}</p>
      </td></tr>
      <!-- Footer -->
      <tr><td style="background:#f8f7f4;border-top:1px solid #e8e4dc;padding:16px 32px;text-align:center;">
        <p style="font-size:0.72rem;color:#bbb;margin:0;">#confiaenfede — Sistema de Firma Electrónica · confiaenfede.com.ar</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>"""
            import threading
            threading.Thread(target=send_email, args=(f["email"], f["name"], f"📄 Documento para firmar: {title}", html)).start()
    return jsonify({
        'doc_id': doc_id,
        'firmantes': [{'name': f['name'], 'email': f['email'],
                       'token': f['token'], 'sign_url': f['sign_url']} for f in firmantes]
    })


@app.route('/api/documentos', methods=['GET'])
@login_required
def listar_documentos():
    conn = get_connection()
    if not conn:
        docs = list(documents.values())
        for d in docs:
            d['completado'] = all(f['signed'] for f in d.get('firmantes', []))
        docs.sort(key=lambda x: x.get('created_at', ''), reverse=True)
        return jsonify({'documentos': docs})
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT id, data FROM documents ORDER BY created_at DESC")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        docs = []
        for row in rows:
            d = row['data']
            d['completado'] = all(f['signed'] for f in d.get('firmantes', []))
            docs.append(d)
        return jsonify({'documentos': docs})
    except Exception as e:
        print(f"[DB ERROR] listar_documentos: {e}")
        return jsonify({'documentos': []})


@app.route('/api/documento/<doc_id>', methods=['DELETE'])
@login_required
def eliminar_documento(doc_id):
    conn = get_connection()
    if conn:
        try:
            cur = conn.cursor()
            cur.execute("DELETE FROM documents WHERE id=%s", (doc_id,))
            conn.commit()
            cur.close()
            conn.close()
        except Exception as e:
            print(f"[DB ERROR] eliminar: {e}")
    else:
        documents.pop(doc_id, None)
    return jsonify({'ok': True})


@app.route('/api/documento/<doc_id>/estado', methods=['GET'])
def estado_documento(doc_id):
    doc = get_doc(doc_id)
    if not doc:
        return jsonify({'error': 'No encontrado'}), 404
    firmantes = doc.get('firmantes', [])
    all_signed = all(f['signed'] for f in firmantes)
    return jsonify({
        'id': doc_id,
        'title': doc.get('title'),
        'firmantes': firmantes,
        'all_signed': all_signed,
    })


@app.route('/firmar/<doc_id>/<token>')
def pagina_firmar(doc_id, token):
    doc = get_doc(doc_id)
    if not doc:
        return "Documento no encontrado", 404
    firmante = next((f for f in doc['firmantes'] if f['token'] == token), None)
    if not firmante:
        return "Link inválido", 404
    return render_template('firmar.html', doc=doc, firmante=firmante, doc_id=doc_id, token=token)


@app.route('/api/firmar/<doc_id>/<token>', methods=['POST'])
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
    ip = request.headers.get('X-Forwarded-For', request.remote_addr)
    firmante['signed'] = True
    firmante['signed_at'] = datetime.now().isoformat()
    firmante['ip'] = ip
    firmante['signature_dataurl'] = signature_dataurl
    save_doc(doc_id, doc)
    all_signed = all(f['signed'] for f in doc['firmantes'])
    if all_signed and doc.get('organizer_email'):
        pdf_bytes = generate_full_pdf(doc)
        html = f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f1eb;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1eb;padding:32px 0;">
  <tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
      <!-- Header -->
      <tr><td style="background:#0f0f0f;padding:24px 32px;border-bottom:3px solid #c9a84c;">
        <div style="font-family:Georgia,serif;font-size:1.3rem;color:#faf8f4;">#confiaenfede<span style="color:#c9a84c;">.</span></div>
        <div style="font-size:0.65rem;color:#888;letter-spacing:2px;text-transform:uppercase;margin-top:3px;">Sistema de Firma Electrónica</div>
      </td></tr>
      <!-- Body -->
      <tr><td style="padding:32px;">
        <div style="text-align:center;margin-bottom:20px;">
          <div style="display:inline-block;background:#e8f5e9;border-radius:50%;width:56px;height:56px;line-height:56px;font-size:1.8rem;">✅</div>
        </div>
        <h2 style="margin:0 0 8px;font-family:Georgia,serif;font-size:1.4rem;color:#0f0f0f;text-align:center;">Documento completado</h2>
        <p style="color:#666;font-size:0.9rem;margin:0 0 24px;text-align:center;">Todos los firmantes completaron el documento</p>
        <div style="background:#f0faf4;border-left:4px solid #52b788;border-radius:6px;padding:14px 18px;margin:0 0 24px;">
          <div style="font-weight:700;font-size:1rem;color:#0f0f0f;">{doc.get('title')}</div>
          <div style="font-size:0.8rem;color:#666;margin-top:4px;">{len(doc['firmantes'])} firmante{'s' if len(doc['firmantes'])>1 else ''} · Completado el {datetime.now().strftime('%d/%m/%Y a las %H:%M')}</div>
        </div>
        <p style="color:#555;font-size:0.88rem;margin:0 0 8px;">El PDF con todas las firmas y el certificado de auditoría se encuentra adjunto a este email.</p>
        <p style="font-size:0.8rem;color:#aaa;margin:0;">Firmantes:</p>
        <ul style="margin:8px 0 0;padding:0 0 0 18px;">
          {''.join(f'<li style="font-size:0.82rem;color:#555;margin-bottom:4px;"><strong>{f["name"]}</strong> — {f["email"]} <span style="color:#2d6a4f;">✓</span></li>' for f in doc['firmantes'])}
        </ul>
      </td></tr>
      <!-- Footer -->
      <tr><td style="background:#f8f7f4;border-top:1px solid #e8e4dc;padding:16px 32px;text-align:center;">
        <p style="font-size:0.72rem;color:#bbb;margin:0;">#confiaenfede — Sistema de Firma Electrónica · confiaenfede.com.ar</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>"""
        import threading
        threading.Thread(target=send_email, args=(
            doc['organizer_email'], doc.get('organizer_name',''),
            f"✅ Firmado: {doc.get('title')}", html,
            pdf_bytes, f"documento-firmado-{doc_id[:8]}.pdf"
        )).start()
    signed_count = sum(1 for f in doc['firmantes'] if f['signed'])
    total = len(doc['firmantes'])
    return jsonify({'ok': True, 'all_signed': all_signed, 'signed_count': signed_count, 'total': total})


@app.route('/estado/<doc_id>')
@login_required
def pagina_estado(doc_id):
    doc = get_doc(doc_id)
    if not doc:
        return "Documento no encontrado", 404
    return render_template('estado.html', doc=doc, doc_id=doc_id)


@app.route('/api/documento/<doc_id>/certificado')
@login_required
def descargar_certificado(doc_id):
    doc = get_doc(doc_id)
    if not doc:
        return "No encontrado", 404
    pdf_bytes = generate_full_pdf(doc)
    from flask import Response
    resp = Response(pdf_bytes, mimetype='application/pdf')
    resp.headers['Content-Disposition'] = f'attachment; filename="firmado-{doc_id[:8]}.pdf"'
    return resp


init_db()
init_propiedades()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
