"""
routes/table_routes.py — Table API Endpoints
============================================

CONCEPT: What is a REST API?
-----------------------------
REST (Representational State Transfer) is a set of conventions for
building APIs. It maps HTTP methods to database operations:

  HTTP Method  │  Database Action  │  Example
  ─────────────┼───────────────────┼──────────────────────────
  GET          │  Read (SELECT)    │  GET /api/tables → list tables
  POST         │  Create (INSERT)  │  POST /api/orders → create order
  PUT          │  Full Update      │  PUT /api/menu/1 → replace item
  PATCH        │  Partial Update   │  PATCH /api/orders/1/status
  DELETE       │  Delete           │  DELETE /api/menu/1

In REST, the URL represents a "resource" (a thing).
The HTTP method says what to DO with that resource.

  GET  /api/tables       → "Give me all tables"
  GET  /api/tables/3     → "Give me table #3"
  GET  /api/tables/verify/table-3 → "Is this QR code valid?"

CONCEPT: What is JSON?
-----------------------
JSON (JavaScript Object Notation) is the standard format for
sending data between a frontend and backend.

Example JSON response for a table:
{
  "id": 1,
  "table_number": 1,
  "qr_identifier": "table-1",
  "status": "available"
}

Why JSON?
- Both Python and JavaScript understand it natively
- It's human-readable
- It's lightweight (small file size)
- Every REST API in the world uses it

Our Flask routes receive data as JSON (in POST/PUT requests)
and always return JSON responses.

Routes in this file:
---------------------
GET  /api/tables                     → All tables
GET  /api/tables/<id>                → One table by ID
GET  /api/tables/verify/<identifier> → Verify QR code identifier
"""

from flask import Blueprint, request
from database.connection import get_db_connection, success_response, error_response
from mysql.connector import Error
from utils.auth import require_auth, require_owner


table_bp = Blueprint("table", __name__)


# ══════════════════════════════════════════════════════════════════════════
# POST /api/tables
# Adds a new table (Owner only)
# ══════════════════════════════════════════════════════════════════════════
@table_bp.route("/api/tables", methods=["POST"])
@require_auth
@require_owner
def add_table():
    conn = None
    cursor = None
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return error_response("Request body must be valid JSON", 400)

        table_number = data.get("table_number")
        qr_identifier = data.get("qr_identifier", "").strip()

        if not table_number or not qr_identifier:
            return error_response("table_number and qr_identifier are required", 400)

        try:
            table_number = int(table_number)
        except ValueError:
            return error_response("table_number must be an integer", 400)

        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # Check if table number or identifier already exists
        cursor.execute("SELECT id FROM restaurant_tables WHERE table_number = %s OR qr_identifier = %s", (table_number, qr_identifier))
        if cursor.fetchone():
            return error_response("Table number or QR identifier already exists", 409)

        cursor.execute(
            "INSERT INTO restaurant_tables (table_number, qr_identifier, status) VALUES (%s, %s, 'available')",
            (table_number, qr_identifier)
        )
        conn.commit()
        
        new_id = cursor.lastrowid
        return success_response({
            "message": "Table added successfully",
            "table": {
                "id": new_id,
                "table_number": table_number,
                "qr_identifier": qr_identifier,
                "status": "available"
            }
        }, 201)

    except Exception as e:
        if conn: conn.rollback()
        print(f"[ERROR] add_table: {e}")
        return error_response("Failed to add table", 500)

    finally:
        if cursor: cursor.close()
        if conn: conn.close()


# ══════════════════════════════════════════════════════════════════════════
# DELETE /api/tables/<id>
# Deletes a table (Owner only)
# ══════════════════════════════════════════════════════════════════════════
@table_bp.route("/api/tables/<int:table_id>", methods=["DELETE"])
@require_auth
@require_owner
def delete_table(table_id):
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute("SELECT id FROM restaurant_tables WHERE id = %s", (table_id,))
        if not cursor.fetchone():
            return error_response("Table not found", 404)

        # Check if table has active (non-completed/cancelled) orders
        cursor.execute(
            "SELECT COUNT(*) AS active_count FROM orders "
            "WHERE table_id = %s AND status IN ('new', 'preparing', 'ready')",
            (table_id,)
        )
        result = cursor.fetchone()
        if result and result["active_count"] > 0:
            return error_response(
                f"Cannot delete this table — it has {result['active_count']} active order(s). "
                "Complete or cancel all orders first.",
                409
            )

        # Delete order_items for all completed/cancelled orders belonging to this table
        cursor.execute(
            "DELETE oi FROM order_items oi "
            "JOIN orders o ON oi.order_id = o.id "
            "WHERE o.table_id = %s",
            (table_id,)
        )
        # Delete orders for this table
        cursor.execute("DELETE FROM orders WHERE table_id = %s", (table_id,))
        # Now delete the table itself
        cursor.execute("DELETE FROM restaurant_tables WHERE id = %s", (table_id,))
        conn.commit()

        return success_response({"message": "Table deleted successfully"}, 200)

    except Exception as e:
        if conn: conn.rollback()
        print(f"[ERROR] delete_table: {e}")
        return error_response(f"Failed to delete table: {e}", 500)

    finally:
        if cursor: cursor.close()
        if conn: conn.close()


# ══════════════════════════════════════════════════════════════════════════
# GET /api/tables
# Returns all restaurant tables
# ══════════════════════════════════════════════════════════════════════════
@table_bp.route("/api/tables", methods=["GET"])
def get_all_tables():
    """
    Returns a list of all restaurant tables.

    CONCEPT: How this route works step by step
    -------------------------------------------
    1. Flask receives: GET http://localhost:5000/api/tables
    2. It matches this URL+method to get_all_tables()
    3. We open a database connection
    4. We create a cursor (our "remote control" for the DB)
    5. We execute a SQL SELECT query
    6. MySQL returns all matching rows as Python dicts
    7. We convert to JSON and return

    SQL used:
        SELECT * FROM restaurant_tables ORDER BY table_number ASC

    CONCEPT: SELECT *
    ------------------
    SELECT *    → Give me all columns
    FROM ...    → from this table
    ORDER BY .. → sorted by this column
    ASC         → ascending order (1, 2, 3...)
    DESC        → descending order (10, 9, 8...)

    Example response:
    [
      {"id": 1, "table_number": 1, "qr_identifier": "table-1", "status": "available"},
      {"id": 2, "table_number": 2, "qr_identifier": "table-2", "status": "occupied"},
      ...
    ]
    """
    conn = None
    cursor = None
    try:
        conn = get_db_connection()

        # dictionary=True → rows come back as {column: value} dicts
        # instead of plain (value, value, value) tuples
        cursor = conn.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT t.id, t.table_number, t.qr_identifier, t.status, t.created_at,
                   COUNT(o.id) AS active_orders
            FROM restaurant_tables t
            LEFT JOIN orders o ON t.id = o.table_id AND o.status IN ('new', 'preparing', 'ready')
            GROUP BY t.id
            ORDER BY t.table_number ASC
            """
        )
        tables = cursor.fetchall()

        # Convert datetime objects to strings for JSON serialization
        # MySQL returns created_at as a Python datetime object.
        # JSON doesn't have a "datetime" type, so we convert to string.
        for table in tables:
            if table.get("created_at"):
                table["created_at"] = table["created_at"].isoformat()
            
            # Dual-layer check: if there are active orders, the table is effectively occupied
            if table["active_orders"] > 0:
                table["status"] = "occupied"
            
            # Remove the count so it doesn't mess with frontend types
            del table["active_orders"]

        return success_response(tables, 200)

    except Exception as e:
        # 500 = Internal Server Error
        # We log the real error for debugging but don't send it to
        # the client (it might reveal sensitive database info)
        print(f"[ERROR] get_all_tables: {e}")
        return error_response("Failed to fetch tables", 500)

    finally:
        # The `finally` block ALWAYS runs, even if an exception occurred.
        # This ensures we never leave database connections open.
        # Open connections waste memory and can crash MySQL with too many.
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# ══════════════════════════════════════════════════════════════════════════
# GET /api/tables/<id>
# Returns one table by its numeric ID
# ══════════════════════════════════════════════════════════════════════════
@table_bp.route("/api/tables/<int:table_id>", methods=["GET"])
def get_table_by_id(table_id):
    """
    Returns a single table by its primary key ID.

    CONCEPT: URL Parameters
    ------------------------
    <int:table_id> in the route means Flask will:
    1. Extract whatever is at that position in the URL
    2. Convert it to an integer (int:)
    3. Pass it to our function as `table_id`

    So:  GET /api/tables/3
    →    table_id = 3  (integer, not string "3")

    If someone sends GET /api/tables/abc, Flask returns 404
    automatically because "abc" can't be converted to int.

    CONCEPT: SQL WHERE clause
    --------------------------
    WHERE filters rows. Only rows matching the condition are returned.

        SELECT * FROM restaurant_tables WHERE id = 3

    Returns only the row where id equals 3.

    CONCEPT: Parameterized Queries (IMPORTANT for security!)
    ---------------------------------------------------------
    We write:
        cursor.execute("SELECT * FROM ... WHERE id = %s", (table_id,))

    NOT:
        cursor.execute(f"SELECT * FROM ... WHERE id = {table_id}")

    WHY? SQL Injection attacks.
    If table_id came from user input and we used f-strings,
    a hacker could send: table_id = "1 OR 1=1; DROP TABLE orders;"
    and our query would become:
        SELECT * FROM ... WHERE id = 1 OR 1=1; DROP TABLE orders;

    With %s parameterization, MySQL treats the input as data only,
    never as SQL code. The hacker's trick doesn't work.
    ALWAYS use parameterized queries. Never use f-strings in SQL.

    Example response:
    {"id": 3, "table_number": 3, "qr_identifier": "table-3", "status": "available"}
    """
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # %s is the placeholder. MySQL replaces it with table_id safely.
        # Note: always pass parameters as a TUPLE: (table_id,)
        # The trailing comma makes it a tuple even with one item.
        cursor.execute(
            "SELECT id, table_number, qr_identifier, status, created_at "
            "FROM restaurant_tables "
            "WHERE id = %s",
            (table_id,)
        )
        table = cursor.fetchone()  # Returns one row or None

        if not table:
            # 404 = Not Found. This is the correct code when a specific
            # resource (like "table #99") simply doesn't exist.
            return error_response(f"Table with ID {table_id} not found", 404)

        if table.get("created_at"):
            table["created_at"] = table["created_at"].isoformat()

        return success_response(table, 200)

    except Exception as e:
        print(f"[ERROR] get_table_by_id: {e}")
        return error_response("Failed to fetch table", 500)

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# ══════════════════════════════════════════════════════════════════════════
# GET /api/tables/verify/<identifier>
# The most important table endpoint — used when a customer scans a QR code
# ══════════════════════════════════════════════════════════════════════════
@table_bp.route("/api/tables/verify/<string:identifier>", methods=["GET"])
def verify_table(identifier):
    """
    Verifies that a QR code identifier corresponds to a real table.

    This is called by the Next.js frontend when the menu page loads.
    The URL contains the QR identifier:
        /menu?table=table-3

    Next.js calls:
        GET /api/tables/verify/table-3

    We look up "table-3" in the database and return the table info.

    WHY verify on the backend?
    ---------------------------
    A customer could manually type any URL:
        /menu?table=table-999

    If we trusted the frontend blindly and created an order for
    table 999 (which doesn't exist), our database would break
    (the foreign key constraint would reject it, but better to
    check BEFORE letting the customer browse).

    This endpoint lets the frontend verify the table is real
    BEFORE showing the menu. If verification fails, we show
    an "Invalid table" error page instead of the menu.

    Example response (success):
    {
      "id": 3,
      "table_number": 3,
      "qr_identifier": "table-3",
      "status": "available"
    }

    Example response (failure):
    HTTP 404
    {"error": "Invalid QR code. Table not found."}
    """
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute(
            "SELECT id, table_number, qr_identifier, status "
            "FROM restaurant_tables "
            "WHERE qr_identifier = %s",
            (identifier,)
        )
        table = cursor.fetchone()

        if not table:
            return error_response(
                f"Invalid QR code. Table '{identifier}' not found.", 404
            )

        # ── Dual-layer occupied check ──────────────────────────────────────
        # We check BOTH:
        #   1. The status column (set manually by staff or auto-set by order events)
        #   2. Whether the table actually has active unpaid orders in the DB
        #
        # This makes the system self-correcting: even if the status column
        # is stale or was manually cleared by mistake, a table with active
        # orders will still be correctly reported as occupied.
        is_occupied_by_status = table["status"] == "occupied"

        cursor.execute(
            "SELECT COUNT(*) AS active_count FROM orders "
            "WHERE table_id = %s AND status IN ('new', 'preparing', 'ready')",
            (table["id"],)
        )
        active_orders = cursor.fetchone()["active_count"]
        is_occupied_by_orders = active_orders > 0

        # If either check says occupied → the table is in use
        effective_status = "occupied" if (is_occupied_by_status or is_occupied_by_orders) else "available"

        # Keep DB in sync: if orders say occupied but status column disagrees, fix it
        if is_occupied_by_orders and not is_occupied_by_status:
            cursor.execute(
                "UPDATE restaurant_tables SET status = 'occupied' WHERE id = %s",
                (table["id"],)
            )
            conn.commit()

        return success_response({
            "id": table["id"],
            "table_number": table["table_number"],
            "qr_identifier": table["qr_identifier"],
            "status": effective_status,
            "message": f"Table {table['table_number']} verified successfully"
        }, 200)

    except Exception as e:
        print(f"[ERROR] verify_table: {e}")
        return error_response("Failed to verify table", 500)

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# ══════════════════════════════════════════════════════════════════════════
# PATCH /api/tables/<id>/status
# Staff marks a table as "occupied" or "available" manually
# ══════════════════════════════════════════════════════════════════════════
@table_bp.route("/api/tables/<int:table_id>/status", methods=["PATCH"])
@require_auth
def update_table_status(table_id):
    """
    Allows any authenticated staff member (owner/manager/waiter) to manually
    set a table's status to 'occupied' or 'available'.
    """
    conn = None
    cursor = None
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return error_response("Request body must be valid JSON", 400)

        status = data.get("status", "").lower()
        if status not in ("available", "occupied"):
            return error_response("status must be 'available' or 'occupied'", 400)

        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute("SELECT id, table_number FROM restaurant_tables WHERE id = %s", (table_id,))
        table = cursor.fetchone()
        if not table:
            return error_response(f"Table {table_id} not found", 404)

        cursor.execute(
            "UPDATE restaurant_tables SET status = %s WHERE id = %s",
            (status, table_id)
        )
        conn.commit()

        return success_response({
            "message": f"Table {table['table_number']} marked as {status}",
            "table_id": table_id,
            "table_number": table["table_number"],
            "status": status
        }, 200)

    except Exception as e:
        if conn: conn.rollback()
        print(f"[ERROR] update_table_status: {e}")
        return error_response("Failed to update table status", 500)

    finally:
        if cursor: cursor.close()
        if conn: conn.close()
