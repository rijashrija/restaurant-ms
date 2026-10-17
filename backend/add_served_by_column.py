import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from database.connection import get_db_connection

def add_served_by_column():
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        sql = "ALTER TABLE order_items ADD COLUMN served_by_user_id INT NULL AFTER round_number"
        cursor.execute(sql)
        conn.commit()
        print("Successfully added served_by_user_id column to order_items table.")
    except Exception as e:
        if "Duplicate column" in str(e) or "already exists" in str(e).lower() or getattr(e, 'errno', None) == 1060:
            print("served_by_user_id column already exists in order_items table, skipping.")
        else:
            print(f"Error adding served_by_user_id: {e}")

    try:
        sql = """
        ALTER TABLE order_items
        ADD CONSTRAINT fk_order_items_served_by
        FOREIGN KEY (served_by_user_id) REFERENCES users(id)
        ON DELETE SET NULL
        """
        cursor.execute(sql)
        conn.commit()
        print("Successfully added foreign key fk_order_items_served_by.")
    except Exception as e:
        if "Duplicate key name" in str(e) or "already exists" in str(e).lower() or getattr(e, 'errno', None) in (1061, 1826):
            print("fk_order_items_served_by constraint already exists, skipping.")
        else:
            print(f"Foreign key notice: {e}")

    cursor.close()
    conn.close()

if __name__ == "__main__":
    add_served_by_column()
