import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from database.connection import get_db_connection

def add_order_rounds_columns():
    """
    Migration script:
    Adds `round_number` and `created_at` columns to `order_items` table
    to track the number of times a customer ordered and the timestamp of each order round.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
    except Exception as e:
        print(f"[WARN] Database connection not available right now: {e}")
        return

    # 1. Add round_number to order_items
    try:
        sql = "ALTER TABLE order_items ADD COLUMN round_number INT NOT NULL DEFAULT 1 AFTER price"
        cursor.execute(sql)
        conn.commit()
        print("Successfully added round_number column to order_items table.")
    except Exception as e:
        if "Duplicate column" in str(e) or "already exists" in str(e).lower() or getattr(e, 'errno', None) == 1060:
            print("round_number column already exists in order_items table, skipping.")
        else:
            print(f"Error adding round_number to order_items table: {e}")

    # 2. Add created_at to order_items
    try:
        sql = "ALTER TABLE order_items ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER round_number"
        cursor.execute(sql)
        conn.commit()
        print("Successfully added created_at column to order_items table.")
    except Exception as e:
        if "Duplicate column" in str(e) or "already exists" in str(e).lower() or getattr(e, 'errno', None) == 1060:
            print("created_at column already exists in order_items table, skipping.")
        else:
            print(f"Error adding created_at to order_items table: {e}")

    cursor.close()
    conn.close()

if __name__ == "__main__":
    add_order_rounds_columns()
