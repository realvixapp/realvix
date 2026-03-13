"""
Blueprint: Leads
Rutas: /api/consultas, /api/muestras (via consultas con estadio 'visitó')
Tablas: consultas
"""
import uuid
from flask import Blueprint, request, jsonify
from psycopg2.extras import RealDictCursor

bp = Blueprint('leads', __name__)


@bp.route('/api/consultas', methods=['GET'])
def listar_consultas():
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
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

@bp.route('/api/consultas', methods=['POST'])
def crear_consulta():
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    data = request.json or {}
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cid = data.get('id') or str(uuid.uuid4())
        fv = data.get('fecha_visita') or None
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO consultas (id, user_id, nombre, telefono, email, propiedad_id,
                propiedad_nombre, mensaje, estado, canal, presupuesto, zona_interes,
                operacion, notas, fecha_visita)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (id) DO UPDATE SET
                nombre=EXCLUDED.nombre, telefono=EXCLUDED.telefono, email=EXCLUDED.email,
                propiedad_id=EXCLUDED.propiedad_id, propiedad_nombre=EXCLUDED.propiedad_nombre,
                mensaje=EXCLUDED.mensaje, estado=EXCLUDED.estado, canal=EXCLUDED.canal,
                presupuesto=EXCLUDED.presupuesto, zona_interes=EXCLUDED.zona_interes,
                operacion=EXCLUDED.operacion, notas=EXCLUDED.notas,
                fecha_visita=EXCLUDED.fecha_visita, updated_at=NOW()
        """, (cid, user['id'], data.get('nombre',''), data.get('telefono',''),
              data.get('email',''), data.get('propiedad_id',''), data.get('propiedad_nombre',''),
              data.get('mensaje',''), data.get('estado','nuevo'), data.get('canal','whatsapp'),
              data.get('presupuesto',''), data.get('zona_interes',''),
              data.get('operacion','compra'), data.get('notas',''), fv))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True, 'id': cid})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/api/consultas/<cid>', methods=['PUT'])
def actualizar_consulta(cid):
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    data = request.json or {}
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        fv = data.get('fecha_visita') or None
        cur = conn.cursor()
        cur.execute("""
            UPDATE consultas SET nombre=%s, telefono=%s, email=%s, propiedad_id=%s,
                propiedad_nombre=%s, mensaje=%s, estado=%s, canal=%s, presupuesto=%s,
                zona_interes=%s, operacion=%s, notas=%s, fecha_visita=%s, updated_at=NOW()
            WHERE id=%s AND user_id=%s
        """, (data.get('nombre',''), data.get('telefono',''), data.get('email',''),
              data.get('propiedad_id',''), data.get('propiedad_nombre',''),
              data.get('mensaje',''), data.get('estado','nuevo'), data.get('canal','whatsapp'),
              data.get('presupuesto',''), data.get('zona_interes',''),
              data.get('operacion','compra'), data.get('notas',''), fv, cid, user['id']))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/api/consultas/<cid>', methods=['DELETE'])
def eliminar_consulta(cid):
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM consultas WHERE id=%s AND user_id=%s", (cid, user['id']))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/api/muestras', methods=['GET'])
def listar_muestras():
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    conn = get_connection()
    if not conn: return jsonify({'muestras': []})
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT * FROM consultas
            WHERE user_id=%s AND estado IN ('visito','visitó','Visitó','Visito')
            ORDER BY updated_at DESC
        """, (user['id'],))
        rows = [dict(r) for r in cur.fetchall()]
        cur.close(); conn.close()
        return jsonify({'muestras': rows})
    except:
        return jsonify({'muestras': []})
