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

from flask import (Flask, request, jsonify, render_template, render_template_string,
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

        # ── Core tables ──
        cur.execute("""CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY, data JSONB NOT NULL, created_at TIMESTAMP DEFAULT NOW())""")
        cur.execute("""CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
            password_hash TEXT NOT NULL, role TEXT DEFAULT 'member',
            created_at TIMESTAMP DEFAULT NOW(), last_login TIMESTAMP,
            permisos JSONB DEFAULT '{}')""")
        cur.execute("""CREATE TABLE IF NOT EXISTS user_sessions (
            token TEXT PRIMARY KEY, user_id TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW(), expires_at TIMESTAMP NOT NULL)""")

        # ── Propiedades (per-user) ──
        cur.execute("""CREATE TABLE IF NOT EXISTS propiedades (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL DEFAULT 'legacy',
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
        )""")
        # ── Migraciones de columnas faltantes (seguro correr siempre) ──
        migraciones = [
            "ALTER TABLE propiedades ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT 'legacy'",
            "ALTER TABLE propiedades ADD COLUMN IF NOT EXISTS email TEXT",
            "ALTER TABLE propiedades ADD COLUMN IF NOT EXISTS estadio TEXT",
            "ALTER TABLE propiedades ADD COLUMN IF NOT EXISTS referido TEXT",
            "ALTER TABLE propiedades ADD COLUMN IF NOT EXISTS url TEXT",
            "ALTER TABLE propiedades ADD COLUMN IF NOT EXISTS ultimo_contacto TEXT",
            "ALTER TABLE propiedades ADD COLUMN IF NOT EXISTS proximo_contacto TEXT",
            "ALTER TABLE propiedades ADD COLUMN IF NOT EXISTS fecha_prelisting TEXT",
            "ALTER TABLE propiedades ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS permisos JSONB DEFAULT '{}'",
        ]
        for m in migraciones:
            try: cur.execute(m)
            except Exception as me: print(f"[MIGRATE] {me}")
        # Migrate legacy propiedades without user_id
        cur.execute("UPDATE propiedades SET user_id='legacy' WHERE user_id IS NULL OR user_id=''")

        # ── Estados de propiedades (per-user) ──
        cur.execute("""CREATE TABLE IF NOT EXISTS estado_opciones (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL DEFAULT 'global',
            nombre TEXT NOT NULL,
            color TEXT DEFAULT 'gray',
            vista TEXT DEFAULT 'listing',
            orden INTEGER DEFAULT 99,
            UNIQUE(user_id, nombre)
        )""")
        # Seed global defaults
        cur.execute("SELECT COUNT(*) FROM estado_opciones WHERE user_id='global'")
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
                    "INSERT INTO estado_opciones (user_id, nombre, color, vista, orden) VALUES ('global',%s,%s,%s,%s) ON CONFLICT DO NOTHING",
                    e
                )

        # ── Contactos (per-user) ──
        cur.execute("""CREATE TABLE IF NOT EXISTS contactos (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            nombre TEXT NOT NULL,
            tipo TEXT DEFAULT 'otro',
            telefono TEXT,
            email TEXT,
            localidad TEXT,
            referido TEXT,
            profesion TEXT,
            familia TEXT,
            operacion TEXT,
            notas TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )""")

        # ── Consultas (per-user) ──
        cur.execute("""CREATE TABLE IF NOT EXISTS consultas (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            nombre TEXT,
            telefono TEXT,
            email TEXT,
            propiedad_id TEXT,
            propiedad_nombre TEXT,
            mensaje TEXT,
            estado TEXT DEFAULT 'nuevo',
            canal TEXT DEFAULT 'whatsapp',
            presupuesto TEXT,
            zona_interes TEXT,
            operacion TEXT DEFAULT 'compra',
            notas TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )""")

        # ── Cierres (per-user) ──
        cur.execute("""CREATE TABLE IF NOT EXISTS cierres (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            propiedad TEXT,
            propiedad_id TEXT,
            comprador TEXT,
            vendedor TEXT,
            valor_operacion NUMERIC DEFAULT 0,
            moneda TEXT DEFAULT 'USD',
            comision_pct NUMERIC DEFAULT 3,
            comision_bruta NUMERIC DEFAULT 0,
            comision_neta NUMERIC DEFAULT 0,
            fecha TEXT,
            tipo TEXT DEFAULT 'venta',
            notas TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )""")

        # ── Eventos de agenda (per-user) ──
        cur.execute("""CREATE TABLE IF NOT EXISTS eventos (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            titulo TEXT NOT NULL,
            fecha TEXT NOT NULL,
            hora TEXT,
            tipo TEXT DEFAULT 'reunion',
            notas TEXT,
            contacto_id TEXT,
            propiedad_id TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )""")

        # ── Tareas (per-user) ──
        cur.execute("""CREATE TABLE IF NOT EXISTS tareas (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            titulo TEXT NOT NULL,
            descripcion TEXT,
            estado TEXT DEFAULT 'pendiente',
            prioridad TEXT DEFAULT 'media',
            fecha_venc TEXT,
            propiedad_id TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )""")

        # ── Textos precargados (per-user) ──
        cur.execute("""CREATE TABLE IF NOT EXISTS textos (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            titulo TEXT NOT NULL,
            contenido TEXT,
            tipo TEXT DEFAULT 'whatsapp',
            categoria TEXT DEFAULT 'general',
            created_at TIMESTAMP DEFAULT NOW()
        )""")

        # ── Guiones Instagram (per-user) ──
        cur.execute("""CREATE TABLE IF NOT EXISTS guiones (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            titulo TEXT,
            hook TEXT,
            desarrollo TEXT,
            cta TEXT,
            grabado BOOLEAN DEFAULT FALSE,
            fecha_grabacion TEXT,
            tema TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )""")

        # ── Ideas (per-user) ──
        cur.execute("""CREATE TABLE IF NOT EXISTS ideas (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            texto TEXT NOT NULL,
            estado TEXT DEFAULT 'pendiente',
            created_at TIMESTAMP DEFAULT NOW()
        )""")

        # ── Objetivos (per-user) ──
        cur.execute("""CREATE TABLE IF NOT EXISTS objetivos (
            id TEXT PRIMARY KEY,
            user_id TEXT UNIQUE NOT NULL,
            data JSONB NOT NULL DEFAULT '{}',
            updated_at TIMESTAMP DEFAULT NOW()
        )""")

        # ── Planilla (per-user) ──
        cur.execute("""CREATE TABLE IF NOT EXISTS planilla (
            id TEXT PRIMARY KEY,
            user_id TEXT UNIQUE NOT NULL,
            data JSONB NOT NULL DEFAULT '[]',
            updated_at TIMESTAMP DEFAULT NOW()
        )""")

        conn.commit(); cur.close(); conn.close()
        print("[DB] All tables ready (multi-user)")
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
    except Exception as e:
        print(f"[AUTH] get_user_by_email: {e}"); return None

def get_user_by_id(uid):
    conn = get_connection()
    if not conn: return None
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM users WHERE id = %s", (uid,))
        row = cur.fetchone(); cur.close(); conn.close()
        return dict(row) if row else None
    except Exception as e:
        return None

def list_users():
    conn = get_connection()
    if not conn: return []
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT id, email, name, role, created_at, last_login, permisos FROM users ORDER BY created_at")
        rows = [dict(r) for r in cur.fetchall()]
        cur.close(); conn.close()
        return rows
    except Exception as e:
        return []

def create_user(email, name, password, role='member', permisos=None):
    conn = get_connection()
    if not conn: return None
    try:
        uid = str(uuid.uuid4())
        cur = conn.cursor()
        cur.execute("INSERT INTO users (id,email,name,password_hash,role,permisos) VALUES (%s,%s,%s,%s,%s,%s)",
            (uid, email.lower().strip(), name, hash_password(password), role,
             json.dumps(permisos or {})))
        conn.commit(); cur.close(); conn.close()
        return uid
    except Exception as e:
        print(f"[AUTH] create_user error: {e}"); return None

def create_session(user_id, remember=False):
    conn = get_connection()
    token = secrets.token_urlsafe(32)
    expires = datetime.now() + timedelta(days=30 if remember else 1)
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
                    'email': user['email'], 'role': user['role'],
                    'permisos': user.get('permisos') or {}})

@app.route('/api/admin/users', methods=['GET'])
@admin_required
def admin_list_users():
    return jsonify({'users': list_users()})

@app.route('/api/admin/users/<user_id>/invite', methods=['POST'])
@admin_required
def admin_invite_link(user_id):
    """Genera un token de invitación de 48hs para que el usuario setee su contraseña"""
    token = secrets.token_urlsafe(24)
    expires = datetime.now() + timedelta(hours=48)
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        # Reutilizamos user_sessions con un prefijo especial
        cur.execute("DELETE FROM user_sessions WHERE user_id=%s AND token LIKE 'invite_%'", (user_id,))
        cur.execute("INSERT INTO user_sessions (token,user_id,expires_at) VALUES (%s,%s,%s)",
            (f'invite_{token}', user_id, expires))
        conn.commit(); cur.close(); conn.close()
        base = request.host_url.rstrip('/')
        return jsonify({'ok': True, 'link': f'{base}/set-password?token={token}'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/set-password', methods=['GET','POST'])
def set_password_page():
    token = request.args.get('token') or request.form.get('token','')
    full_token = f'invite_{token}'
    conn = get_connection()
    if not conn: return 'Error de conexión', 500
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT user_id FROM user_sessions WHERE token=%s AND expires_at>NOW()", (full_token,))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return '<h2>Link inválido o expirado. Pedí un nuevo link al administrador.</h2>', 400
        user_id = row['user_id']
        if request.method == 'POST':
            pw = request.form.get('password','').strip()
            if len(pw) < 6:
                cur.close(); conn.close()
                return render_template_string(SET_PW_HTML, token=token, error='Mínimo 6 caracteres')
            cur.execute("UPDATE users SET password_hash=%s WHERE id=%s", (hash_password(pw), user_id))
            cur.execute("DELETE FROM user_sessions WHERE token=%s", (full_token,))
            conn.commit(); cur.close(); conn.close()
            return redirect('/login?msg=Contraseña configurada. Ya podés ingresar.')
        cur.close(); conn.close()
        return render_template_string(SET_PW_HTML, token=token, error=None)
    except Exception as e:
        return str(e), 500

SET_PW_HTML = """<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Configurar contraseña — Realvix</title>
<style>body{font-family:'DM Sans',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f7f5f0;margin:0;}
.box{background:white;border-radius:16px;padding:40px;max-width:380px;width:90%;box-shadow:0 4px 24px rgba(0,0,0,0.08);}
h2{font-size:1.4rem;margin-bottom:6px;}p{color:#888;font-size:0.85rem;margin-bottom:24px;}
label{font-size:0.78rem;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:#666;display:block;margin-bottom:6px;}
input{width:100%;padding:10px 14px;border:1.5px solid #e0dbd0;border-radius:8px;font-size:0.9rem;box-sizing:border-box;margin-bottom:16px;}
button{width:100%;padding:12px;background:#1a1a1a;color:white;border:none;border-radius:8px;font-size:0.9rem;font-weight:600;cursor:pointer;}
.err{background:#fff0f0;border:1px solid #fcc;border-radius:8px;padding:10px 14px;color:#c0392b;font-size:0.83rem;margin-bottom:16px;}</style></head>
<body><div class="box"><h2>Crear tu contraseña</h2><p>Ingresá la contraseña con la que vas a acceder a Realvix CRM.</p>
{% if error %}<div class="err">{{ error }}</div>{% endif %}
<form method="POST"><input type="hidden" name="token" value="{{ token }}">
<label>Nueva contraseña</label><input type="password" name="password" placeholder="Mínimo 6 caracteres" required>
<button type="submit">Guardar y entrar →</button></form></div></body></html>"""

@app.route('/api/admin/users', methods=['POST'])
@admin_required
def admin_create_user():
    data = request.json or {}
    email = data.get('email','').strip()
    name = data.get('name','').strip()
    password = data.get('password','').strip()
    role = data.get('role','member')
    permisos = data.get('permisos', {})
    if not email or not name or not password:
        return jsonify({'error': 'Todos los campos son requeridos'}), 400
    if get_user_by_email(email):
        return jsonify({'error': 'Ya existe una cuenta con ese email'}), 409
    uid = create_user(email, name, password, role, permisos)
    if not uid: return jsonify({'error': 'Error al crear usuario'}), 500
    return jsonify({'ok': True, 'user_id': uid})

@app.route('/api/admin/users/<user_id>', methods=['PUT'])
@admin_required
def admin_update_user(user_id):
    data = request.json or {}
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        if 'permisos' in data:
            cur.execute("UPDATE users SET permisos=%s WHERE id=%s",
                (json.dumps(data['permisos']), user_id))
        if 'role' in data:
            cur.execute("UPDATE users SET role=%s WHERE id=%s", (data['role'], user_id))
        if 'name' in data:
            cur.execute("UPDATE users SET name=%s WHERE id=%s", (data['name'], user_id))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

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


@app.route('/api/migrate', methods=['POST'])
@admin_required
def forzar_migracion():
    """Fuerza migraciones de DB — llamar desde el navegador si hay errores de columnas"""
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    resultados = []
    migraciones = [
        "ALTER TABLE propiedades ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT 'legacy'",
        "ALTER TABLE propiedades ADD COLUMN IF NOT EXISTS email TEXT",
        "ALTER TABLE propiedades ADD COLUMN IF NOT EXISTS estadio TEXT",
        "ALTER TABLE propiedades ADD COLUMN IF NOT EXISTS referido TEXT",
        "ALTER TABLE propiedades ADD COLUMN IF NOT EXISTS url TEXT",
        "ALTER TABLE propiedades ADD COLUMN IF NOT EXISTS ultimo_contacto TEXT",
        "ALTER TABLE propiedades ADD COLUMN IF NOT EXISTS proximo_contacto TEXT",
        "ALTER TABLE propiedades ADD COLUMN IF NOT EXISTS fecha_prelisting TEXT",
        "ALTER TABLE propiedades ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS permisos JSONB DEFAULT '{}'",
        "UPDATE propiedades SET user_id='legacy' WHERE user_id IS NULL OR user_id=''",
    ]
    try:
        cur = conn.cursor()
        for m in migraciones:
            try:
                cur.execute(m)
                resultados.append({'ok': True, 'sql': m[:70]})
            except Exception as e:
                resultados.append({'ok': False, 'sql': m[:70], 'error': str(e)})
                try: conn.rollback()
                except: pass
                conn = get_connection()
                cur = conn.cursor()
        conn.commit()
        cur.close(); conn.close()
        return jsonify({'ok': True, 'resultados': resultados})
    except Exception as e:
        return jsonify({'error': str(e), 'resultados': resultados}), 500


# ══════════════════════════════════════════
#  ROUTES: MAIN
# ══════════════════════════════════════════

@app.route('/')
@login_required
def index():
    return render_template('index.html')


# ══════════════════════════════════════════
#  CONTACTOS (per-user)
# ══════════════════════════════════════════

@app.route('/api/contactos', methods=['GET'])
@login_required
def listar_contactos():
    user = get_current_user()
    conn = get_connection()
    if not conn: return jsonify({'contactos': []})
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM contactos WHERE user_id=%s ORDER BY created_at DESC", (user['id'],))
        rows = [dict(r) for r in cur.fetchall()]
        cur.close(); conn.close()
        return jsonify({'contactos': rows})
    except Exception as e:
        return jsonify({'contactos': []})

@app.route('/api/contactos', methods=['POST'])
@login_required
def crear_contacto():
    user = get_current_user()
    data = request.json or {}
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cid = data.get('id') or str(uuid.uuid4())
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO contactos (id, user_id, nombre, tipo, telefono, email, localidad,
                referido, profesion, familia, operacion, notas)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (id) DO UPDATE SET
                nombre=EXCLUDED.nombre, tipo=EXCLUDED.tipo, telefono=EXCLUDED.telefono,
                email=EXCLUDED.email, localidad=EXCLUDED.localidad, referido=EXCLUDED.referido,
                profesion=EXCLUDED.profesion, familia=EXCLUDED.familia,
                operacion=EXCLUDED.operacion, notas=EXCLUDED.notas, updated_at=NOW()
        """, (cid, user['id'], data.get('nombre',''), data.get('tipo','otro'),
              data.get('telefono',''), data.get('email',''), data.get('localidad',''),
              data.get('referido',''), data.get('profesion',''), data.get('familia',''),
              data.get('operacion',''), data.get('notas','')))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True, 'id': cid})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/contactos/<cid>', methods=['PUT'])
@login_required
def actualizar_contacto(cid):
    user = get_current_user()
    data = request.json or {}
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        cur.execute("""
            UPDATE contactos SET nombre=%s, tipo=%s, telefono=%s, email=%s, localidad=%s,
                referido=%s, profesion=%s, familia=%s, operacion=%s, notas=%s, updated_at=NOW()
            WHERE id=%s AND user_id=%s
        """, (data.get('nombre',''), data.get('tipo','otro'), data.get('telefono',''),
              data.get('email',''), data.get('localidad',''), data.get('referido',''),
              data.get('profesion',''), data.get('familia',''), data.get('operacion',''),
              data.get('notas',''), cid, user['id']))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/contactos/<cid>', methods=['DELETE'])
@login_required
def eliminar_contacto(cid):
    user = get_current_user()
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM contactos WHERE id=%s AND user_id=%s", (cid, user['id']))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ══════════════════════════════════════════
#  CONSULTAS (per-user)
# ══════════════════════════════════════════

@app.route('/api/consultas', methods=['GET'])
@login_required
def listar_consultas():
    user = get_current_user()
    conn = get_connection()
    if not conn: return jsonify({'consultas': []})
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM consultas WHERE user_id=%s ORDER BY created_at DESC", (user['id'],))
        rows = [dict(r) for r in cur.fetchall()]
        cur.close(); conn.close()
        return jsonify({'consultas': rows})
    except:
        return jsonify({'consultas': []})

@app.route('/api/consultas', methods=['POST'])
@login_required
def crear_consulta():
    user = get_current_user()
    data = request.json or {}
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cid = data.get('id') or str(uuid.uuid4())
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO consultas (id, user_id, nombre, telefono, email, propiedad_id,
                propiedad_nombre, mensaje, estado, canal, presupuesto, zona_interes, operacion, notas)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (id) DO UPDATE SET
                nombre=EXCLUDED.nombre, telefono=EXCLUDED.telefono, email=EXCLUDED.email,
                propiedad_id=EXCLUDED.propiedad_id, propiedad_nombre=EXCLUDED.propiedad_nombre,
                mensaje=EXCLUDED.mensaje, estado=EXCLUDED.estado, canal=EXCLUDED.canal,
                presupuesto=EXCLUDED.presupuesto, zona_interes=EXCLUDED.zona_interes,
                operacion=EXCLUDED.operacion, notas=EXCLUDED.notas, updated_at=NOW()
        """, (cid, user['id'], data.get('nombre',''), data.get('telefono',''),
              data.get('email',''), data.get('propiedad_id',''), data.get('propiedad_nombre',''),
              data.get('mensaje',''), data.get('estado','nuevo'), data.get('canal','whatsapp'),
              data.get('presupuesto',''), data.get('zona_interes',''),
              data.get('operacion','compra'), data.get('notas','')))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True, 'id': cid})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/consultas/<cid>', methods=['PUT'])
@login_required
def actualizar_consulta(cid):
    user = get_current_user()
    data = request.json or {}
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        cur.execute("""
            UPDATE consultas SET nombre=%s, telefono=%s, email=%s, propiedad_id=%s,
                propiedad_nombre=%s, mensaje=%s, estado=%s, canal=%s, presupuesto=%s,
                zona_interes=%s, operacion=%s, notas=%s, updated_at=NOW()
            WHERE id=%s AND user_id=%s
        """, (data.get('nombre',''), data.get('telefono',''), data.get('email',''),
              data.get('propiedad_id',''), data.get('propiedad_nombre',''),
              data.get('mensaje',''), data.get('estado','nuevo'), data.get('canal','whatsapp'),
              data.get('presupuesto',''), data.get('zona_interes',''),
              data.get('operacion','compra'), data.get('notas',''), cid, user['id']))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/consultas/<cid>', methods=['DELETE'])
@login_required
def eliminar_consulta(cid):
    user = get_current_user()
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM consultas WHERE id=%s AND user_id=%s", (cid, user['id']))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ══════════════════════════════════════════
#  CIERRES (per-user)
# ══════════════════════════════════════════

@app.route('/api/cierres', methods=['GET'])
@login_required
def listar_cierres():
    user = get_current_user()
    conn = get_connection()
    if not conn: return jsonify({'cierres': []})
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM cierres WHERE user_id=%s ORDER BY created_at DESC", (user['id'],))
        rows = [dict(r) for r in cur.fetchall()]
        cur.close(); conn.close()
        return jsonify({'cierres': rows})
    except:
        return jsonify({'cierres': []})

@app.route('/api/cierres', methods=['POST'])
@login_required
def crear_cierre():
    user = get_current_user()
    data = request.json or {}
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cid = data.get('id') or str(uuid.uuid4())
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO cierres (id, user_id, propiedad, propiedad_id, comprador, vendedor,
                valor_operacion, moneda, comision_pct, comision_bruta, comision_neta,
                fecha, tipo, notas)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (id) DO UPDATE SET
                propiedad=EXCLUDED.propiedad, propiedad_id=EXCLUDED.propiedad_id,
                comprador=EXCLUDED.comprador, vendedor=EXCLUDED.vendedor,
                valor_operacion=EXCLUDED.valor_operacion, moneda=EXCLUDED.moneda,
                comision_pct=EXCLUDED.comision_pct, comision_bruta=EXCLUDED.comision_bruta,
                comision_neta=EXCLUDED.comision_neta, fecha=EXCLUDED.fecha,
                tipo=EXCLUDED.tipo, notas=EXCLUDED.notas
        """, (cid, user['id'], data.get('propiedad',''), data.get('propiedad_id',''),
              data.get('comprador',''), data.get('vendedor',''),
              data.get('valor_operacion',0), data.get('moneda','USD'),
              data.get('comision_pct',3), data.get('comision_bruta',0),
              data.get('comision_neta',0), data.get('fecha',''), data.get('tipo','venta'),
              data.get('notas','')))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True, 'id': cid})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/cierres/<cid>', methods=['PUT'])
@login_required
def actualizar_cierre(cid):
    user = get_current_user()
    data = request.json or {}
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        cur.execute("""
            UPDATE cierres SET propiedad=%s, propiedad_id=%s, comprador=%s, vendedor=%s,
                valor_operacion=%s, moneda=%s, comision_pct=%s, comision_bruta=%s,
                comision_neta=%s, fecha=%s, tipo=%s, notas=%s
            WHERE id=%s AND user_id=%s
        """, (data.get('propiedad',''), data.get('propiedad_id',''),
              data.get('comprador',''), data.get('vendedor',''),
              data.get('valor_operacion',0), data.get('moneda','USD'),
              data.get('comision_pct',3), data.get('comision_bruta',0),
              data.get('comision_neta',0), data.get('fecha',''),
              data.get('tipo','venta'), data.get('notas',''), cid, user['id']))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/cierres/<cid>', methods=['DELETE'])
@login_required
def eliminar_cierre(cid):
    user = get_current_user()
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM cierres WHERE id=%s AND user_id=%s", (cid, user['id']))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ══════════════════════════════════════════
#  EVENTOS / AGENDA (per-user)
# ══════════════════════════════════════════

@app.route('/api/eventos', methods=['GET'])
@login_required
def listar_eventos():
    user = get_current_user()
    conn = get_connection()
    if not conn: return jsonify({'eventos': []})
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM eventos WHERE user_id=%s ORDER BY fecha, hora", (user['id'],))
        rows = [dict(r) for r in cur.fetchall()]
        cur.close(); conn.close()
        return jsonify({'eventos': rows})
    except:
        return jsonify({'eventos': []})

@app.route('/api/eventos', methods=['POST'])
@login_required
def crear_evento():
    user = get_current_user()
    data = request.json or {}
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        eid = data.get('id') or str(uuid.uuid4())
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO eventos (id, user_id, titulo, fecha, hora, tipo, notas, contacto_id, propiedad_id)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (id) DO UPDATE SET
                titulo=EXCLUDED.titulo, fecha=EXCLUDED.fecha, hora=EXCLUDED.hora,
                tipo=EXCLUDED.tipo, notas=EXCLUDED.notas,
                contacto_id=EXCLUDED.contacto_id, propiedad_id=EXCLUDED.propiedad_id
        """, (eid, user['id'], data.get('titulo',''), data.get('fecha',''),
              data.get('hora',''), data.get('tipo','reunion'), data.get('notas',''),
              data.get('contacto_id',''), data.get('propiedad_id','')))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True, 'id': eid})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/eventos/<eid>', methods=['PUT'])
@login_required
def actualizar_evento(eid):
    user = get_current_user()
    data = request.json or {}
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        cur.execute("""
            UPDATE eventos SET titulo=%s, fecha=%s, hora=%s, tipo=%s, notas=%s,
                contacto_id=%s, propiedad_id=%s
            WHERE id=%s AND user_id=%s
        """, (data.get('titulo',''), data.get('fecha',''), data.get('hora',''),
              data.get('tipo','reunion'), data.get('notas',''),
              data.get('contacto_id',''), data.get('propiedad_id',''),
              eid, user['id']))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/eventos/<eid>', methods=['DELETE'])
@login_required
def eliminar_evento(eid):
    user = get_current_user()
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM eventos WHERE id=%s AND user_id=%s", (eid, user['id']))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ══════════════════════════════════════════
#  TAREAS (per-user)
# ══════════════════════════════════════════

@app.route('/api/tareas', methods=['GET'])
@login_required
def listar_tareas():
    user = get_current_user()
    conn = get_connection()
    if not conn: return jsonify({'tareas': []})
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM tareas WHERE user_id=%s ORDER BY created_at DESC", (user['id'],))
        rows = [dict(r) for r in cur.fetchall()]
        cur.close(); conn.close()
        return jsonify({'tareas': rows})
    except:
        return jsonify({'tareas': []})

@app.route('/api/tareas', methods=['POST'])
@login_required
def crear_tarea():
    user = get_current_user()
    data = request.json or {}
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        tid = data.get('id') or str(uuid.uuid4())
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO tareas (id, user_id, titulo, descripcion, estado, prioridad, fecha_venc, propiedad_id)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (id) DO UPDATE SET
                titulo=EXCLUDED.titulo, descripcion=EXCLUDED.descripcion,
                estado=EXCLUDED.estado, prioridad=EXCLUDED.prioridad,
                fecha_venc=EXCLUDED.fecha_venc, propiedad_id=EXCLUDED.propiedad_id,
                updated_at=NOW()
        """, (tid, user['id'], data.get('titulo',''), data.get('descripcion',''),
              data.get('estado','pendiente'), data.get('prioridad','media'),
              data.get('fecha_venc',''), data.get('propiedad_id','')))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True, 'id': tid})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/tareas/<tid>', methods=['PUT'])
@login_required
def actualizar_tarea(tid):
    user = get_current_user()
    data = request.json or {}
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        cur.execute("""
            UPDATE tareas SET titulo=%s, descripcion=%s, estado=%s, prioridad=%s,
                fecha_venc=%s, propiedad_id=%s, updated_at=NOW()
            WHERE id=%s AND user_id=%s
        """, (data.get('titulo',''), data.get('descripcion',''), data.get('estado','pendiente'),
              data.get('prioridad','media'), data.get('fecha_venc',''),
              data.get('propiedad_id',''), tid, user['id']))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/tareas/<tid>', methods=['DELETE'])
@login_required
def eliminar_tarea(tid):
    user = get_current_user()
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM tareas WHERE id=%s AND user_id=%s", (tid, user['id']))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ══════════════════════════════════════════
#  TEXTOS (per-user)
# ══════════════════════════════════════════

@app.route('/api/textos', methods=['GET'])
@login_required
def listar_textos():
    user = get_current_user()
    conn = get_connection()
    if not conn: return jsonify({'textos': []})
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM textos WHERE user_id=%s ORDER BY created_at DESC", (user['id'],))
        rows = [dict(r) for r in cur.fetchall()]
        cur.close(); conn.close()
        return jsonify({'textos': rows})
    except:
        return jsonify({'textos': []})

@app.route('/api/textos', methods=['POST'])
@login_required
def crear_texto():
    user = get_current_user()
    data = request.json or {}
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        tid = data.get('id') or str(uuid.uuid4())
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO textos (id, user_id, titulo, contenido, tipo, categoria)
            VALUES (%s,%s,%s,%s,%s,%s)
            ON CONFLICT (id) DO UPDATE SET
                titulo=EXCLUDED.titulo, contenido=EXCLUDED.contenido,
                tipo=EXCLUDED.tipo, categoria=EXCLUDED.categoria
        """, (tid, user['id'], data.get('titulo',''), data.get('contenido',''),
              data.get('tipo','whatsapp'), data.get('categoria','general')))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True, 'id': tid})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/textos/<tid>', methods=['PUT'])
@login_required
def actualizar_texto(tid):
    user = get_current_user()
    data = request.json or {}
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        cur.execute("""
            UPDATE textos SET titulo=%s, contenido=%s, tipo=%s, categoria=%s
            WHERE id=%s AND user_id=%s
        """, (data.get('titulo',''), data.get('contenido',''),
              data.get('tipo','whatsapp'), data.get('categoria','general'),
              tid, user['id']))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/textos/<tid>', methods=['DELETE'])
@login_required
def eliminar_texto(tid):
    user = get_current_user()
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM textos WHERE id=%s AND user_id=%s", (tid, user['id']))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ══════════════════════════════════════════
#  GUIONES INSTAGRAM (per-user)
# ══════════════════════════════════════════

@app.route('/api/guiones', methods=['GET'])
@login_required
def listar_guiones():
    user = get_current_user()
    conn = get_connection()
    if not conn: return jsonify({'guiones': []})
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM guiones WHERE user_id=%s ORDER BY created_at DESC", (user['id'],))
        rows = [dict(r) for r in cur.fetchall()]
        cur.close(); conn.close()
        return jsonify({'guiones': rows})
    except:
        return jsonify({'guiones': []})

@app.route('/api/guiones', methods=['POST'])
@login_required
def crear_guion():
    user = get_current_user()
    data = request.json or {}
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        gid = data.get('id') or str(uuid.uuid4())
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO guiones (id, user_id, titulo, hook, desarrollo, cta, grabado, fecha_grabacion, tema)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (id) DO UPDATE SET
                titulo=EXCLUDED.titulo, hook=EXCLUDED.hook, desarrollo=EXCLUDED.desarrollo,
                cta=EXCLUDED.cta, grabado=EXCLUDED.grabado, fecha_grabacion=EXCLUDED.fecha_grabacion,
                tema=EXCLUDED.tema
        """, (gid, user['id'], data.get('titulo',''), data.get('hook',''),
              data.get('desarrollo',''), data.get('cta',''),
              data.get('grabado', False), data.get('fecha_grabacion',''), data.get('tema','')))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True, 'id': gid})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/guiones/<gid>', methods=['PUT'])
@login_required
def actualizar_guion(gid):
    user = get_current_user()
    data = request.json or {}
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        cur.execute("""
            UPDATE guiones SET titulo=%s, hook=%s, desarrollo=%s, cta=%s,
                grabado=%s, fecha_grabacion=%s, tema=%s
            WHERE id=%s AND user_id=%s
        """, (data.get('titulo',''), data.get('hook',''), data.get('desarrollo',''),
              data.get('cta',''), data.get('grabado', False), data.get('fecha_grabacion',''),
              data.get('tema',''), gid, user['id']))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/guiones/<gid>', methods=['DELETE'])
@login_required
def eliminar_guion(gid):
    user = get_current_user()
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM guiones WHERE id=%s AND user_id=%s", (gid, user['id']))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ══════════════════════════════════════════
#  IDEAS (per-user)
# ══════════════════════════════════════════

@app.route('/api/ideas', methods=['GET'])
@login_required
def listar_ideas():
    user = get_current_user()
    conn = get_connection()
    if not conn: return jsonify({'ideas': []})
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM ideas WHERE user_id=%s ORDER BY created_at DESC", (user['id'],))
        rows = [dict(r) for r in cur.fetchall()]
        cur.close(); conn.close()
        return jsonify({'ideas': rows})
    except:
        return jsonify({'ideas': []})

@app.route('/api/ideas', methods=['POST'])
@login_required
def crear_idea():
    user = get_current_user()
    data = request.json or {}
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        iid = data.get('id') or str(uuid.uuid4())
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO ideas (id, user_id, texto, estado)
            VALUES (%s,%s,%s,%s)
            ON CONFLICT (id) DO UPDATE SET texto=EXCLUDED.texto, estado=EXCLUDED.estado
        """, (iid, user['id'], data.get('texto',''), data.get('estado','pendiente')))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True, 'id': iid})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/ideas/<iid>', methods=['PUT'])
@login_required
def actualizar_idea(iid):
    user = get_current_user()
    data = request.json or {}
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        cur.execute("UPDATE ideas SET texto=%s, estado=%s WHERE id=%s AND user_id=%s",
            (data.get('texto',''), data.get('estado','pendiente'), iid, user['id']))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/ideas/<iid>', methods=['DELETE'])
@login_required
def eliminar_idea(iid):
    user = get_current_user()
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM ideas WHERE id=%s AND user_id=%s", (iid, user['id']))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ══════════════════════════════════════════
#  OBJETIVOS (per-user)
# ══════════════════════════════════════════

@app.route('/api/objetivos', methods=['GET'])
@login_required
def get_objetivos():
    user = get_current_user()
    conn = get_connection()
    if not conn: return jsonify({'objetivos': {}})
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT data FROM objetivos WHERE user_id=%s", (user['id'],))
        row = cur.fetchone(); cur.close(); conn.close()
        return jsonify({'objetivos': row['data'] if row else {}})
    except:
        return jsonify({'objetivos': {}})

@app.route('/api/objetivos', methods=['POST'])
@login_required
def guardar_objetivos():
    user = get_current_user()
    data = request.json or {}
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        oid = str(uuid.uuid4())
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO objetivos (id, user_id, data) VALUES (%s,%s,%s)
            ON CONFLICT (user_id) DO UPDATE SET data=EXCLUDED.data, updated_at=NOW()
        """, (oid, user['id'], json.dumps(data.get('data', data))))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Add unique constraint on objetivos.user_id if not exists (handled by ON CONFLICT)


# ══════════════════════════════════════════
#  PLANILLA (per-user)
# ══════════════════════════════════════════

@app.route('/api/planilla', methods=['GET'])
@login_required
def get_planilla():
    user = get_current_user()
    conn = get_connection()
    if not conn: return jsonify({'planilla': []})
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT data FROM planilla WHERE user_id=%s", (user['id'],))
        row = cur.fetchone(); cur.close(); conn.close()
        return jsonify({'planilla': row['data'] if row else []})
    except:
        return jsonify({'planilla': []})

@app.route('/api/planilla', methods=['POST'])
@login_required
def guardar_planilla():
    user = get_current_user()
    data = request.json or {}
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        pid = str(uuid.uuid4())
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO planilla (id, user_id, data) VALUES (%s,%s,%s)
            ON CONFLICT (user_id) DO UPDATE SET data=EXCLUDED.data, updated_at=NOW()
        """, (pid, user['id'], json.dumps(data.get('data', data))))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ══════════════════════════════════════════
#  FIRMA ELECTRÓNICA
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
        base_url = get_env('BASE_URL').rstrip('/')
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
    for f in firmantes:
        if f['email']:
            html = f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f1eb;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1eb;padding:32px 0;">
  <tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
      <tr><td style="background:#0f0f0f;padding:24px 32px;border-bottom:3px solid #c9a84c;">
        <div style="font-family:Georgia,serif;font-size:1.3rem;color:#faf8f4;">#confiaenfede<span style="color:#c9a84c;">.</span></div>
        <div style="font-size:0.65rem;color:#888;letter-spacing:2px;text-transform:uppercase;margin-top:3px;">Sistema de Firma Electrónica</div>
      </td></tr>
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
        cur.close(); conn.close()
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
            conn.commit(); cur.close(); conn.close()
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
    # Validate email if provided
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
        html = f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f1eb;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1eb;padding:32px 0;">
  <tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
      <tr><td style="background:#0f0f0f;padding:24px 32px;border-bottom:3px solid #c9a84c;">
        <div style="font-family:Georgia,serif;font-size:1.3rem;color:#faf8f4;">#confiaenfede<span style="color:#c9a84c;">.</span></div>
      </td></tr>
      <tr><td style="padding:32px;">
        <div style="text-align:center;margin-bottom:20px;">
          <div style="display:inline-block;background:#e8f5e9;border-radius:50%;width:56px;height:56px;line-height:56px;font-size:1.8rem;">✅</div>
        </div>
        <h2 style="margin:0 0 8px;font-family:Georgia,serif;font-size:1.4rem;color:#0f0f0f;text-align:center;">Documento completado</h2>
        <p style="color:#666;font-size:0.9rem;margin:0 0 24px;text-align:center;">Todos los firmantes completaron el documento</p>
        <div style="background:#f0faf4;border-left:4px solid #52b788;border-radius:6px;padding:14px 18px;margin:0 0 24px;">
          <div style="font-weight:700;font-size:1rem;color:#0f0f0f;">{doc.get('title')}</div>
        </div>
      </td></tr>
      <tr><td style="background:#f8f7f4;border-top:1px solid #e8e4dc;padding:16px 32px;text-align:center;">
        <p style="font-size:0.72rem;color:#bbb;margin:0;">#confiaenfede — confiaenfede.com.ar</p>
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
    return redirect(f'/?page=estado-doc&doc={doc_id}')


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


# ── Init ──
init_db()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
