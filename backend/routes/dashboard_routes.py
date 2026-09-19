from flask import Blueprint, request
from database.connection import get_db_connection, success_response, error_response
from utils.auth import require_auth, require_owner
from datetime import datetime, timedelta

dashboard_bp = Blueprint("dashboard", __name__)

@dashboard_bp.route("/api/dashboard/stats", methods=["GET"])
@require_auth
@require_owner
def get_dashboard_stats():
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # 1. Total Sales Today
        cursor.execute(
            "SELECT COALESCE(SUM(oi.price * oi.quantity), 0) AS total FROM orders o "
            "JOIN order_items oi ON o.id = oi.order_id "
            "WHERE o.status = 'completed' AND DATE(o.created_at) = CURDATE()"
        )
        today_sales = cursor.fetchone()["total"]

        # 2. Total Sales This Week
        # WEEK(created_at, 1) starts week on Monday
        cursor.execute(
            "SELECT COALESCE(SUM(oi.price * oi.quantity), 0) AS total FROM orders o "
            "JOIN order_items oi ON o.id = oi.order_id "
            "WHERE o.status = 'completed' AND YEAR(o.created_at) = YEAR(CURDATE()) "
            "AND WEEK(o.created_at, 1) = WEEK(CURDATE(), 1)"
        )
        week_sales = cursor.fetchone()["total"]

        # 3. Total Sales This Month
        cursor.execute(
            "SELECT COALESCE(SUM(oi.price * oi.quantity), 0) AS total FROM orders o "
            "JOIN order_items oi ON o.id = oi.order_id "
            "WHERE o.status = 'completed' AND YEAR(o.created_at) = YEAR(CURDATE()) "
            "AND MONTH(o.created_at) = MONTH(CURDATE())"
        )
        month_sales = cursor.fetchone()["total"]

        # 4. Total Sales This Year
        cursor.execute(
            "SELECT COALESCE(SUM(oi.price * oi.quantity), 0) AS total FROM orders o "
            "JOIN order_items oi ON o.id = oi.order_id "
            "WHERE o.status = 'completed' AND YEAR(o.created_at) = YEAR(CURDATE())"
        )
        year_sales = cursor.fetchone()["total"]

        # 5. Chart Data (Last 7 Days)
        cursor.execute(
            """
            SELECT DATE(o.created_at) AS date, COALESCE(SUM(oi.price * oi.quantity), 0) AS sales
            FROM orders o
            JOIN order_items oi ON o.id = oi.order_id
            WHERE o.status = 'completed' AND o.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
            GROUP BY DATE(o.created_at)
            ORDER BY date ASC
            """
        )
        raw_chart_data = cursor.fetchall()
        
        # Fill in missing days with 0
        chart_data = []
        today = datetime.now().date()
        for i in range(6, -1, -1):
            target_date = today - timedelta(days=i)
            target_date_str = target_date.strftime("%Y-%m-%d")
            display_name = target_date.strftime("%a") # e.g. "Mon"
            
            # Find sales for this date
            sales = 0
            for row in raw_chart_data:
                if str(row["date"]) == target_date_str:
                    sales = row["sales"]
                    break
                    
            chart_data.append({
                "name": display_name,
                "sales": float(sales) if sales is not None else 0.0
            })

        return success_response({
            "today_sales": float(today_sales) if today_sales is not None else 0.0,
            "week_sales": float(week_sales) if week_sales is not None else 0.0,
            "month_sales": float(month_sales) if month_sales is not None else 0.0,
            "year_sales": float(year_sales) if year_sales is not None else 0.0,
            "chart_data": chart_data
        }, 200)

    except Exception as e:
        print(f"[ERROR] get_dashboard_stats: {e}")
        return error_response("Failed to fetch dashboard stats", 500)

    finally:
        if cursor: cursor.close()
        if conn: conn.close()
