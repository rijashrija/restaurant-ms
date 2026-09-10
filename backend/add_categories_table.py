"""
add_categories_table.py — Database Migration Script
===================================================
Adds the `menu_categories` table to the existing database.
Seeds it with default categories if it's empty.
"""

from database.connection import get_db_connection

def run_migration():
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        print("[INFO] Creating menu_categories table...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS menu_categories (
                id           INT AUTO_INCREMENT PRIMARY KEY,
                name         VARCHAR(100) NOT NULL UNIQUE,
                is_active    BOOLEAN NOT NULL DEFAULT TRUE,
                created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Check if we need to seed the table
        cursor.execute("SELECT COUNT(*) AS count FROM menu_categories")
        result = cursor.fetchone()
        if result[0] == 0:
            print("[INFO] Seeding default categories...")
            default_categories = ["Momo", "Snacks", "Main Course", "Drinks", "Desserts"]
            
            insert_query = "INSERT INTO menu_categories (name) VALUES (%s)"
            # Execute many inserts
            cursor.executemany(insert_query, [(cat,) for cat in default_categories])
            print("[OK] Default categories seeded.")
        else:
            print("[OK] Categories table already has data, skipping seed.")

        conn.commit()
        print("[DONE] Migration complete!")

    except Exception as e:
        if conn:
            conn.rollback()
        print(f"[ERROR] Migration failed: {e}")
        raise
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

if __name__ == "__main__":
    run_migration()
