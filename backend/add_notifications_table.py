import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from database.connection import get_db_connection

def add_notifications_table():
    """
    Migration script:
    Creates order_notifications table to record customer order modifications,
    new rounds, and cancellations to notify restaurant staff.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
    except Exception as e:
        print(f"[WARN] Database connection not available right now: {e}")
        return

    try:
        sql = """
        CREATE TABLE IF NOT EXISTS order_notifications (
            id INT AUTO_INCREMENT PRIMARY KEY,
            order_id INT NOT NULL,
            table_id INT NOT NULL,
            table_number INT NOT NULL,
            change_type VARCHAR(50) NOT NULL,
            message VARCHAR(255) NOT NULL,
            item_name VARCHAR(100) NULL,
            old_quantity INT NULL,
            new_quantity INT NULL,
            is_read TINYINT(1) DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """
        cursor.execute(sql)
        conn.commit()
        print("Successfully created/verified order_notifications table.")
    except Exception as e:
        print(f"Error creating order_notifications table: {e}")
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    add_notifications_table()
