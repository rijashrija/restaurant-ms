"""
routes/settings_routes.py — Restaurant Settings API
====================================================

Routes:
  GET /api/settings       → Public. Returns restaurant branding (name, logo, tagline, description).
  PUT /api/settings       → Owner-only. Updates restaurant branding.
"""

from flask import Blueprint, request
from database.connection import get_db_connection, success_response, error_response
from utils.auth import require_auth, require_owner


settings_bp = Blueprint("settings", __name__)


# ══════════════════════════════════════════════════════════════════════════
# GET /api/settings
# Public endpoint — returns restaurant branding info for the customer menu.
# ══════════════════════════════════════════════════════════════════════════
@settings_bp.route("/api/settings", methods=["GET"])
def get_settings():
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT restro_name, tagline, description, logo_url FROM restaurant_settings LIMIT 1")
        settings = cursor.fetchone()
        if not settings:
            # Return safe defaults if no row exists yet
            settings = {
                "restro_name": "My Restaurant",
                "tagline": "",
                "description": "",
                "logo_url": ""
            }
        return success_response({"settings": settings}, 200)
    except Exception as e:
        print(f"[ERROR] get_settings: {e}")
        return error_response("Failed to fetch settings", 500)
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


# ══════════════════════════════════════════════════════════════════════════
# PUT /api/settings
# Owner-only — updates restaurant branding.
# ══════════════════════════════════════════════════════════════════════════
@settings_bp.route("/api/settings", methods=["PUT"])
@require_auth
@require_owner
def update_settings():
    conn = None
    cursor = None
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return error_response("Request body must be valid JSON", 400)

        restro_name = data.get("restro_name", "").strip()
        tagline     = data.get("tagline", "").strip()
        description = data.get("description", "").strip()
        logo_url    = data.get("logo_url", "").strip()

        if not restro_name:
            return error_response("Restaurant name is required", 400)

        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # Check if a settings row already exists
        cursor.execute("SELECT id FROM restaurant_settings LIMIT 1")
        existing = cursor.fetchone()

        if existing:
            cursor.execute(
                "UPDATE restaurant_settings SET restro_name=%s, tagline=%s, description=%s, logo_url=%s WHERE id=%s",
                (restro_name, tagline, description, logo_url, existing["id"])
            )
        else:
            cursor.execute(
                "INSERT INTO restaurant_settings (restro_name, tagline, description, logo_url) VALUES (%s, %s, %s, %s)",
                (restro_name, tagline, description, logo_url)
            )

        conn.commit()
        return success_response({
            "message": "Restaurant settings updated successfully!",
            "settings": {
                "restro_name": restro_name,
                "tagline": tagline,
                "description": description,
                "logo_url": logo_url
            }
        }, 200)

    except Exception as e:
        if conn: conn.rollback()
        print(f"[ERROR] update_settings: {e}")
        return error_response("Failed to update settings", 500)
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

# ══════════════════════════════════════════════════════════════════════════
# POST /api/settings/upload-logo
# Owner-only — uploads an image file and returns its URL
# ══════════════════════════════════════════════════════════════════════════
import os
import uuid
from werkzeug.utils import secure_filename

UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'static', 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@settings_bp.route("/api/settings/upload-logo", methods=["POST"])
@require_auth
@require_owner
def upload_logo():
    if 'logo' not in request.files:
        return error_response("No logo part in the request", 400)
        
    file = request.files['logo']
    
    if file.filename == '':
        return error_response("No selected file", 400)
        
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        # Add random suffix to prevent cache issues and collisions
        ext = filename.rsplit('.', 1)[1].lower()
        unique_filename = f"logo_{uuid.uuid4().hex[:8]}.{ext}"
        
        filepath = os.path.join(UPLOAD_FOLDER, unique_filename)
        file.save(filepath)
        
        # Return the public URL for the file
        file_url = f"/static/uploads/{unique_filename}"
        return success_response({"logo_url": file_url}, 200)
        
    return error_response("Invalid file type", 400)

