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
import datetime
from flask import Blueprint, request, Response
from database.connection import get_db_connection, success_response, error_response
from utils.auth import require_auth, require_owner, decode_token


order_bp = Blueprint("order", __name__)


# ── Local Timezone Helper ─────────────────────────────────────────────────
# MySQL datetime columns have no timezone info (they are "naive").
# Python's .isoformat() serialises them without a UTC offset, so the browser
# assumes UTC and shows incorrect times.
# datetime.astimezone() with NO arguments reads the timezone directly from
# the Windows system clock — no hardcoding needed. If you change the timezone
# in Windows Settings, this automatically adapts.
def local_iso(dt) -> str:
    """Return a timezone-aware ISO-8601 string using the OS system timezone."""
    if dt is None:
        return None
    if isinstance(dt, datetime.datetime):
        if dt.tzinfo is None:
            # Attach the Windows system timezone automatically
            dt = dt.astimezone()
        return dt.isoformat()
    return str(dt)


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

        # Check who is placing/serving this order
        served_by_user_id = data.get("served_by_user_id")
        auth_header = request.headers.get("Authorization", "")
        if not served_by_user_id and auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1]
            try:
                payload = decode_token(token)
                if payload.get("role") in ["owner", "manager", "staff"]:
                    served_by_user_id = payload.get("user_id")
            except:
                pass

        placed_by_user_id = served_by_user_id

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

            # Determine next round number
            try:
                cursor.execute(
                    "SELECT COALESCE(MAX(round_number), 1) AS max_round FROM order_items WHERE order_id = %s",
                    (order_id,)
                )
                r_row = cursor.fetchone()
                current_round = (r_row["max_round"] if r_row and r_row["max_round"] else 1) + 1
            except Exception:
                current_round = 2
        else:
            # ── New customer (table was free) ──
            # Create a fresh order row.
            cursor.execute(
                "INSERT INTO orders (table_id, placed_by_user_id) VALUES (%s, %s)",
                (table_id, placed_by_user_id)
            )
            order_id = cursor.lastrowid
            current_round = 1

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

            item_served_by = item.get("served_by_user_id") or served_by_user_id

            try:
                cursor.execute(
                    "INSERT INTO order_items (order_id, menu_item_id, quantity, price, round_number, served_by_user_id) "
                    "VALUES (%s, %s, %s, %s, %s, %s)",
                    (order_id, menu_item_id, quantity, current_price, current_round, item_served_by)
                )
            except Exception:
                try:
                    cursor.execute(
                        "INSERT INTO order_items (order_id, menu_item_id, quantity, price, round_number) "
                        "VALUES (%s, %s, %s, %s, %s)",
                        (order_id, menu_item_id, quantity, current_price, current_round)
                    )
                except Exception:
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

        # ── 6. Fetch full round summary for this order ─────────────────────
        try:
            cursor.execute(
                "SELECT oi.id, oi.menu_item_id, oi.quantity, oi.price, "
                "COALESCE(oi.round_number, 1) AS round_number, "
                "oi.served_by_user_id, "
                "u_staff.username AS served_by_username, "
                "COALESCE(oi.created_at, o.created_at) AS item_created_at, "
                "m.name AS item_name "
                "FROM order_items oi "
                "JOIN orders o ON oi.order_id = o.id "
                "JOIN menu_items m ON oi.menu_item_id = m.id "
                "LEFT JOIN users u_staff ON oi.served_by_user_id = u_staff.id "
                "WHERE oi.order_id = %s "
                "ORDER BY oi.round_number ASC, oi.id ASC",
                (order_id,)
            )
            order_items_all = cursor.fetchall()
        except Exception:
            cursor.execute(
                "SELECT oi.id, oi.menu_item_id, oi.quantity, oi.price, "
                "COALESCE(oi.round_number, 1) AS round_number, "
                "NULL AS served_by_user_id, "
                "NULL AS served_by_username, "
                "COALESCE(oi.created_at, o.created_at) AS item_created_at, "
                "m.name AS item_name "
                "FROM order_items oi "
                "JOIN orders o ON oi.order_id = o.id "
                "JOIN menu_items m ON oi.menu_item_id = m.id "
                "WHERE oi.order_id = %s "
                "ORDER BY oi.round_number ASC, oi.id ASC",
                (order_id,)
            )
            order_items_all = cursor.fetchall()

        rounds_dict = {}
        grand_total = 0.0
        this_round_total = 0.0

        for it in order_items_all:
            r_num = int(it.get("round_number") or 1)
            it_price = float(it["price"])
            it_tot = it_price * int(it["quantity"])
            grand_total += it_tot
            if r_num == current_round:
                this_round_total += it_tot

            if r_num not in rounds_dict:
                ordered_time = it.get("item_created_at")
                rounds_dict[r_num] = {
                    "round_number": r_num,
                    "ordered_at": local_iso(ordered_time),
                    "items": [],
                    "subtotal": 0.0,
                    "_servers": []
                }

            server_name = it.get("served_by_username")
            if server_name and server_name not in rounds_dict[r_num]["_servers"]:
                rounds_dict[r_num]["_servers"].append(server_name)

            rounds_dict[r_num]["items"].append({
                "id": it["id"],
                "menu_item_id": it["menu_item_id"],
                "item_name": it["item_name"],
                "quantity": it["quantity"],
                "price": it_price,
                "total": it_tot,
                "served_by_user_id": it.get("served_by_user_id"),
                "served_by_username": server_name
            })
            rounds_dict[r_num]["subtotal"] += it_tot

        for rnd in rounds_dict.values():
            s_list = rnd.pop("_servers", [])
            rnd["served_by_usernames"] = s_list
            rnd["served_by_username"] = ", ".join(s_list) if s_list else None

        rounds_list = list(rounds_dict.values())
        order_count = len(rounds_list) if rounds_list else current_round

        # ── 7. Commit ──────────────────────────────────────────────────────
        conn.commit()

        message = (
            f"Items added to your existing order! (Order #{order_count})" if is_merged
            else "Order placed successfully! (Order #1)"
        )

        return success_response({
            "message": message,
            "order_id": order_id,
            "round_price": this_round_total,
            "total_price": grand_total,
            "order_count": order_count,
            "current_round": current_round,
            "rounds": rounds_list,
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
    Includes order_count (how many times customer ordered), total_price,
    and servers_list (all staff who served items to this customer).
    """
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        try:
            cursor.execute(
                "SELECT o.id, o.table_id, o.status, o.created_at, "
                "t.table_number, u.username as placed_by_username, "
                "COUNT(DISTINCT COALESCE(oi.round_number, 1)) as order_count, "
                "COALESCE(SUM(oi.price * oi.quantity), 0) as total_price, "
                "GROUP_CONCAT(DISTINCT u_staff.username SEPARATOR ', ') as servers_list "
                "FROM orders o "
                "JOIN restaurant_tables t ON o.table_id = t.id "
                "LEFT JOIN users u ON o.placed_by_user_id = u.id "
                "LEFT JOIN order_items oi ON o.id = oi.order_id "
                "LEFT JOIN users u_staff ON oi.served_by_user_id = u_staff.id "
                "GROUP BY o.id, o.table_id, o.status, o.created_at, t.table_number, u.username "
                "ORDER BY o.created_at DESC "
                "LIMIT 50"
            )
            orders = cursor.fetchall()
        except Exception:
            cursor.execute(
                "SELECT o.id, o.table_id, o.status, o.created_at, "
                "t.table_number, u.username as placed_by_username, "
                "1 as order_count, "
                "COALESCE(SUM(oi.price * oi.quantity), 0) as total_price, "
                "NULL as servers_list "
                "FROM orders o "
                "JOIN restaurant_tables t ON o.table_id = t.id "
                "LEFT JOIN users u ON o.placed_by_user_id = u.id "
                "LEFT JOIN order_items oi ON o.id = oi.order_id "
                "GROUP BY o.id, o.table_id, o.status, o.created_at, t.table_number, u.username "
                "ORDER BY o.created_at DESC "
                "LIMIT 50"
            )
            orders = cursor.fetchall()

        # Format dates & numbers for JSON
        for order in orders:
            if order.get("created_at"):
                order["created_at"] = local_iso(order["created_at"])
            order["total_price"] = float(order.get("total_price") or 0.0)
            order["order_count"] = max(int(order.get("order_count") or 1), 1)

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
    Returns full details for a specific order, including all food items
    grouped into order rounds with timestamps.
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
            order["created_at"] = local_iso(order["created_at"])

        # 2. Get all items in this order with round info and served_by staff
        try:
            cursor.execute(
                "SELECT oi.id, oi.menu_item_id, oi.quantity, oi.price, "
                "COALESCE(oi.round_number, 1) AS round_number, "
                "oi.served_by_user_id, "
                "u_staff.username AS served_by_username, "
                "COALESCE(oi.created_at, o.created_at) AS item_created_at, "
                "m.name AS item_name "
                "FROM order_items oi "
                "JOIN orders o ON oi.order_id = o.id "
                "JOIN menu_items m ON oi.menu_item_id = m.id "
                "LEFT JOIN users u_staff ON oi.served_by_user_id = u_staff.id "
                "WHERE oi.order_id = %s "
                "ORDER BY oi.round_number ASC, oi.id ASC",
                (order_id,)
            )
            items = cursor.fetchall()
        except Exception:
            cursor.execute(
                "SELECT oi.id, oi.menu_item_id, oi.quantity, oi.price, "
                "COALESCE(oi.round_number, 1) AS round_number, "
                "NULL AS served_by_user_id, "
                "NULL AS served_by_username, "
                "COALESCE(oi.created_at, o.created_at) AS item_created_at, "
                "m.name AS item_name "
                "FROM order_items oi "
                "JOIN orders o ON oi.order_id = o.id "
                "JOIN menu_items m ON oi.menu_item_id = m.id "
                "WHERE oi.order_id = %s "
                "ORDER BY oi.round_number ASC, oi.id ASC",
                (order_id,)
            )
            items = cursor.fetchall()

        rounds_dict = {}
        total_price = 0.0

        for item in items:
            item["price"] = float(item["price"])
            item_tot = item["price"] * item["quantity"]
            total_price += item_tot
            r_num = int(item.get("round_number") or 1)

            if r_num not in rounds_dict:
                item_time = item.get("item_created_at") or order.get("created_at")
                rounds_dict[r_num] = {
                    "round_number": r_num,
                    "ordered_at": local_iso(item_time),
                    "items": [],
                    "subtotal": 0.0,
                    "_servers": []
                }

            server_name = item.get("served_by_username")
            if server_name and server_name not in rounds_dict[r_num]["_servers"]:
                rounds_dict[r_num]["_servers"].append(server_name)

            if item.get("item_created_at"):
                item["item_created_at"] = local_iso(item["item_created_at"])

            rounds_dict[r_num]["items"].append(item)
            rounds_dict[r_num]["subtotal"] += item_tot

        for rnd in rounds_dict.values():
            s_list = rnd.pop("_servers", [])
            rnd["served_by_usernames"] = s_list
            rnd["served_by_username"] = ", ".join(s_list) if s_list else None

        rounds_list = list(rounds_dict.values())
        order["items"] = items
        order["rounds"] = rounds_list
        order["order_count"] = len(rounds_list) if rounds_list else 1
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


# ══════════════════════════════════════════════════════════════════════════
# GET /api/orders/active-by-table/<table_id>
# Customer menu / table view: get active order & round history for this table
# ══════════════════════════════════════════════════════════════════════════
@order_bp.route("/api/orders/active-by-table/<int:table_id>", methods=["GET"])
def get_active_order_by_table(table_id):
    """
    Returns active unpaid order with full round history for a table.
    Used by customer menu to display how many times the customer has ordered
    and the timestamps of previous order rounds.
    """
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute(
            "SELECT id FROM orders "
            "WHERE table_id = %s AND status IN ('new', 'preparing', 'ready') "
            "ORDER BY created_at DESC LIMIT 1",
            (table_id,)
        )
        existing = cursor.fetchone()
        if not existing:
            return success_response({"has_active_order": False, "order": None}, 200)

        order_id = existing["id"]
        order = fetch_order_with_rounds(cursor, order_id)
        if not order:
            return success_response({"has_active_order": False, "order": None}, 200)

        return success_response({"has_active_order": True, "order": order}, 200)

    except Exception as e:
        print(f"[ERROR] get_active_order_by_table: {e}")
        return error_response("Failed to fetch active table order", 500)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


def fetch_order_with_rounds(cursor, order_id):
    """
    Helper to fetch an order with its complete item rounds,
    formatted timestamps, server attributions, and total.
    """
    cursor.execute(
        "SELECT o.id, o.table_id, o.status, o.created_at, "
        "t.table_number "
        "FROM orders o "
        "JOIN restaurant_tables t ON o.table_id = t.id "
        "WHERE o.id = %s",
        (order_id,)
    )
    order = cursor.fetchone()
    if not order:
        return None

    if order.get("created_at"):
        order["created_at"] = local_iso(order["created_at"])

    try:
        cursor.execute(
            "SELECT oi.id, oi.menu_item_id, oi.quantity, oi.price, "
            "COALESCE(oi.round_number, 1) AS round_number, "
            "oi.served_by_user_id, "
            "u_staff.username AS served_by_username, "
            "COALESCE(oi.created_at, o.created_at) AS item_created_at, "
            "m.name AS item_name "
            "FROM order_items oi "
            "JOIN orders o ON oi.order_id = o.id "
            "JOIN menu_items m ON oi.menu_item_id = m.id "
            "LEFT JOIN users u_staff ON oi.served_by_user_id = u_staff.id "
            "WHERE oi.order_id = %s "
            "ORDER BY oi.round_number ASC, oi.id ASC",
            (order_id,)
        )
        items = cursor.fetchall()
    except Exception:
        cursor.execute(
            "SELECT oi.id, oi.menu_item_id, oi.quantity, oi.price, "
            "COALESCE(oi.round_number, 1) AS round_number, "
            "NULL AS served_by_user_id, "
            "NULL AS served_by_username, "
            "COALESCE(oi.created_at, o.created_at) AS item_created_at, "
            "m.name AS item_name "
            "FROM order_items oi "
            "JOIN orders o ON oi.order_id = o.id "
            "JOIN menu_items m ON oi.menu_item_id = m.id "
            "WHERE oi.order_id = %s "
            "ORDER BY oi.round_number ASC, oi.id ASC",
            (order_id,)
        )
        items = cursor.fetchall()

    rounds_dict = {}
    total_price = 0.0

    for item in items:
        item["price"] = float(item["price"])
        item_tot = item["price"] * item["quantity"]
        total_price += item_tot
        r_num = int(item.get("round_number") or 1)

        if r_num not in rounds_dict:
            item_time = item.get("item_created_at") or order.get("created_at")
            rounds_dict[r_num] = {
                "round_number": r_num,
                "ordered_at": local_iso(item_time),
                "items": [],
                "subtotal": 0.0,
                "_servers": []
            }

        server_name = item.get("served_by_username")
        if server_name and server_name not in rounds_dict[r_num]["_servers"]:
            rounds_dict[r_num]["_servers"].append(server_name)

        if item.get("item_created_at"):
            item["item_created_at"] = local_iso(item["item_created_at"])

        rounds_dict[r_num]["items"].append(item)
        rounds_dict[r_num]["subtotal"] += item_tot

    for rnd in rounds_dict.values():
        s_list = rnd.pop("_servers", [])
        rnd["served_by_usernames"] = s_list
        rnd["served_by_username"] = ", ".join(s_list) if s_list else None

    rounds_list = list(rounds_dict.values())
    order["items"] = items
    order["rounds"] = rounds_list
    order["order_count"] = len(rounds_list) if rounds_list else 1
    order["total_price"] = total_price
    return order


# ══════════════════════════════════════════════════════════════════════════
# PATCH /api/orders/<int:order_id>/items/<int:item_id>
# Customer / Staff: update quantity of an item in an active order
# ══════════════════════════════════════════════════════════════════════════
@order_bp.route("/api/orders/<int:order_id>/items/<int:item_id>", methods=["PATCH"])
def update_order_item_quantity(order_id, item_id):
    """
    Updates the quantity of an item in an active order.
    If new quantity <= 0, deletes the item.
    """
    conn = None
    cursor = None
    try:
        data = request.get_json(force=True, silent=True) or {}
        new_quantity = data.get("quantity")
        if new_quantity is None:
            return error_response("quantity field is required", 400)
        
        try:
            new_quantity = int(new_quantity)
        except (ValueError, TypeError):
            return error_response("quantity must be an integer", 400)

        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # 1. Verify order exists and is editable
        cursor.execute("SELECT id, table_id, status FROM orders WHERE id = %s", (order_id,))
        order = cursor.fetchone()
        if not order:
            return error_response(f"Order #{order_id} not found", 404)

        if order["status"] in ("completed", "cancelled"):
            return error_response(f"Cannot edit items in an order that is {order['status']}", 400)

        # 2. Verify item exists in this order
        cursor.execute("SELECT id, order_id, quantity, price FROM order_items WHERE id = %s AND order_id = %s", (item_id, order_id))
        item = cursor.fetchone()
        if not item:
            return error_response(f"Item #{item_id} not found in Order #{order_id}", 404)

        table_id = order["table_id"]

        # 3. Update or delete
        if new_quantity <= 0:
            cursor.execute("DELETE FROM order_items WHERE id = %s", (item_id,))
        else:
            cursor.execute("UPDATE order_items SET quantity = %s WHERE id = %s", (new_quantity, item_id))

        # 4. Check if any items remain in the order
        cursor.execute("SELECT COUNT(*) AS remaining, COALESCE(SUM(quantity * price), 0.0) AS new_total FROM order_items WHERE order_id = %s", (order_id,))
        stats = cursor.fetchone()
        remaining = stats["remaining"]
        new_total = float(stats["new_total"])

        if remaining == 0:
            cursor.execute("UPDATE orders SET status = 'cancelled', total_price = 0 WHERE id = %s", (order_id,))
            cursor.execute(
                "SELECT COUNT(*) AS active_count FROM orders WHERE table_id = %s AND status IN ('new', 'preparing', 'ready') AND id != %s",
                (table_id, order_id)
            )
            if cursor.fetchone()["active_count"] == 0:
                cursor.execute("UPDATE restaurant_tables SET status = 'available' WHERE id = %s", (table_id,))
            conn.commit()
            return success_response({
                "message": f"Item #{item_id} removed. Order had no items remaining and was cancelled.",
                "order_id": order_id,
                "order_cancelled": True,
                "order": None
            }, 200)

        try:
            cursor.execute("UPDATE orders SET total_price = %s WHERE id = %s", (new_total, order_id))
        except Exception:
            pass
        conn.commit()

        updated_order = fetch_order_with_rounds(cursor, order_id)
        return success_response({
            "message": f"Item quantity updated to {new_quantity}",
            "order_id": order_id,
            "order": updated_order
        }, 200)

    except Exception as e:
        if conn:
            conn.rollback()
        print(f"[ERROR] update_order_item_quantity: {e}")
        return error_response("Failed to update item quantity", 500)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# ══════════════════════════════════════════════════════════════════════════
# DELETE /api/orders/<int:order_id>/items/<int:item_id>
# Customer / Staff: delete an item from an active order
# ══════════════════════════════════════════════════════════════════════════
@order_bp.route("/api/orders/<int:order_id>/items/<int:item_id>", methods=["DELETE"])
def delete_order_item(order_id, item_id):
    """
    Deletes an item from an active order.
    """
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute("SELECT id, table_id, status FROM orders WHERE id = %s", (order_id,))
        order = cursor.fetchone()
        if not order:
            return error_response(f"Order #{order_id} not found", 404)

        if order["status"] in ("completed", "cancelled"):
            return error_response(f"Cannot delete items from an order that is {order['status']}", 400)

        cursor.execute("SELECT id FROM order_items WHERE id = %s AND order_id = %s", (item_id, order_id))
        if not cursor.fetchone():
            return error_response(f"Item #{item_id} not found in Order #{order_id}", 404)

        table_id = order["table_id"]
        cursor.execute("DELETE FROM order_items WHERE id = %s", (item_id,))

        cursor.execute("SELECT COUNT(*) AS remaining, COALESCE(SUM(quantity * price), 0.0) AS new_total FROM order_items WHERE order_id = %s", (order_id,))
        stats = cursor.fetchone()
        remaining = stats["remaining"]
        new_total = float(stats["new_total"])

        if remaining == 0:
            cursor.execute("UPDATE orders SET status = 'cancelled', total_price = 0 WHERE id = %s", (order_id,))
            cursor.execute(
                "SELECT COUNT(*) AS active_count FROM orders WHERE table_id = %s AND status IN ('new', 'preparing', 'ready') AND id != %s",
                (table_id, order_id)
            )
            if cursor.fetchone()["active_count"] == 0:
                cursor.execute("UPDATE restaurant_tables SET status = 'available' WHERE id = %s", (table_id,))
            conn.commit()
            return success_response({
                "message": f"Item #{item_id} deleted. Order had no items remaining and was cancelled.",
                "order_id": order_id,
                "order_cancelled": True,
                "order": None
            }, 200)

        try:
            cursor.execute("UPDATE orders SET total_price = %s WHERE id = %s", (new_total, order_id))
        except Exception:
            pass
        conn.commit()

        updated_order = fetch_order_with_rounds(cursor, order_id)
        return success_response({
            "message": f"Item #{item_id} deleted successfully",
            "order_id": order_id,
            "order": updated_order
        }, 200)

    except Exception as e:
        if conn:
            conn.rollback()
        print(f"[ERROR] delete_order_item: {e}")
        return error_response("Failed to delete order item", 500)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()



