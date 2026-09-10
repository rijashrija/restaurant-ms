from database.connection import get_db_connection

conn = get_db_connection()
cursor = conn.cursor()
try:
    sql = "ALTER TABLE users ADD COLUMN role ENUM('owner','manager') NOT NULL DEFAULT 'manager' AFTER password_hash"
    cursor.execute(sql)
    conn.commit()
    print("role column added successfully.")
except Exception as e:
    if "Duplicate column" in str(e):
        print("role column already exists, skipping.")
    else:
        print(f"Error: {e}")
finally:
    cursor.close()
    conn.close()
