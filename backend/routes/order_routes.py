"""
routes/order_routes.py — Order API Endpoints
=============================================

CONCEPT: What is a Database Transaction?
-----------------------------------------
Placing an order involves MULTIPLE database steps:
  1. Create a row in the `orders` table.
  2. For every item in the cart, create a row in `order_items`.

Imagine a customer orders 5 items. We insert the order row successfully.
We insert 2 items successfully. But on the 3rd item, the server crashes.

If we don't use a transaction, we now have a "broken" order in the
database with only 2 items instead of 5. The customer thinks they
ordered 5 items, but the kitchen only sees 2.

A Transaction solves this. It groups all steps together:
  - START TRANSACTION
  - Insert order
  - Insert item 1, 2, 3, 4, 5
  - COMMIT (permanently save all)

If ANYTHING fails at any point, we call:
  - ROLLBACK (undo everything)

It is all-or-nothing. Our database will never have half-finished orders.

Routes in this file:
---------------------
POST  /api/orders              → Customer places a new order
GET   /api/orders              → Manager gets recent orders (newest first)
GET   /api/orders/<id>         → Manager gets one order with all items
PATCH /api/orders/<id>/status  → Manager updates order status
"""

import csv
import io
from flask import Blueprint, request, Response
from database.connection import get_db_connection, success_response, error_response
from utils.auth import require_auth, require_owner, decode_token


order_bp = Blueprint("order", __name__)


# ══════════════════════════════════════════════════════════════════════════
# POST /api/orders
# Customer places a new order
# ══════════════════════════════════════════════════════════════════════════
@order_bp.route("/api/orders", methods=["POST"])
def create_order():
    """
    Places an order for a table.

    OPEN-TAB LOGIC:
    ----------------
    If the table already has an active unpaid order (status: new / preparing / ready),
    we treat it as the SAME customer still sitting. New items are appended to that
    existing order — no new order row is created.

    If the table has NO active order (table is free / all previous orders are
    completed or cancelled), a brand-new order is created.

    This means:
      - Customer orders Coke → Order #5 created for Table 2
      - Same customer orders Fanta → items added to Order #5 (same bill)
      - Manager marks Order #5 as completed (customer paid & left)
      - Next customer orders from Table 2 → Order #6 created (fresh bill)
    """
    conn = None
    cursor = None
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return error_response("Request body must be valid JSON", 400)

        # ── 1. Validate Input ──────────────────────────────────────────────
        table_id = data.get("table_id")
        if not table_id:
            return error_response("table_id is required", 400)

        items = data.get("items")
        if not items or not isinstance(items, list):
            return error_response("Order must contain a list of items", 400)

        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        placed_by_user_id = None
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1]
            try:
                payload = decode_token(token)
                if payload.get("role") in ["owner", "manager", "staff"]:
                    placed_by_user_id = payload.get("user_id")
            except:
                pass

        # ── 2. Verify Table Exists ─────────────────────────────────────────
        cursor.execute("SELECT id FROM restaurant_tables WHERE id = %s", (table_id,))
        if not cursor.fetchone():
            return error_response(f"Table {table_id} does not exist", 404)

        # ── 3. Open-Tab Check ──────────────────────────────────────────────
        # Look for an existing active (unpaid) order on this table.
        # Active = status is 'new', 'preparing', or 'ready' (not completed/cancelled).
        cursor.execute(
            "SELECT id FROM orders WHERE table_id = %s AND status IN ('new', 'preparing', 'ready') "
            "ORDER BY created_at DESC LIMIT 1",
            (table_id,)
        )
        existing_order = cursor.fetchone()

        is_merged = False
        if existing_order:
            # ── Same customer (table still occupied) ──
            # Append items to the existing order instead of creating a new row.
            order_id = existing_order["id"]
            is_merged = True
        else:
            # ── New customer (table was free) ──
            # Create a fresh order row.
            cursor.execute(
                "INSERT INTO orders (table_id, placed_by_user_id) VALUES (%s, %s)",
                (table_id, placed_by_user_id)
            )
            order_id = cursor.lastrowid

        total_price = 0.0

        # ── 4. Process Each Item ───────────────────────────────────────────
        for item in items:
            menu_item_id = item.get("menu_item_id")
            quantity = item.get("quantity")

            if not menu_item_id or not quantity:
                conn.rollback()
                return error_response("Each item must have menu_item_id and quantity", 400)

            if int(quantity) < 1:
                conn.rollback()
                return error_response("Quantity must be at least 1", 400)

            cursor.execute(
                "SELECT name, price, is_available FROM menu_items WHERE id = %s",
                (menu_item_id,)
            )
            menu_item = cursor.fetchone()

            if not menu_item:
                conn.rollback()
                return error_response(f"Menu item ID {menu_item_id} does not exist", 404)

            if not menu_item["is_available"]:
                conn.rollback()
                return error_response(f"Sorry, '{menu_item['name']}' is currently unavailable", 400)

            current_price = float(menu_item["price"])
            total_price += (current_price * int(quantity))

            cursor.execute(
                "INSERT INTO order_items (order_id, menu_item_id, quantity, price) "
                "VALUES (%s, %s, %s, %s)",
                (order_id, menu_item_id, quantity, current_price)
            )

        # ── 5. Auto-lock the table when a brand-new order is created ─────────
        # If this is a fresh order (not merged into existing), mark the table
        # as 'occupied' so that any customer who scans the QR code sees the
        # "Table In Use" screen instead of the menu.
        if not is_merged:
            cursor.execute(
                "UPDATE restaurant_tables SET status = 'occupied' WHERE id = %s",
                (table_id,)
            )

        # ── 6. Commit ──────────────────────────────────────────────────────
        conn.commit()

        message = (
            "Items added to your existing order!" if is_merged
            else "Order placed successfully!"
        )

        return success_response({
            "message": message,
            "order_id": order_id,
            "total_price": total_price,
            "status": "new",
            "merged": is_merged
        }, 201)

    except Exception as e:
        if conn:
            conn.rollback()
        print(f"[ERROR] create_order: {e}")
        return error_response("Failed to place order. Please try again.", 500)

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# ══════════════════════════════════════════════════════════════════════════
# GET /api/orders
# Manager dashboard: list recent orders
# ══════════════════════════════════════════════════════════════════════════
@order_bp.route("/api/orders", methods=["GET"])
def get_orders():
    """
    Returns a list of orders, newest first.

    CONCEPT: SQL JOIN
    ------------------
    The `orders` table only has `table_id`. The manager wants to see "Table 5".
    We use a JOIN to combine the `orders` table with the `restaurant_tables` table
    in a single query.

    SQL:
      SELECT o.id, o.status, t.table_number
      FROM orders o
      JOIN restaurant_tables t ON o.table_id = t.id
    """
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # Get orders joined with table information
        cursor.execute(
            "SELECT o.id, o.table_id, o.status, o.created_at, "
            "t.table_number, u.username as placed_by_username "
            "FROM orders o "
            "JOIN restaurant_tables t ON o.table_id = t.id "
            "LEFT JOIN users u ON o.placed_by_user_id = u.id "
            "ORDER BY o.created_at DESC "
            "LIMIT 50"
        )
        orders = cursor.fetchall()

        # Format dates for JSON
        for order in orders:
            if order.get("created_at"):
                order["created_at"] = order["created_at"].isoformat()

        return success_response({"orders": orders, "count": len(orders)}, 200)

    except Exception as e:
        print(f"[ERROR] get_orders: {e}")
        return error_response("Failed to fetch orders", 500)

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# ══════════════════════════════════════════════════════════════════════════
# GET /api/orders/<id>
# Manager dashboard: view single order details
# ══════════════════════════════════════════════════════════════════════════
@order_bp.route("/api/orders/<int:order_id>", methods=["GET"])
def get_order_details(order_id):
    """
    Returns full details for a specific order, including all food items.
    """
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # 1. Get the main order info (with table number)
        cursor.execute(
            "SELECT o.id, o.table_id, o.status, o.created_at, "
            "t.table_number, u.username as placed_by_username "
            "FROM orders o "
            "JOIN restaurant_tables t ON o.table_id = t.id "
            "LEFT JOIN users u ON o.placed_by_user_id = u.id "
            "WHERE o.id = %s",
            (order_id,)
        )
        order = cursor.fetchone()

        if not order:
            return error_response(f"Order #{order_id} not found", 404)

        if order.get("created_at"):
            order["created_at"] = order["created_at"].isoformat()

        # 2. Get all items in this order
        # We JOIN order_items with menu_items to get the names of the food
        cursor.execute(
            "SELECT oi.id, oi.menu_item_id, oi.quantity, oi.price, "
            "m.name AS item_name "
            "FROM order_items oi "
            "JOIN menu_items m ON oi.menu_item_id = m.id "
            "WHERE oi.order_id = %s",
            (order_id,)
        )
        items = cursor.fetchall()

        # Calculate total and format prices
        total_price = 0.0
        for item in items:
            item["price"] = float(item["price"])
            total_price += (item["price"] * item["quantity"])

        # Attach items and total to the order object
        order["items"] = items
        order["total_price"] = total_price

        return success_response(order, 200)

    except Exception as e:
        print(f"[ERROR] get_order_details: {e}")
        return error_response("Failed to fetch order details", 500)

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# ══════════════════════════════════════════════════════════════════════════
# PATCH /api/orders/<id>/status
# Manager dashboard: update order status
# ══════════════════════════════════════════════════════════════════════════
@order_bp.route("/api/orders/<int:order_id>/status", methods=["PATCH"])
def update_order_status(order_id):
    """
    Updates the status of an order.
    Allowed statuses: 'new', 'preparing', 'ready', 'completed', 'cancelled'
    """
    allowed_statuses = ["new", "preparing", "ready", "completed", "cancelled"]

    conn = None
    cursor = None
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return error_response("Request body must be valid JSON", 400)

        status = data.get("status")
        if not status or status.lower() not in allowed_statuses:
            return error_response(
                f"Valid status required. Allowed: {', '.join(allowed_statuses)}",
                400
            )

        status = status.lower()

        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # Check if order exists and get its table_id
        cursor.execute("SELECT id, table_id FROM orders WHERE id = %s", (order_id,))
        order = cursor.fetchone()
        if not order:
            return error_response(f"Order #{order_id} not found", 404)

        table_id = order["table_id"]

        # Update the order status
        cursor.execute(
            "UPDATE orders SET status = %s WHERE id = %s",
            (status, order_id)
        )

        # ── Auto-unlock table when payment is done ─────────────────────────
        # When an order is marked 'completed' or 'cancelled', check if the
        # table still has any remaining active orders. If none remain, the
        # customer has left and the table is free again.
        if status in ("completed", "cancelled"):
            cursor.execute(
                "SELECT COUNT(*) AS remaining FROM orders "
                "WHERE table_id = %s AND status IN ('new', 'preparing', 'ready') "
                "AND id != %s",
                (table_id, order_id)
            )
            remaining = cursor.fetchone()["remaining"]
            if remaining == 0:
                cursor.execute(
                    "UPDATE restaurant_tables SET status = 'available' WHERE id = %s",
                    (table_id,)
                )

        conn.commit()

        return success_response({
            "message": f"Order #{order_id} status updated to '{status}'",
            "order_id": order_id,
            "status": status
        }, 200)

    except Exception as e:
        if conn:
            conn.rollback()
        print(f"[ERROR] update_order_status: {e}")
        return error_response("Failed to update order status", 500)

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

# ══════════════════════════════════════════════════════════════════════════
# GET /api/orders/export
# Export all order history as a CSV file (Owner only)
# ══════════════════════════════════════════════════════════════════════════
@order_bp.route("/api/orders/export", methods=["GET"])
@require_auth
@require_owner
def export_orders():
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # Get all orders with table number
        cursor.execute(
            "SELECT o.id, o.status, o.created_at, t.table_number "
            "FROM orders o "
            "JOIN restaurant_tables t ON o.table_id = t.id "
            "ORDER BY o.created_at DESC"
        )
        orders = cursor.fetchall()

        # Build CSV data in memory
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Header row optimized for Excel Pivot Tables
        writer.writerow(["Order ID", "Date", "Time", "Table", "Status", "Item Name", "Quantity", "Unit Price (Rs)", "Line Subtotal (Rs)", "VAT 13% (Rs)", "Line Grand Total (Rs)"])

        for order in orders:
            order_id = order["id"]
            
            # Date/Time formatting
            dt = order["created_at"]
            date_str = dt.strftime("%Y-%m-%d") if dt else ""
            time_str = dt.strftime("%H:%M:%S") if dt else ""
            
            # Fetch items for this order
            cursor.execute(
                "SELECT oi.quantity, oi.price, m.name "
                "FROM order_items oi "
                "JOIN menu_items m ON oi.menu_item_id = m.id "
                "WHERE oi.order_id = %s",
                (order_id,)
            )
            items = cursor.fetchall()
            
            # If an order has no items (shouldn't happen), write an empty row for it
            if not items:
                writer.writerow([order_id, date_str, time_str, f"Table {order['table_number']}", order["status"].upper(), "", 0, 0, 0, 0, 0])
                continue

            # Write ONE ROW PER ITEM. This makes data analysis in Excel much easier!
            for item in items:
                qty = int(item["quantity"])
                unit_price = float(item["price"])
                line_subtotal = qty * unit_price
                vat_amount = line_subtotal * 0.13
                line_grand_total = line_subtotal + vat_amount
                
                writer.writerow([
                    order_id,
                    date_str,
                    time_str,
                    f"Table {order['table_number']}",
                    order["status"].upper(),
                    item["name"],
                    qty,
                    f"{unit_price:.2f}",
                    f"{line_subtotal:.2f}",
                    f"{vat_amount:.2f}",
                    f"{line_grand_total:.2f}"
                ])

        # Generate response as CSV file download
        response = Response(output.getvalue(), mimetype="text/csv")
        response.headers["Content-Disposition"] = "attachment; filename=restaurant_order_history.csv"
        return response

    except Exception as e:
        print(f"[ERROR] export_orders: {e}")
        return error_response("Failed to export order history", 500)

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# ══════════════════════════════════════════════════════════════════════════
# PATCH /api/orders/transfer-table
# Transfer active orders from one table to another
# ══════════════════════════════════════════════════════════════════════════
@order_bp.route("/api/orders/transfer-table", methods=["PATCH"])
@require_auth
def transfer_table_orders():
    """
    Reassigns all active orders (status: new, preparing, ready) from from_table_id to to_table_id.
    """
    conn = None
    cursor = None
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return error_response("Request body must be valid JSON", 400)

        from_table_id = data.get("from_table_id")
        to_table_id = data.get("to_table_id")

        if not from_table_id or not to_table_id:
            return error_response("from_table_id and to_table_id are required", 400)

        if from_table_id == to_table_id:
            return error_response("Source and destination tables must be different", 400)

        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # 1. Verify destination table exists
        cursor.execute("SELECT id, table_number FROM restaurant_tables WHERE id = %s", (to_table_id,))
        to_table = cursor.fetchone()
        if not to_table:
            return error_response(f"Destination table ID {to_table_id} does not exist", 404)

        # 2. Verify source table exists
        cursor.execute("SELECT id, table_number FROM restaurant_tables WHERE id = %s", (from_table_id,))
        from_table = cursor.fetchone()
        if not from_table:
            return error_response(f"Source table ID {from_table_id} does not exist", 404)

        # 3. Update active orders
        active_statuses = ("new", "preparing", "ready")
        cursor.execute(
            "UPDATE orders SET table_id = %s WHERE table_id = %s AND status IN (%s, %s, %s)",
            (to_table_id, from_table_id, *active_statuses)
        )
        transferred_count = cursor.rowcount
        conn.commit()

        if transferred_count == 0:
            return error_response(f"No active orders found on Table {from_table['table_number']} to transfer.", 400)

        return success_response({
            "message": f"Successfully transferred {transferred_count} order(s) from Table {from_table['table_number']} to Table {to_table['table_number']}.",
            "transferred_count": transferred_count,
            "from_table_number": from_table["table_number"],
            "to_table_number": to_table["table_number"]
        }, 200)

    except Exception as e:
        if conn:
            conn.rollback()
        print(f"[ERROR] transfer_table_orders: {e}")
        return error_response("Failed to transfer orders between tables", 500)

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

