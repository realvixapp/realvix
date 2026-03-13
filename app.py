import os
import json
import hashlib
import secrets
from datetime import datetime, timedelta
from functools import wraps

import psycopg2
from psycopg2.extras import RealDictCursor
from flask import (Flask, request, jsonify, render_template,
                   render_template_string, abort, redirect,
                   url_for, make_response)
from werkzeug.middleware.proxy_fix import ProxyFix

# ── App ──
app = Flask(__name__, template_folder='templates', static_folder='static', static_url_path='/static')
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)
app.secret_key = os.environ.get('SECRET_KEY', 'realvix-dev-2024')
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=30)

# ── DB ──
def get_connection():
    url = os.environ.get('DATABASE_URL', '')
    if not url:
        return None
    try:
        return psycopg2.connect(url)
    except Exception as e:
        print(f"[DB ERROR] connect: {e}")
        return None

def _exec_sql(sql, params=None):
    """Ejecuta un SQL en su propia conexión/transacción para evitar rollbacks en cadena."""
    conn = get_connection()
    if not conn:
        print("[DB] Sin conexión")
        return False
    try:
        cur = conn.cursor()
        cur.execute(sql, params)
        conn.commit()
        cur.close()
        conn.close()
        return True
    except Exception as e:
        print(f"[DB] Error: {e} | SQL: {sql[:80]}")
        try: conn.rollback(); conn.close()
        except: pass
        return False

def init_db():
    conn = get_connection()
    if not conn:
        print("[DB] No DATABASE_URL")
        return
    conn.close()

    tablas = [
        """CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY, data JSONB NOT NULL, created_at TIMESTAMP DEFAULT NOW())""",

        """CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
            password_hash TEXT NOT NULL, role TEXT DEFAULT 'member',
            created_at TIMESTAMP DEFAULT NOW(), last_login TIMESTAMP,
            permisos JSONB DEFAULT '{}')""",

        """CREATE TABLE IF NOT EXISTS user_sessions (
            token TEXT PRIMARY KEY, user_id TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW(), expires_at TIMESTAMP NOT NULL)""",

        """CREATE TABLE IF NOT EXISTS propiedades (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL DEFAULT 'legacy',
            direccion TEXT, localidad TEXT, zona TEXT, tipologia TEXT,
            nombre_propietario TEXT, telefono TEXT, email TEXT,
            estado_tasacion TEXT DEFAULT 'Pendiente Visita', estadio TEXT,
            observaciones TEXT, referido TEXT, url TEXT,
            ultimo_contacto TEXT, proximo_contacto TEXT, fecha_prelisting TEXT,
            created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())""",

        """CREATE TABLE IF NOT EXISTS estado_opciones (
            id SERIAL PRIMARY KEY, user_id TEXT NOT NULL DEFAULT 'global',
            nombre TEXT NOT NULL, color TEXT DEFAULT 'gray',
            vista TEXT DEFAULT 'listing', orden INTEGER DEFAULT 99,
            UNIQUE(user_id, nombre))""",

        """CREATE TABLE IF NOT EXISTS contactos (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL, nombre TEXT NOT NULL,
            tipo TEXT DEFAULT 'otro', telefono TEXT, email TEXT, localidad TEXT,
            referido TEXT, profesion TEXT, familia TEXT, operacion TEXT, notas TEXT,
            created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())""",

        """CREATE TABLE IF NOT EXISTS consultas (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL, nombre TEXT, telefono TEXT,
            email TEXT, propiedad_id TEXT, propiedad_nombre TEXT, mensaje TEXT,
            estado TEXT DEFAULT 'nuevo', canal TEXT DEFAULT 'whatsapp',
            presupuesto TEXT, zona_interes TEXT, operacion TEXT DEFAULT 'compra',
            notas TEXT, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())""",

        """CREATE TABLE IF NOT EXISTS cierres (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL, propiedad TEXT,
            propiedad_id TEXT, comprador TEXT, vendedor TEXT,
            valor_operacion NUMERIC DEFAULT 0, moneda TEXT DEFAULT 'USD',
            comision_pct NUMERIC DEFAULT 3, comision_bruta NUMERIC DEFAULT 0,
            comision_neta NUMERIC DEFAULT 0, fecha TEXT, tipo TEXT DEFAULT 'venta',
            notas TEXT, created_at TIMESTAMP DEFAULT NOW())""",

        """CREATE TABLE IF NOT EXISTS gastos (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL, descripcion TEXT,
            monto NUMERIC DEFAULT 0, moneda TEXT DEFAULT 'ARS',
            tipo TEXT DEFAULT 'egreso', categoria TEXT DEFAULT 'general',
            proveedor TEXT, fecha TEXT, notas TEXT,
            created_at TIMESTAMP DEFAULT NOW())""",

        """CREATE TABLE IF NOT EXISTS eventos (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL, titulo TEXT NOT NULL,
            fecha TEXT NOT NULL, hora TEXT, tipo TEXT DEFAULT 'reunion',
            notas TEXT, contacto_id TEXT, propiedad_id TEXT,
            created_at TIMESTAMP DEFAULT NOW())""",

        """CREATE TABLE IF NOT EXISTS tareas (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL, titulo TEXT NOT NULL,
            descripcion TEXT, estado TEXT DEFAULT 'pendiente',
            prioridad TEXT DEFAULT 'media', fecha_venc TEXT, propiedad_id TEXT,
            created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())""",

        """CREATE TABLE IF NOT EXISTS textos (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL, titulo TEXT NOT NULL,
            contenido TEXT, tipo TEXT DEFAULT 'whatsapp',
            categoria TEXT DEFAULT 'general', created_at TIMESTAMP DEFAULT NOW())""",

        """CREATE TABLE IF NOT EXISTS guiones (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL, titulo TEXT, hook TEXT,
            desarrollo TEXT, cta TEXT, grabado BOOLEAN DEFAULT FALSE,
            fecha_grabacion TEXT, tema TEXT, created_at TIMESTAMP DEFAULT NOW())""",

        """CREATE TABLE IF NOT EXISTS ideas (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL, texto TEXT NOT NULL,
            estado TEXT DEFAULT 'pendiente', created_at TIMESTAMP DEFAULT NOW())""",

        """CREATE TABLE IF NOT EXISTS objetivos (
            id TEXT PRIMARY KEY, user_id TEXT UNIQUE NOT NULL,
            data JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMP DEFAULT NOW())""",

        """CREATE TABLE IF NOT EXISTS planilla (
            id TEXT PRIMARY KEY, user_id TEXT UNIQUE NOT NULL,
            data JSONB NOT NULL DEFAULT '[]', updated_at TIMESTAMP DEFAULT NOW())""",
    ]

    for sql in tablas:
        _exec_sql(sql)

    # Insertar estados por defecto si no existen
    conn2 = get_connection()
    if conn2:
        try:
            cur2 = conn2.cursor()
            cur2.execute("SELECT COUNT(*) FROM estado_opciones WHERE user_id='global'")
            if cur2.fetchone()[0] == 0:
                estados = [
                    ('Pendiente Visita','purple','listing',1),
                    ('A Realizar','gray','listing',2),
                    ('Pendiente Respuesta','yellow','listing',3),
                    ('Aceptada','green','listing',4),
                    ('No contesta hacer seguimiento','orange','seguimiento',5),
                    ('Decide Esperar','blue','seguimiento',6),
                    ('Rechazada','red','rechazados',7),
                    ('Vendio con Otro','red','rechazados',8),
                ]
                for e in estados:
                    cur2.execute(
                        "INSERT INTO estado_opciones (user_id,nombre,color,vista,orden) VALUES ('global',%s,%s,%s,%s) ON CONFLICT DO NOTHING", e)
            conn2.commit(); cur2.close(); conn2.close()
        except Exception as e:
            print(f"[DB] estados: {e}")

    # Migraciones seguras (cada una en su propia transacción)
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
    for m in migraciones:
        _exec_sql(m)

    print("[DB] Todas las tablas listas")


# ── AUTH helpers ──
def hash_password(password):
    salt = os.environ.get('PASSWORD_SALT', 'realvix-salt-2024')
    return hashlib.sha256(f"{salt}{password}".encode()).hexdigest()

def get_user_by_email(email):
    conn = get_connection()
    if not conn: return None
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM users WHERE email=%s", (email.lower().strip(),))
        row = cur.fetchone(); cur.close(); conn.close()
        return dict(row) if row else None
    except: return None

def get_user_by_id(uid):
    conn = get_connection()
    if not conn: return None
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM users WHERE id=%s", (uid,))
        row = cur.fetchone(); cur.close(); conn.close()
        return dict(row) if row else None
    except: return None

def list_users():
    conn = get_connection()
    if not conn: return []
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT id,email,name,role,created_at,last_login,permisos FROM users ORDER BY created_at")
        rows = [dict(r) for r in cur.fetchall()]
        cur.close(); conn.close()
        return rows
    except: return []

def create_user(email, name, password, role='member', permisos=None):
    import uuid
    conn = get_connection()
    if not conn: return None
    try:
        uid = str(uuid.uuid4())
        cur = conn.cursor()
        cur.execute("INSERT INTO users (id,email,name,password_hash,role,permisos) VALUES (%s,%s,%s,%s,%s,%s)",
            (uid, email.lower().strip(), name, hash_password(password), role, json.dumps(permisos or {})))
        conn.commit(); cur.close(); conn.close()
        return uid
    except Exception as e:
        print(f"[AUTH] create_user: {e}"); return None

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
            print(f"[AUTH] session: {e}")
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


# ── Registrar blueprints ──
from blueprints.negocio   import bp as bp_negocio
from blueprints.leads     import bp as bp_leads
from blueprints.cierres   import bp as bp_cierres
from blueprints.agenda    import bp as bp_agenda
from blueprints.firma     import bp as bp_firma
from blueprints.contenido import bp as bp_contenido
from blueprints.admin     import bp as bp_admin
from blueprints.metricas  import bp as bp_metricas

app.register_blueprint(bp_negocio)
app.register_blueprint(bp_leads)
app.register_blueprint(bp_cierres)
app.register_blueprint(bp_agenda)
app.register_blueprint(bp_firma)
app.register_blueprint(bp_contenido)
app.register_blueprint(bp_admin)
app.register_blueprint(bp_metricas)


# ══════════════════════════
#  RUTAS PRINCIPALES
# ══════════════════════════

@app.route('/')
@login_required
def index():
    return render_template('index.html')

@app.route('/negocio')
@login_required
def negocio_page():
    return render_template('negocio.html')

@app.route('/leads')
@login_required
def leads_page():
    return render_template('leads.html')

@app.route('/metricas')
@login_required
def metricas_page():
    return render_template('metricas.html')

@app.route('/cierres')
@login_required
def cierres_page():
    return render_template('cierres.html')

@app.route('/agenda')
@login_required
def agenda_page():
    return render_template('agenda.html')

@app.route('/firma')
@login_required
def firma_page():
    return render_template('firma.html')

@app.route('/asistente')
@login_required
def asistente_page():
    return render_template('asistente.html')

@app.route('/admin')
@login_required
def admin_page():
    return render_template('admin.html')

@app.route('/contenido')
@login_required
def contenido_page():
    return render_template('contenido.html')

@app.route('/guiones')
@login_required
def guiones_page():
    return render_template('guiones.html')

@app.route('/ideas')
@login_required
def ideas_page():
    return render_template('ideas.html')


# ══════════════════════════
#  AUTH ROUTES
# ══════════════════════════

@app.route('/login')
def login_page():
    if get_current_user():
        return redirect('/')
    return render_template('login.html', next_url=request.args.get('next', '/'))

@app.route('/api/auth/login', methods=['POST'])
def api_login():
    data = request.json or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
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
    resp.set_cookie('auth_token', token, max_age=max_age, httponly=True, samesite='Lax', secure=True, path='/')
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

@app.route('/setup', methods=['GET', 'POST'])
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
        if data.get('setup_key') != os.environ.get('SETUP_KEY', 'realvix2024'):
            return jsonify({'error': 'Clave incorrecta'}), 403
        email = data.get('email', '').strip()
        name = data.get('name', '').strip()
        password = data.get('password', '').strip()
        if not email or not name or not password:
            return jsonify({'error': 'Todos los campos son requeridos'}), 400
        uid = create_user(email, name, password, role='admin')
        if uid: return jsonify({'ok': True})
        return jsonify({'error': 'Error al crear admin'}), 500
    return render_template('setup.html')

@app.route('/set-password', methods=['GET', 'POST'])
def set_password_page():
    token = request.args.get('token') or request.form.get('token', '')
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
            pw = request.form.get('password', '').strip()
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
<style>body{font-family:'Inter',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f7f5f0;margin:0;}
.box{background:white;border-radius:16px;padding:40px;max-width:380px;width:90%;box-shadow:0 4px 24px rgba(0,0,0,0.08);}
h2{font-size:1.4rem;margin-bottom:6px;}p{color:#888;font-size:0.85rem;margin-bottom:24px;}
label{font-size:0.78rem;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:#666;display:block;margin-bottom:6px;}
input{width:100%;padding:10px 14px;border:1.5px solid #e0dbd0;border-radius:8px;font-size:0.9rem;box-sizing:border-box;margin-bottom:16px;}
button{width:100%;padding:12px;background:#1B3FE4;color:white;border:none;border-radius:8px;font-size:0.9rem;font-weight:600;cursor:pointer;}
.err{background:#fff0f0;border:1px solid #fcc;border-radius:8px;padding:10px 14px;color:#c0392b;font-size:0.83rem;margin-bottom:16px;}</style></head>
<body><div class="box"><h2>Crear tu contraseña</h2><p>Ingresá la contraseña con la que vas a acceder a Realvix CRM.</p>
{% if error %}<div class="err">{{ error }}</div>{% endif %}
<form method="POST"><input type="hidden" name="token" value="{{ token }}">
<label>Nueva contraseña</label><input type="password" name="password" placeholder="Mínimo 6 caracteres" required>
<button type="submit">Guardar y entrar →</button></form></div></body></html>"""

@app.route('/api/migrate', methods=['POST'])
@admin_required
def forzar_migracion():
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
        "CREATE TABLE IF NOT EXISTS gastos (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, descripcion TEXT, monto NUMERIC DEFAULT 0, moneda TEXT DEFAULT 'ARS', tipo TEXT DEFAULT 'egreso', categoria TEXT DEFAULT 'general', proveedor TEXT, fecha TEXT, notas TEXT, created_at TIMESTAMP DEFAULT NOW())",
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
                conn = get_connection(); cur = conn.cursor()
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True, 'resultados': resultados})
    except Exception as e:
        return jsonify({'error': str(e), 'resultados': resultados}), 500


@app.route('/run-init-db')
def run_init_db():
    key = request.args.get('key', '')
    if key != os.environ.get('SETUP_KEY', 'realvix2024'):
        return 'Clave incorrecta', 403
    try:
        init_db()
        return '<h2>OK: Todas las tablas creadas. Ya podes usar el CRM.</h2>', 200
    except Exception as e:
        return f'<h2>Error: {e}</h2>', 500


import threading, time

def _init_with_retry(max_attempts=10, delay=3):
    for attempt in range(1, max_attempts + 1):
        try:
            conn = get_connection()
            if conn:
                conn.close()
                init_db()
                print(f"[DB] Init OK en intento {attempt}")
                return
            print(f"[DB] Sin conexion, reintento {attempt}/{max_attempts}...")
        except Exception as e:
            print(f"[DB] Error intento {attempt}: {e}")
        time.sleep(delay)
    print("[DB] No se pudo inicializar la DB")

threading.Thread(target=_init_with_retry, daemon=True).start()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
