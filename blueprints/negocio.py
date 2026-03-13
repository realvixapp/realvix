"""
Blueprint: Negocio
Rutas: /api/propiedades, /api/contactos, /api/estados
Tablas: propiedades, contactos, estado_opciones
"""
import uuid, json
from flask import Blueprint, request, jsonify
from psycopg2.extras import RealDictCursor

bp = Blueprint('negocio', __name__)

# Importamos helpers desde app principal
def _app():
    from app import get_connection, get_current_user, login_required
    return get_connection, get_current_user, login_required

# ── PROPIEDADES ──

@bp.route('/api/propiedades', methods=['GET'])
def listar_propiedades():
    from app import get_connection, get_current_user, login_required
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    conn = get_connection()
    if not conn: return jsonify({'propiedades': []})
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM propiedades WHERE user_id=%s ORDER BY created_at DESC", (user['id'],))
        rows = [dict(r) for r in cur.fetchall()]
        cur.close(); conn.close()
        return jsonify({'propiedades': rows})
    except Exception as e:
        return jsonify({'propiedades': [], 'error': str(e)})

@bp.route('/api/propiedades', methods=['POST'])
def crear_propiedad():
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    data = request.json or {}
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        pid = data.get('id') or str(uuid.uuid4())
        # Fechas vacías deben ser NULL, no string vacío
        def d(v): return v if v and str(v).strip() else None
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO propiedades (id, user_id, direccion, localidad, zona, tipologia,
                nombre_propietario, telefono, email, estado_tasacion, estadio, observaciones,
                referido, url, ultimo_contacto, proximo_contacto, fecha_prelisting)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (id) DO UPDATE SET
                direccion=EXCLUDED.direccion, localidad=EXCLUDED.localidad,
                zona=EXCLUDED.zona, tipologia=EXCLUDED.tipologia,
                nombre_propietario=EXCLUDED.nombre_propietario, telefono=EXCLUDED.telefono,
                email=EXCLUDED.email, estado_tasacion=EXCLUDED.estado_tasacion,
                estadio=EXCLUDED.estadio, observaciones=EXCLUDED.observaciones,
                referido=EXCLUDED.referido, url=EXCLUDED.url,
                ultimo_contacto=EXCLUDED.ultimo_contacto, proximo_contacto=EXCLUDED.proximo_contacto,
                fecha_prelisting=EXCLUDED.fecha_prelisting, updated_at=NOW()
        """, (pid, user['id'], data.get('direccion',''), data.get('localidad',''),
              data.get('zona',''), data.get('tipologia',''),
              data.get('nombre_propietario',''), data.get('telefono',''),
              data.get('email',''), data.get('estado_tasacion','Pendiente Visita'),
              data.get('estadio',''), data.get('observaciones',''),
              data.get('referido',''), data.get('url',''),
              d(data.get('ultimo_contacto')), d(data.get('proximo_contacto')),
              d(data.get('fecha_prelisting'))))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True, 'id': pid})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/api/propiedades/<pid>', methods=['PUT'])
def actualizar_propiedad(pid):
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    data = request.json or {}
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        def d(v): return v if v and str(v).strip() else None
        cur = conn.cursor()
        cur.execute("""
            UPDATE propiedades SET
                direccion=%s, localidad=%s, zona=%s, tipologia=%s,
                nombre_propietario=%s, telefono=%s, email=%s,
                estado_tasacion=%s, estadio=%s, observaciones=%s,
                referido=%s, url=%s, ultimo_contacto=%s,
                proximo_contacto=%s, fecha_prelisting=%s, updated_at=NOW()
            WHERE id=%s AND user_id=%s
        """, (data.get('direccion',''), data.get('localidad',''), data.get('zona',''),
              data.get('tipologia',''), data.get('nombre_propietario',''),
              data.get('telefono',''), data.get('email',''),
              data.get('estado_tasacion','Pendiente Visita'), data.get('estadio',''),
              data.get('observaciones',''), data.get('referido',''), data.get('url',''),
              d(data.get('ultimo_contacto')), d(data.get('proximo_contacto')),
              d(data.get('fecha_prelisting')), pid, user['id']))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/api/propiedades/<pid>', methods=['DELETE'])
def eliminar_propiedad(pid):
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM propiedades WHERE id=%s AND user_id=%s", (pid, user['id']))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── ESTADOS ──

@bp.route('/api/estados', methods=['GET'])
def listar_estados():
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    conn = get_connection()
    if not conn: return jsonify({'estados': []})
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        # Retorna los estados del usuario + los globales como fallback
        cur.execute("""
            SELECT * FROM estado_opciones
            WHERE user_id=%s OR user_id='global'
            ORDER BY orden
        """, (user['id'],))
        rows = [dict(r) for r in cur.fetchall()]
        cur.close(); conn.close()
        return jsonify({'estados': rows})
    except Exception as e:
        return jsonify({'estados': []})

@bp.route('/api/estados', methods=['POST'])
def crear_estado():
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    data = request.json or {}
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO estado_opciones (user_id, nombre, color, vista, orden)
            VALUES (%s,%s,%s,%s,%s) ON CONFLICT (user_id, nombre) DO UPDATE
            SET color=EXCLUDED.color, vista=EXCLUDED.vista, orden=EXCLUDED.orden
        """, (user['id'], data.get('nombre',''), data.get('color','gray'),
              data.get('vista','listing'), data.get('orden',99)))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/api/estados/<int:eid>', methods=['DELETE'])
def eliminar_estado(eid):
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM estado_opciones WHERE id=%s AND user_id=%s", (eid, user['id']))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── CONTACTOS ──

@bp.route('/api/contactos', methods=['GET'])
def listar_contactos():
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    conn = get_connection()
    if not conn: return jsonify({'contactos': []})
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM contactos WHERE user_id=%s ORDER BY nombre", (user['id'],))
        rows = [dict(r) for r in cur.fetchall()]
        cur.close(); conn.close()
        return jsonify({'contactos': rows})
    except Exception as e:
        return jsonify({'contactos': []})

@bp.route('/api/contactos', methods=['POST'])
def crear_contacto():
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
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

@bp.route('/api/contactos/<cid>', methods=['PUT'])
def actualizar_contacto(cid):
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
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

@bp.route('/api/contactos/<cid>', methods=['DELETE'])
def eliminar_contacto(cid):
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM contactos WHERE id=%s AND user_id=%s", (cid, user['id']))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
