from database.connection import get_db_connection

def add_permissions_column():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        sql = "ALTER TABLE users ADD COLUMN permissions VARCHAR(255) NULL DEFAULT 'orders,menu' AFTER role"
        cursor.execute(sql)
        conn.commit()
        print("permissions column added successfully.")
    except Exception as e:
        if "Duplicate column" in str(e):
            print("permissions column already exists, skipping.")
        else:
            print(f"Error: {e}")
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    add_permissions_column()
