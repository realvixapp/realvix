"""
Blueprint: Agenda
Rutas: /api/eventos, /api/tareas
Tablas: eventos, tareas
"""
import uuid
from flask import Blueprint, request, jsonify
from psycopg2.extras import RealDictCursor

bp = Blueprint('agenda', __name__)


# ── EVENTOS ──

@bp.route('/api/eventos', methods=['GET'])
def listar_eventos():
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
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

@bp.route('/api/eventos', methods=['POST'])
def crear_evento():
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
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

@bp.route('/api/eventos/<eid>', methods=['PUT'])
def actualizar_evento(eid):
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
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
              data.get('contacto_id',''), data.get('propiedad_id',''), eid, user['id']))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/api/eventos/<eid>', methods=['DELETE'])
def eliminar_evento(eid):
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM eventos WHERE id=%s AND user_id=%s", (eid, user['id']))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── TAREAS ──

@bp.route('/api/tareas', methods=['GET'])
def listar_tareas():
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
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

@bp.route('/api/tareas', methods=['POST'])
def crear_tarea():
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
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
                fecha_venc=EXCLUDED.fecha_venc, propiedad_id=EXCLUDED.propiedad_id, updated_at=NOW()
        """, (tid, user['id'], data.get('titulo',''), data.get('descripcion',''),
              data.get('estado','pendiente'), data.get('prioridad','media'),
              data.get('fecha_venc',''), data.get('propiedad_id','')))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True, 'id': tid})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/api/tareas/<tid>', methods=['PUT'])
def actualizar_tarea(tid):
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
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

@bp.route('/api/tareas/<tid>', methods=['DELETE'])
def eliminar_tarea(tid):
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM tareas WHERE id=%s AND user_id=%s", (tid, user['id']))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
