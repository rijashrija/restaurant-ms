"""
routes/auth_routes.py — Authentication Endpoints
=================================================

Routes:
  POST /api/auth/owner-signup   → Create the owner account (first-time setup)
  POST /api/auth/login          → Login for owner or manager
  POST /api/auth/create-manager → Owner creates a manager account
  GET  /api/auth/status         → Check if owner account has been created yet
  GET  /api/auth/me             → Get current user info from token
"""

from flask import Blueprint, request
from werkzeug.security import generate_password_hash, check_password_hash
from database.connection import get_db_connection, success_response, error_response
from utils.auth import generate_token, require_auth, require_owner


auth_bp = Blueprint("auth", __name__)


# ══════════════════════════════════════════════════════════════════════════
# GET /api/auth/status
# Checks if an owner account has been created yet.
# Used by the frontend to decide whether to show "Setup" or "Login".
# ══════════════════════════════════════════════════════════════════════════
@auth_bp.route("/api/auth/status", methods=["GET"])
def auth_status():
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT COUNT(*) AS count FROM users WHERE role = 'owner'")
        result = cursor.fetchone()
        owner_exists = result["count"] > 0
        return success_response({"owner_exists": owner_exists}, 200)
    except Exception as e:
        print(f"[ERROR] auth_status: {e}")
        return error_response(f"Failed to check auth status: {str(e)}", 500)
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


# ══════════════════════════════════════════════════════════════════════════
# POST /api/auth/owner-signup
# First-time setup: create the one owner account.
# Will fail if an owner already exists.
# ══════════════════════════════════════════════════════════════════════════
@auth_bp.route("/api/auth/owner-signup", methods=["POST"])
def owner_signup():
    conn = None
    cursor = None
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return error_response("Request body must be valid JSON", 400)

        username = data.get("username", "").strip()
        password = data.get("password", "").strip()

        if not username or not password:
            return error_response("Username and password are required", 400)
        if len(password) < 6:
            return error_response("Password must be at least 6 characters", 400)

        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # Only allow owner creation if no owner exists yet
        cursor.execute("SELECT COUNT(*) AS count FROM users WHERE role = 'owner'")
        if cursor.fetchone()["count"] > 0:
            return error_response("Owner account already exists. Please log in.", 403)

        # Check username is not taken
        cursor.execute("SELECT id FROM users WHERE username = %s", (username,))
        if cursor.fetchone():
            return error_response("Username already taken", 409)

        # Hash the password before storing
        hashed = generate_password_hash(password)
        owner_permissions = "orders,menu,tables,staff,settings"

        cursor.execute(
            "INSERT INTO users (username, password_hash, role, permissions) VALUES (%s, %s, 'owner', %s)",
            (username, hashed, owner_permissions)
        )
        conn.commit()
        new_id = cursor.lastrowid

        token = generate_token(new_id, username, "owner", owner_permissions)

        return success_response({
            "message": "Owner account created successfully!",
            "token": token,
            "user": {
                "id": new_id,
                "username": username,
                "role": "owner",
                "permissions": owner_permissions.split(",")
            }
        }, 201)

    except Exception as e:
        if conn: conn.rollback()
        print(f"[ERROR] owner_signup: {e}")
        return error_response("Failed to create owner account", 500)
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


# ══════════════════════════════════════════════════════════════════════════
# POST /api/auth/login
# Login endpoint for both owner and manager.
# Returns a JWT token on success.
# ══════════════════════════════════════════════════════════════════════════
@auth_bp.route("/api/auth/login", methods=["POST"])
def login():
    conn = None
    cursor = None
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return error_response("Request body must be valid JSON", 400)

        username = data.get("username", "").strip()
        password = data.get("password", "").strip()

        if not username or not password:
            return error_response("Username and password are required", 400)

        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute(
            "SELECT id, username, password_hash, role, permissions FROM users WHERE username = %s",
            (username,)
        )
        user = cursor.fetchone()

        if not user or not check_password_hash(user["password_hash"], password):
            return error_response("Invalid username or password", 401)

        raw_perms = user.get("permissions") or ("orders,menu,tables,staff,settings" if user["role"] == "owner" else "orders,menu")
        if user["role"] == "owner":
            raw_perms = "orders,menu,tables,staff,settings"

        token = generate_token(user["id"], user["username"], user["role"], raw_perms)
        perm_list = [p.strip() for p in raw_perms.split(",") if p.strip()]

        return success_response({
            "message": f"Welcome back, {user['username']}!",
            "token": token,
            "user": {
                "id": user["id"],
                "username": user["username"],
                "role": user["role"],
                "permissions": perm_list
            }
        }, 200)

    except Exception as e:
        print(f"[ERROR] login: {e}")
        return error_response("Login failed", 500)
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


# ══════════════════════════════════════════════════════════════════════════
# POST /api/auth/create-manager
# Owner-only: creates a new manager/staff account.
# ══════════════════════════════════════════════════════════════════════════
@auth_bp.route("/api/auth/create-manager", methods=["POST"])
@require_auth
@require_owner
def create_manager():
    conn = None
    cursor = None
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return error_response("Request body must be valid JSON", 400)

        username = data.get("username", "").strip()
        password = data.get("password", "").strip()
        permissions_input = data.get("permissions")
        role_input = data.get("role", "manager").strip().lower()
        if role_input not in ["manager", "staff"]:
            role_input = "manager"

        if not username or not password:
            return error_response("Username and password are required", 400)
        if len(password) < 6:
            return error_response("Password must be at least 6 characters", 400)

        if isinstance(permissions_input, list):
            perms_str = ",".join([p.strip() for p in permissions_input if p.strip()])
        elif isinstance(permissions_input, str):
            perms_str = permissions_input.strip()
        else:
            perms_str = "orders,menu"

        if not perms_str:
            perms_str = "orders,menu"

        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # Check username uniqueness
        cursor.execute("SELECT id FROM users WHERE username = %s", (username,))
        if cursor.fetchone():
            return error_response(f"Username '{username}' is already taken", 409)

        hashed = generate_password_hash(password)
        cursor.execute(
            "INSERT INTO users (username, password_hash, role, permissions) VALUES (%s, %s, %s, %s)",
            (username, hashed, role_input, perms_str)
        )
        conn.commit()
        new_id = cursor.lastrowid

        perm_list = [p.strip() for p in perms_str.split(",") if p.strip()]

        return success_response({
            "message": f"Staff account '{username}' created successfully!",
            "manager": {
                "id": new_id,
                "username": username,
                "role": role_input,
                "permissions": perm_list
            }
        }, 201)

    except Exception as e:
        if conn: conn.rollback()
        print(f"[ERROR] create_manager: {e}")
        return error_response("Failed to create manager account", 500)
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


# ══════════════════════════════════════════════════════════════════════════
# GET /api/auth/managers
# Owner-only: list all manager accounts.
# ══════════════════════════════════════════════════════════════════════════
@auth_bp.route("/api/auth/managers", methods=["GET"])
@require_auth
@require_owner
def list_managers():
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT id, username, role, permissions, created_at FROM users WHERE role IN ('manager', 'staff') ORDER BY created_at DESC"
        )
        managers = cursor.fetchall()
        for m in managers:
            if m.get("created_at"):
                m["created_at"] = m["created_at"].isoformat()
            raw_p = m.get("permissions") or "orders,menu"
            m["permissions"] = [p.strip() for p in raw_p.split(",") if p.strip()]

        return success_response({"managers": managers, "count": len(managers)}, 200)
    except Exception as e:
        print(f"[ERROR] list_managers: {e}")
        return error_response("Failed to fetch managers", 500)
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


# ══════════════════════════════════════════════════════════════════════════
# GET /api/auth/me
# Returns current user info from JWT token (used to rehydrate session).
# ══════════════════════════════════════════════════════════════════════════
@auth_bp.route("/api/auth/me", methods=["GET"])
@require_auth
def get_me():
    user = request.current_user
    raw_perms = user.get("permissions") or ("orders,menu,tables,staff,settings" if user.get("role") == "owner" else "orders,menu")
    if user.get("role") == "owner":
        raw_perms = "orders,menu,tables,staff,settings"

    perm_list = [p.strip() for p in raw_perms.split(",") if p.strip()]

    return success_response({
        "user": {
            "id": user["user_id"],
            "username": user["username"],
            "role": user["role"],
            "permissions": perm_list
        }
    }, 200)


# ══════════════════════════════════════════════════════════════════════════
# PUT /api/auth/managers/<id>
# Owner-only: updates a manager's username, password, and permissions.
# ══════════════════════════════════════════════════════════════════════════
@auth_bp.route("/api/auth/managers/<int:manager_id>", methods=["PUT"])
@require_auth
@require_owner
def update_manager(manager_id):
    conn = None
    cursor = None
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return error_response("Request body must be valid JSON", 400)

        username = data.get("username", "").strip()
        password = data.get("password", "").strip()
        permissions_input = data.get("permissions")
        role_input = data.get("role", "").strip().lower()

        if not username:
            return error_response("Username is required", 400)

        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # Check if the manager exists and is actually a manager or staff
        cursor.execute("SELECT id FROM users WHERE id = %s AND role IN ('manager', 'staff')", (manager_id,))
        if not cursor.fetchone():
            return error_response("Manager not found", 404)

        # Check if the new username is already taken by ANOTHER user
        cursor.execute("SELECT id FROM users WHERE username = %s AND id != %s", (username, manager_id))
        if cursor.fetchone():
            return error_response("Username already taken by another account", 409)

        perms_str = None
        if permissions_input is not None:
            if isinstance(permissions_input, list):
                perms_str = ",".join([p.strip() for p in permissions_input if p.strip()])
            elif isinstance(permissions_input, str):
                perms_str = permissions_input.strip()

        if password:
            if len(password) < 6:
                return error_response("Password must be at least 6 characters", 400)
            hashed = generate_password_hash(password)
            if perms_str is not None:
                cursor.execute(
                    "UPDATE users SET username = %s, password_hash = %s, permissions = %s WHERE id = %s",
                    (username, hashed, perms_str, manager_id)
                )
            else:
                cursor.execute(
                    "UPDATE users SET username = %s, password_hash = %s WHERE id = %s",
                    (username, hashed, manager_id)
                )
        else:
            if perms_str is not None:
                cursor.execute(
                    "UPDATE users SET username = %s, permissions = %s WHERE id = %s",
                    (username, perms_str, manager_id)
                )
            else:
                cursor.execute(
                    "UPDATE users SET username = %s WHERE id = %s",
                    (username, manager_id)
                )

        if role_input in ["manager", "staff"]:
            cursor.execute("UPDATE users SET role = %s WHERE id = %s", (role_input, manager_id))

        conn.commit()

        return success_response({
            "message": "Staff member updated successfully!",
            "manager_id": manager_id,
            "username": username,
            "role": role_input if role_input in ["manager", "staff"] else None,
            "permissions": [p.strip() for p in perms_str.split(",") if p.strip()] if perms_str else None
        }, 200)

    except Exception as e:
        if conn: conn.rollback()
        print(f"[ERROR] update_manager: {e}")
        return error_response("Failed to update manager", 500)
    finally:
        if cursor: cursor.close()
        if conn: conn.close()



# ══════════════════════════════════════════════════════════════════════════
# DELETE /api/auth/managers/<id>
# Owner-only: deletes a manager account.
# ══════════════════════════════════════════════════════════════════════════
@auth_bp.route("/api/auth/managers/<int:manager_id>", methods=["DELETE"])
@require_auth
@require_owner
def delete_manager(manager_id):
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # Check if the manager exists and is actually a manager or staff
        cursor.execute("SELECT id FROM users WHERE id = %s AND role IN ('manager', 'staff')", (manager_id,))
        if not cursor.fetchone():
            return error_response("Manager not found", 404)

        cursor.execute("DELETE FROM users WHERE id = %s", (manager_id,))
        conn.commit()

        return success_response({"message": "Manager account deleted successfully"}, 200)

    except Exception as e:
        if conn: conn.rollback()
        print(f"[ERROR] delete_manager: {e}")
        return error_response("Failed to delete manager account", 500)
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

