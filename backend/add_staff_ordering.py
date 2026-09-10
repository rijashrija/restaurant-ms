import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from database.connection import get_db_connection

def add_staff_ordering_features():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Update users table role enum
    try:
        sql = "ALTER TABLE users MODIFY COLUMN role ENUM('owner', 'manager', 'staff') NOT NULL DEFAULT 'manager'"
        cursor.execute(sql)
        conn.commit()
        print("Successfully updated users table role enum to include 'staff'.")
    except Exception as e:
        print(f"Error updating users table role: {e}")

    # 2. Add placed_by_user_id to orders table
    try:
        sql = "ALTER TABLE orders ADD COLUMN placed_by_user_id INT NULL AFTER table_id"
        cursor.execute(sql)
        conn.commit()
        print("Successfully added placed_by_user_id column to orders table.")
    except Exception as e:
        if "Duplicate column" in str(e):
            print("placed_by_user_id column already exists in orders table, skipping.")
        else:
            print(f"Error adding placed_by_user_id to orders table: {e}")

    # 3. Add foreign key constraint to placed_by_user_id
    try:
        sql = """
        ALTER TABLE orders
        ADD CONSTRAINT fk_orders_user
        FOREIGN KEY (placed_by_user_id) REFERENCES users(id)
        ON DELETE SET NULL
        """
        cursor.execute(sql)
        conn.commit()
        print("Successfully added foreign key constraint for placed_by_user_id.")
    except Exception as e:
        if "Duplicate key name" in str(e) or "already exists" in str(e).lower() or e.errno == 1061 or e.errno == 1826:
            print("Foreign key constraint already exists, skipping.")
        else:
            print(f"Error adding foreign key constraint: {e}")

    cursor.close()
    conn.close()

if __name__ == "__main__":
    add_staff_ordering_features()
