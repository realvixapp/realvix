"""
Blueprint: Admin
Rutas: /api/admin/users
Tablas: users, user_sessions
"""
import json, secrets
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, abort

bp = Blueprint('admin', __name__)


@bp.route('/api/admin/users', methods=['GET'])
def admin_list_users():
    from app import list_users, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    if user.get('role') != 'admin': abort(403)
    return jsonify({'users': list_users()})

@bp.route('/api/admin/users', methods=['POST'])
def admin_create_user():
    from app import get_connection, get_current_user, get_user_by_email, create_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    if user.get('role') != 'admin': abort(403)
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

@bp.route('/api/admin/users/<user_id>', methods=['PUT'])
def admin_update_user(user_id):
    from app import get_connection, get_current_user
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    if user.get('role') != 'admin': abort(403)
    data = request.json or {}
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        if 'permisos' in data:
            cur.execute("UPDATE users SET permisos=%s WHERE id=%s", (json.dumps(data['permisos']), user_id))
        if 'role' in data:
            cur.execute("UPDATE users SET role=%s WHERE id=%s", (data['role'], user_id))
        if 'name' in data:
            cur.execute("UPDATE users SET name=%s WHERE id=%s", (data['name'], user_id))
        conn.commit(); cur.close(); conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/api/admin/users/<user_id>', methods=['DELETE'])
def admin_delete_user(user_id):
    from app import get_connection, get_current_user
    curr = get_current_user()
    if not curr: return jsonify({'error': 'No autenticado'}), 401
    if curr.get('role') != 'admin': abort(403)
    if curr['id'] == user_id:
        return jsonify({'error': 'No podés eliminarte a vos mismo'}), 400
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    cur = conn.cursor()
    cur.execute("DELETE FROM users WHERE id=%s", (user_id,))
    cur.execute("DELETE FROM user_sessions WHERE user_id=%s", (user_id,))
    conn.commit(); cur.close(); conn.close()
    return jsonify({'ok': True})

@bp.route('/api/admin/users/<user_id>/password', methods=['POST'])
def admin_change_password(user_id):
    from app import get_connection, get_current_user, hash_password
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    if user.get('role') != 'admin': abort(403)
    data = request.json or {}
    pw = data.get('password','').strip()
    if len(pw) < 6: return jsonify({'error': 'Mínimo 6 caracteres'}), 400
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    cur = conn.cursor()
    cur.execute("UPDATE users SET password_hash=%s WHERE id=%s", (hash_password(pw), user_id))
    conn.commit(); cur.close(); conn.close()
    return jsonify({'ok': True})

@bp.route('/api/admin/users/<user_id>/invite', methods=['POST'])
def admin_invite_link(user_id):
    from app import get_connection, get_current_user
    from flask import request as req
    user = get_current_user()
    if not user: return jsonify({'error': 'No autenticado'}), 401
    if user.get('role') != 'admin': abort(403)
    token = secrets.token_urlsafe(24)
    expires = datetime.now() + timedelta(hours=48)
    conn = get_connection()
    if not conn: return jsonify({'error': 'Sin DB'}), 500
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM user_sessions WHERE user_id=%s AND token LIKE 'invite_%'", (user_id,))
        cur.execute("INSERT INTO user_sessions (token,user_id,expires_at) VALUES (%s,%s,%s)",
            (f'invite_{token}', user_id, expires))
        conn.commit(); cur.close(); conn.close()
        base = req.host_url.rstrip('/')
        return jsonify({'ok': True, 'link': f'{base}/set-password?token={token}'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
