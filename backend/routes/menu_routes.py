"""
routes/menu_routes.py — Menu API Endpoints
==========================================

CONCEPT: Reading data sent from the frontend (request body)
------------------------------------------------------------
In Phase 3, all our routes were GET requests — Flask just reads
from the database and returns data.

For POST and PUT requests, the frontend SENDS data to Flask.
This data travels inside the "request body" as JSON.

Example: When the manager adds a new menu item, Next.js sends:
    POST /api/menu
    Content-Type: application/json

    {
      "name": "Paneer Momo",
      "description": "Soft momos filled with paneer",
      "price": 280,
      "category": "Momo"
    }

Flask reads this JSON with:
    data = request.get_json()
    name = data.get("name")

CONCEPT: Validation — Why we check data in the backend
-------------------------------------------------------
The frontend does validation too (shows errors to users),
but we CANNOT trust it. Anyone can:
  - Open browser DevTools and modify requests
  - Use curl or Postman to send raw HTTP requests
  - Build their own client that skips frontend validation

Backend validation is the REAL protection. Example:
  - Price must be a positive number (not negative, not text)
  - Name cannot be empty
  - Category must be provided

We check all of this BEFORE touching the database.

CONCEPT: Why we don't DELETE menu items
----------------------------------------
Once an order is placed, order_items stores the menu_item_id.
If we DELETE a menu item, those old orders would have a
"dangling reference" — pointing to something that no longer exists.

Instead, we use "soft delete":
  - Set is_available = FALSE (item disappears from customer menu)
  - The item still exists in the database
  - Old orders remain valid and can still display the item name

This is a real-world database design pattern used everywhere.

Routes in this file:
---------------------
GET   /api/menu                   → All available items (customer)
GET   /api/menu/all               → All items including unavailable (manager)
GET   /api/menu/<id>              → Single item by ID
POST  /api/menu                   → Add new item (manager)
PUT   /api/menu/<id>              → Update full item (manager)
PATCH /api/menu/<id>/availability → Toggle available/unavailable (manager)
"""

from flask import Blueprint, request
from database.connection import get_db_connection, success_response, error_response


menu_bp = Blueprint("menu", __name__)


# ══════════════════════════════════════════════════════════════════════════
# GET /api/menu
# Returns all AVAILABLE menu items, optionally filtered by category
# This is what the customer sees
# ══════════════════════════════════════════════════════════════════════════
@menu_bp.route("/api/menu", methods=["GET"])
def get_menu():
    """
    Returns all available menu items for the customer.

    Optional query parameter:
        GET /api/menu?category=Momo  → filter by category
        GET /api/menu                → all available items

    CONCEPT: Query Parameters
    --------------------------
    Query parameters are the key=value pairs after the ? in a URL.
        /api/menu?category=Momo
                   ↑ key    ↑ value

    In Flask, we read them with:
        category = request.args.get("category")

    If the customer is on the "Drinks" tab in the menu,
    Next.js calls: GET /api/menu?category=Drinks

    CONCEPT: Conditional SQL
    -------------------------
    We build our SQL query dynamically:
    - If no category filter → SELECT WHERE is_available = TRUE
    - If category given    → SELECT WHERE is_available = TRUE AND category = ?

    We use a list for params so we can append the category if needed.

    SQL concepts used:
        WHERE is_available = TRUE  → only show available items
        AND category = %s         → also filter by category
        ORDER BY category, name   → grouped by category, alphabetical
    """
    conn = None
    cursor = None
    try:
        # Read the optional ?category=... query parameter
        # request.args is a dict of all query parameters
        # .get("category") returns None if it's not present
        category = request.args.get("category")

        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        if category:
            # Filter by category AND only available items in active categories
            cursor.execute(
                "SELECT m.id, m.name, m.description, m.price, m.category, m.image_url, "
                "m.is_available, m.created_at, m.updated_at "
                "FROM menu_items m "
                "JOIN menu_categories c ON m.category = c.name "
                "WHERE m.is_available = TRUE AND m.category = %s AND c.is_active = TRUE "
                "ORDER BY m.name ASC",
                (category,)
            )
        else:
            # All available items in active categories, grouped by category
            cursor.execute(
                "SELECT m.id, m.name, m.description, m.price, m.category, m.image_url, "
                "m.is_available, m.created_at, m.updated_at "
                "FROM menu_items m "
                "JOIN menu_categories c ON m.category = c.name "
                "WHERE m.is_available = TRUE AND c.is_active = TRUE "
                "ORDER BY m.category ASC, m.name ASC"
            )

        items = cursor.fetchall()

        # Convert Decimal price to float (JSON-serializable)
        # MySQL DECIMAL type returns Python Decimal objects.
        # JSON doesn't know about Decimal, so we convert to float.
        for item in items:
            item["price"] = float(item["price"])
            item["is_available"] = bool(item["is_available"])
            if item.get("created_at"):
                item["created_at"] = item["created_at"].isoformat()
            if item.get("updated_at"):
                item["updated_at"] = item["updated_at"].isoformat()

        return success_response({
            "items": items,
            "count": len(items),
            "category_filter": category
        }, 200)

    except Exception as e:
        print(f"[ERROR] get_menu: {e}")
        return error_response("Failed to fetch menu", 500)

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# ══════════════════════════════════════════════════════════════════════════
# GET /api/menu/all
# Returns ALL items including unavailable (for manager dashboard)
# ══════════════════════════════════════════════════════════════════════════
@menu_bp.route("/api/menu/all", methods=["GET"])
def get_all_menu_items():
    """
    Returns ALL menu items regardless of availability.
    Used by the manager dashboard to see and manage the full menu.
    The customer never calls this endpoint.
    """
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute(
            "SELECT id, name, description, price, category, image_url, "
            "is_available, created_at, updated_at "
            "FROM menu_items "
            "ORDER BY category ASC, name ASC"
        )
        items = cursor.fetchall()

        for item in items:
            item["price"] = float(item["price"])
            item["is_available"] = bool(item["is_available"])
            if item.get("created_at"):
                item["created_at"] = item["created_at"].isoformat()
            if item.get("updated_at"):
                item["updated_at"] = item["updated_at"].isoformat()

        return success_response({"items": items, "count": len(items)}, 200)

    except Exception as e:
        print(f"[ERROR] get_all_menu_items: {e}")
        return error_response("Failed to fetch menu items", 500)

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# ══════════════════════════════════════════════════════════════════════════
# GET /api/menu/<id>
# Returns a single menu item by its ID
# ══════════════════════════════════════════════════════════════════════════
@menu_bp.route("/api/menu/<int:item_id>", methods=["GET"])
def get_menu_item(item_id):
    """
    Returns a single menu item by its primary key ID.
    Used to show details of one item.
    """
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute(
            "SELECT id, name, description, price, category, image_url, "
            "is_available, created_at, updated_at "
            "FROM menu_items WHERE id = %s",
            (item_id,)
        )
        item = cursor.fetchone()

        if not item:
            return error_response(f"Menu item with ID {item_id} not found", 404)

        item["price"] = float(item["price"])
        item["is_available"] = bool(item["is_available"])
        if item.get("created_at"):
            item["created_at"] = item["created_at"].isoformat()
        if item.get("updated_at"):
            item["updated_at"] = item["updated_at"].isoformat()

        return success_response(item, 200)

    except Exception as e:
        print(f"[ERROR] get_menu_item: {e}")
        return error_response("Failed to fetch menu item", 500)

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# ══════════════════════════════════════════════════════════════════════════
# POST /api/menu
# Adds a new menu item (manager only)
# ══════════════════════════════════════════════════════════════════════════
@menu_bp.route("/api/menu", methods=["POST"])
def create_menu_item():
    """
    Creates a new menu item.

    CONCEPT: How POST requests work
    --------------------------------
    Unlike GET (which just reads), POST CREATES something new.

    The frontend sends data in the request body (not the URL):
        POST /api/menu
        {
          "name": "Paneer Momo",
          "description": "Soft momos with paneer filling",
          "price": 280,
          "category": "Momo",
          "image_url": ""         ← optional
        }

    Flask reads it with:
        data = request.get_json()

    CONCEPT: SQL INSERT INTO
    -------------------------
    To ADD a new row to the database:
        INSERT INTO menu_items (name, price, category)
        VALUES ('Paneer Momo', 280.00, 'Momo')

    After INSERT, MySQL assigns an auto-incremented ID to the new row.
    We get that ID with: cursor.lastrowid

    CONCEPT: conn.commit()
    -----------------------
    For any query that CHANGES data (INSERT, UPDATE, DELETE),
    we must call conn.commit() to permanently save the change.

    Without commit(), the change stays in a temporary "pending" state
    and is automatically CANCELLED when the connection closes.

    This is part of MySQL's transaction system.

    Expected request body:
    {
      "name": "string (required)",
      "description": "string (optional)",
      "price": number (required, > 0),
      "category": "string (required)",
      "image_url": "string (optional)"
    }

    Response (201 Created):
    {
      "message": "Menu item created successfully",
      "item_id": 23,
      "item": { ... full item data ... }
    }
    """
    conn = None
    cursor = None
    try:
        # Read JSON from the request body
        # force=True: parse as JSON even if Content-Type header is missing
        # silent=True: return None instead of raising an error if parsing fails
        data = request.get_json(force=True, silent=True)

        if not data:
            return error_response("Request body must be valid JSON", 400)

        # ── Validation ────────────────────────────────────────────────────
        # We check each required field before touching the database.
        # This prevents invalid data from entering the system.

        name = data.get("name", "").strip()
        if not name:
            return error_response("Item name is required", 400)

        if len(name) > 200:
            return error_response("Item name must be 200 characters or less", 400)

        category = data.get("category", "").strip()
        if not category:
            return error_response("Category is required", 400)

        # Validate price: must exist, must be a number, must be positive
        price = data.get("price")
        if price is None:
            return error_response("Price is required", 400)
        try:
            price = float(price)
            if price < 0:
                return error_response("Price cannot be negative", 400)
        except (TypeError, ValueError):
            return error_response("Price must be a valid number", 400)

        # Optional fields (no validation needed, just use defaults)
        desc_val = data.get("description")
        description = desc_val.strip() if desc_val else None
        img_val = data.get("image_url")
        image_url = img_val.strip() if img_val else None
        is_available = data.get("is_available", True)  # Default: available

        # ── Database INSERT ───────────────────────────────────────────────
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute(
            "INSERT INTO menu_items "
            "(name, description, price, category, image_url, is_available) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            (name, description, price, category, image_url, is_available)
        )

        # Save the change permanently
        conn.commit()

        # Get the ID of the row we just inserted
        new_id = cursor.lastrowid

        # Fetch the newly created item to return it in the response
        cursor.execute(
            "SELECT id, name, description, price, category, image_url, "
            "is_available, created_at, updated_at "
            "FROM menu_items WHERE id = %s",
            (new_id,)
        )
        new_item = cursor.fetchone()
        new_item["price"] = float(new_item["price"])
        new_item["is_available"] = bool(new_item["is_available"])
        if new_item.get("created_at"):
            new_item["created_at"] = new_item["created_at"].isoformat()
        if new_item.get("updated_at"):
            new_item["updated_at"] = new_item["updated_at"].isoformat()

        # 201 = "Created" — the correct status code when a resource is created
        return success_response({
            "message": "Menu item created successfully",
            "item_id": new_id,
            "item": new_item
        }, 201)

    except Exception as e:
        # If something went wrong, undo any partial changes
        if conn:
            conn.rollback()
        print(f"[ERROR] create_menu_item: {e}")
        return error_response("Failed to create menu item", 500)

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# ══════════════════════════════════════════════════════════════════════════
# PUT /api/menu/<id>
# Replaces (updates) all fields of a menu item (manager only)
# ══════════════════════════════════════════════════════════════════════════
@menu_bp.route("/api/menu/<int:item_id>", methods=["PUT"])
def update_menu_item(item_id):
    """
    Updates a menu item's details.

    CONCEPT: PUT vs PATCH
    ----------------------
    PUT    → Full replacement. You send ALL fields, even unchanged ones.
    PATCH  → Partial update. You send ONLY the fields you want to change.

    We use PUT here for updating item details (name, description, price, category).
    We use PATCH below for toggling just the availability flag.

    CONCEPT: SQL UPDATE
    --------------------
    To CHANGE an existing row:
        UPDATE menu_items
        SET name = 'New Name', price = 300.00
        WHERE id = 5

    The WHERE clause is critical — without it, ALL rows get updated!
    Always include WHERE when updating.

    Expected request body:
    {
      "name": "Updated Name",
      "description": "Updated description",
      "price": 300,
      "category": "Momo",
      "image_url": ""
    }
    """
    conn = None
    cursor = None
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return error_response("Request body must be valid JSON", 400)

        # Validate same as create
        name = data.get("name", "").strip()
        if not name:
            return error_response("Item name is required", 400)

        category = data.get("category", "").strip()
        if not category:
            return error_response("Category is required", 400)

        price = data.get("price")
        if price is None:
            return error_response("Price is required", 400)
        try:
            price = float(price)
            if price < 0:
                return error_response("Price cannot be negative", 400)
        except (TypeError, ValueError):
            return error_response("Price must be a valid number", 400)

        desc_val = data.get("description")
        description = desc_val.strip() if desc_val else None
        img_val = data.get("image_url")
        image_url = img_val.strip() if img_val else None

        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # First check that the item actually exists
        cursor.execute("SELECT id FROM menu_items WHERE id = %s", (item_id,))
        if not cursor.fetchone():
            return error_response(f"Menu item with ID {item_id} not found", 404)

        # UPDATE the row
        cursor.execute(
            "UPDATE menu_items "
            "SET name = %s, description = %s, price = %s, "
            "    category = %s, image_url = %s "
            "WHERE id = %s",
            (name, description, price, category, image_url, item_id)
        )
        conn.commit()

        # Return the updated item
        cursor.execute(
            "SELECT id, name, description, price, category, image_url, "
            "is_available, created_at, updated_at "
            "FROM menu_items WHERE id = %s",
            (item_id,)
        )
        updated_item = cursor.fetchone()
        updated_item["price"] = float(updated_item["price"])
        updated_item["is_available"] = bool(updated_item["is_available"])
        if updated_item.get("created_at"):
            updated_item["created_at"] = updated_item["created_at"].isoformat()
        if updated_item.get("updated_at"):
            updated_item["updated_at"] = updated_item["updated_at"].isoformat()

        return success_response({
            "message": "Menu item updated successfully",
            "item": updated_item
        }, 200)

    except Exception as e:
        if conn:
            conn.rollback()
        print(f"[ERROR] update_menu_item: {e}")
        return error_response("Failed to update menu item", 500)

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# ══════════════════════════════════════════════════════════════════════════
# PATCH /api/menu/<id>/availability
# Toggles an item between available and unavailable
# ══════════════════════════════════════════════════════════════════════════
@menu_bp.route("/api/menu/<int:item_id>/availability", methods=["PATCH"])
def update_availability(item_id):
    """
    Updates ONLY the is_available field of a menu item.

    This is the "soft delete" toggle:
    - Manager clicks "Mark Unavailable" → is_available = FALSE
    - Item disappears from customer menu immediately
    - Item still exists in DB (old orders remain valid)
    - Manager can re-enable it: "Mark Available" → is_available = TRUE

    CONCEPT: Why PATCH for this?
    -----------------------------
    We only want to change ONE field (is_available).
    Using PUT would require sending the entire item object.
    PATCH is more precise: "only update what I specify".

    Expected request body:
    {
      "is_available": false
    }

    or:
    {
      "is_available": true
    }

    Response:
    {
      "message": "Item marked as unavailable",
      "item_id": 5,
      "is_available": false
    }
    """
    conn = None
    cursor = None
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return error_response("Request body must be valid JSON", 400)

        # Validate the is_available field
        if "is_available" not in data:
            return error_response("is_available field is required", 400)

        is_available = data["is_available"]
        if not isinstance(is_available, bool):
            return error_response("is_available must be true or false", 400)

        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # Verify item exists
        cursor.execute(
            "SELECT id, name, is_available FROM menu_items WHERE id = %s",
            (item_id,)
        )
        item = cursor.fetchone()
        if not item:
            return error_response(f"Menu item with ID {item_id} not found", 404)

        # Update only the availability
        cursor.execute(
            "UPDATE menu_items SET is_available = %s WHERE id = %s",
            (is_available, item_id)
        )
        conn.commit()

        status_text = "available" if is_available else "unavailable"

        return success_response({
            "message": f"'{item['name']}' marked as {status_text}",
            "item_id": item_id,
            "item_name": item["name"],
            "is_available": is_available
        }, 200)

    except Exception as e:
        if conn:
            conn.rollback()
        print(f"[ERROR] update_availability: {e}")
        return error_response("Failed to update availability", 500)

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
