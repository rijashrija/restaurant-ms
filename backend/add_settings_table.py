"""
add_settings_table.py — Database Migration Script
===================================================
Adds the `restaurant_settings` table to the existing database.
This is SAFE to run — it will NOT delete any existing data.
"""

from database.connection import get_db_connection

def run_migration():
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        print("[INFO] Creating restaurant_settings table...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS restaurant_settings (
                id           INT AUTO_INCREMENT PRIMARY KEY,
                restro_name  VARCHAR(150) NOT NULL DEFAULT 'My Restaurant',
                tagline      VARCHAR(255) DEFAULT '',
                description  TEXT,
                logo_url     VARCHAR(500) DEFAULT '',
                updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        """)

        # Ensure there's always exactly one settings row to GET/PUT
        cursor.execute("SELECT COUNT(*) AS count FROM restaurant_settings")
        result = cursor.fetchone()
        if result[0] == 0:
            cursor.execute("""
                INSERT INTO restaurant_settings (restro_name, tagline, description, logo_url)
                VALUES ('My Restaurant', 'Delicious food, served with love', '', '')
            """)
            print("[OK] Created default settings row.")
        else:
            print("[OK] Settings row already exists, skipping insert.")

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
