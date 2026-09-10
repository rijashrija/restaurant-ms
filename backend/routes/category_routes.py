"""
routes/category_routes.py — Menu Categories API
================================================

Routes:
  GET /api/categories       → Public/Admin. Returns all active categories (or all if admin).
  POST /api/categories      → Auth. Adds a new category.
  PUT /api/categories/<id>/toggle → Auth. Toggles a category's visibility (is_active).
"""

from flask import Blueprint, request
from database.connection import get_db_connection, success_response, error_response
from utils.auth import require_auth

category_bp = Blueprint("category", __name__)

# ══════════════════════════════════════════════════════════════════════════
# GET /api/categories
# Public: Returns a list of categories. 
# Optionally pass ?all=true (for admins) to see hidden categories.
# ══════════════════════════════════════════════════════════════════════════
@category_bp.route("/api/categories", methods=["GET"])
def get_categories():
    conn = None
    cursor = None
    try:
        show_all = request.args.get("all", "false").lower() == "true"
        
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        if show_all:
            cursor.execute("SELECT id, name, is_active FROM menu_categories ORDER BY id ASC")
        else:
            cursor.execute("SELECT id, name, is_active FROM menu_categories WHERE is_active = TRUE ORDER BY id ASC")
            
        categories = cursor.fetchall()
        return success_response({"categories": categories}, 200)

    except Exception as e:
        print(f"[ERROR] get_categories: {e}")
        return error_response("Failed to fetch categories", 500)
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


# ══════════════════════════════════════════════════════════════════════════
# POST /api/categories
# Auth: Create a new category.
# ══════════════════════════════════════════════════════════════════════════
@category_bp.route("/api/categories", methods=["POST"])
@require_auth
def create_category():
    conn = None
    cursor = None
    try:
        data = request.get_json(force=True, silent=True)
        if not data or not data.get("name"):
            return error_response("Category name is required", 400)
            
        category_name = data["name"].strip()
        if not category_name:
            return error_response("Category name cannot be empty", 400)

        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # Check if category already exists
        cursor.execute("SELECT id FROM menu_categories WHERE LOWER(name) = LOWER(%s)", (category_name,))
        if cursor.fetchone():
            return error_response(f"Category '{category_name}' already exists", 409)

        # Insert new category
        cursor.execute(
            "INSERT INTO menu_categories (name, is_active) VALUES (%s, TRUE)",
            (category_name,)
        )
        conn.commit()

        new_id = cursor.lastrowid
        
        return success_response({
            "message": "Category created successfully",
            "category": {
                "id": new_id,
                "name": category_name,
                "is_active": 1
            }
        }, 201)

    except Exception as e:
        if conn: conn.rollback()
        print(f"[ERROR] create_category: {e}")
        return error_response("Failed to create category", 500)
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


# ══════════════════════════════════════════════════════════════════════════
# PUT /api/categories/<id>/toggle
# Auth: Toggle a category's visibility (is_active).
# ══════════════════════════════════════════════════════════════════════════
@category_bp.route("/api/categories/<int:category_id>/toggle", methods=["PUT"])
@require_auth
def toggle_category(category_id):
    conn = None
    cursor = None
    try:
        data = request.get_json(force=True, silent=True)
        if not data or "is_active" not in data:
            return error_response("Missing 'is_active' field", 400)
            
        is_active = bool(data["is_active"])

        conn = get_db_connection()
        cursor = conn.cursor()

        # Check if category exists
        cursor.execute("SELECT id FROM menu_categories WHERE id = %s", (category_id,))
        if not cursor.fetchone():
            return error_response("Category not found", 404)

        # Update category visibility
        cursor.execute(
            "UPDATE menu_categories SET is_active = %s WHERE id = %s",
            (is_active, category_id)
        )
        conn.commit()

        status_msg = "shown" if is_active else "hidden"
        return success_response({"message": f"Category is now {status_msg}"}, 200)

    except Exception as e:
        if conn: conn.rollback()
        print(f"[ERROR] toggle_category: {e}")
        return error_response("Failed to toggle category", 500)
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


# ══════════════════════════════════════════════════════════════════════════
# PUT /api/categories/<id>
# Auth: Update a category's name. Also updates associated menu items.
# ══════════════════════════════════════════════════════════════════════════
@category_bp.route("/api/categories/<int:category_id>", methods=["PUT"])
@require_auth
def update_category(category_id):
    conn = None
    cursor = None
    try:
        data = request.get_json(force=True, silent=True)
        if not data or not data.get("name"):
            return error_response("Category name is required", 400)
            
        new_name = data["name"].strip()
        if not new_name:
            return error_response("Category name cannot be empty", 400)

        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # 1. Check if category exists and get its current name
        cursor.execute("SELECT id, name FROM menu_categories WHERE id = %s", (category_id,))
        category = cursor.fetchone()
        if not category:
            return error_response("Category not found", 404)
            
        old_name = category["name"]
        
        # If the name isn't changing, just return success
        if old_name == new_name:
            return success_response({"message": "Category updated", "category": {"id": category_id, "name": new_name}}, 200)

        # 2. Check if new name already exists in another category
        cursor.execute("SELECT id FROM menu_categories WHERE LOWER(name) = LOWER(%s) AND id != %s", (new_name, category_id))
        if cursor.fetchone():
            return error_response(f"Category '{new_name}' already exists", 409)

        # 3. Update category name
        cursor.execute("UPDATE menu_categories SET name = %s WHERE id = %s", (new_name, category_id))
        
        # 4. Cascade the update to menu_items to preserve relationships
        cursor.execute("UPDATE menu_items SET category = %s WHERE category = %s", (new_name, old_name))
        
        conn.commit()

        return success_response({
            "message": "Category renamed successfully",
            "category": {
                "id": category_id,
                "name": new_name
            }
        }, 200)

    except Exception as e:
        if conn: conn.rollback()
        print(f"[ERROR] update_category: {e}")
        return error_response("Failed to update category", 500)
    finally:
        if cursor: cursor.close()
        if conn: conn.close()
