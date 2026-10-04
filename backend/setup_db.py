"""
setup_db.py — One-Time Database Setup Script
=============================================

Run this script ONCE to:
1. Create the MySQL database (restaurant_db)
2. Create all tables (restaurant_tables, menu_items, orders, order_items)
3. Insert sample data (10 tables, 22 menu items)

HOW TO RUN:
-----------
From the backend/ folder with venv active:
    python setup_db.py

You should see green checkmarks for each step.
After that, you never need to run this again unless you reset the DB.

WHAT IS A DATABASE TRANSACTION? (Preview of Phase 5 concept)
-------------------------------------------------------------
When we create orders later, we'll use transactions.
A transaction is a group of SQL statements treated as ONE operation:
- Either ALL of them succeed → data saved
- Or ANY ONE fails → ALL are rolled back (undone)

Example: Creating an order requires:
  1. INSERT INTO orders ...
  2. INSERT INTO order_items ... (multiple rows)

If step 2 crashes halfway, we don't want a half-created order.
Transactions prevent this. We'll see this in Phase 5.
"""

import sys
import os

# ── Import our config (loads .env file automatically) ─────────────────────
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from config import Config

import mysql.connector
from mysql.connector import Error


def print_step(message: str, success: bool = True):
    """Print a step with a colored indicator."""
    icon = "[OK]" if success else "[FAIL]"
    print(f"  {icon}  {message}")


def run_setup():
    print("\n=== Restaurant DB Setup ===")
    print("=" * 50)

    # ── Step 1: Connect to MySQL (without selecting a database yet) ────────
    # We connect WITHOUT specifying a database name first,
    # because the database might not exist yet.
    print("\n[1/5] Connecting to MySQL...")
    try:
        conn = mysql.connector.connect(
            host=Config.DB_HOST,
            port=Config.DB_PORT,
            user=Config.DB_USER,
            password=Config.DB_PASSWORD,
        )
        cursor = conn.cursor()
        print_step(f"Connected to MySQL at {Config.DB_HOST}:{Config.DB_PORT}")
    except Error as e:
        print_step(f"Failed to connect: {e}", success=False)
        print("\n💡 Check your DB_PASSWORD in backend/.env")
        sys.exit(1)

    # ── Step 2: Create the database ────────────────────────────────────────
    print("\n[2/5] Creating database...")
    try:
        cursor.execute(
            f"CREATE DATABASE IF NOT EXISTS `{Config.DB_NAME}` "
            "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
        )
        cursor.execute(f"USE `{Config.DB_NAME}`")
        print_step(f"Database '{Config.DB_NAME}' ready")
    except Error as e:
        print_step(f"Failed to create database: {e}", success=False)
        sys.exit(1)

    # ── Step 3: Create all tables ──────────────────────────────────────────
    print("\n[3/5] Creating tables...")

    # Read the SQL from schema.sql
    schema_path = os.path.join(os.path.dirname(__file__), "database", "schema.sql")

    with open(schema_path, "r", encoding="utf-8") as f:
        raw_sql = f.read()

    # Split SQL into individual statements
    # We need to skip comments and empty lines
    statements = []
    current = []
    for line in raw_sql.splitlines():
        stripped = line.strip()
        # Skip comment-only lines and empty lines for statement splitting
        if stripped.startswith("--") or not stripped:
            continue
        current.append(line)
        if stripped.endswith(";"):
            statement = "\n".join(current).strip()
            if statement:
                statements.append(statement)
            current = []

    # Execute each statement
    table_names = []
    for stmt in statements:
        try:
            # Skip USE and CREATE DATABASE — we already did those
            upper = stmt.upper().strip()
            if upper.startswith("USE ") or upper.startswith("CREATE DATABASE"):
                continue
            if upper.startswith("CREATE TABLE"):
                # Extract table name for display
                parts = stmt.split()
                if "IF" in parts:
                    idx = parts.index("EXISTS") + 1
                else:
                    idx = parts.index("TABLE") + 1
                tname = parts[idx].strip("`(")
                table_names.append(tname)

            cursor.execute(stmt)
            conn.commit()
        except Error as e:
            # 1050 = Table already exists — safe to ignore when re-running
            if e.errno == 1050:
                pass
            else:
                print_step(f"Error in statement: {e}", success=False)
                print(f"     Statement: {stmt[:80]}...")

    for tname in table_names:
        print_step(f"Table '{tname}' ready")

    # ── Step 4: Insert sample data ─────────────────────────────────────────
    print("\n[4/5] Inserting sample data...")

    # Check if data already exists to avoid duplicates
    cursor.execute("SELECT COUNT(*) FROM restaurant_tables")
    (table_count,) = cursor.fetchone()

    cursor.execute("SELECT COUNT(*) FROM menu_items")
    (menu_count,) = cursor.fetchone()

    if table_count > 0:
        print_step(f"restaurant_tables: {table_count} rows already exist, skipping")
    else:
        # Tables data (from schema.sql INSERT statements — already run above)
        cursor.execute("SELECT COUNT(*) FROM restaurant_tables")
        (count,) = cursor.fetchone()
        print_step(f"restaurant_tables: {count} tables inserted")

    if menu_count > 0:
        print_step(f"menu_items: {menu_count} items already exist, skipping")
    else:
        cursor.execute("SELECT COUNT(*) FROM menu_items")
        (count,) = cursor.fetchone()
        print_step(f"menu_items: {count} items inserted")

    # ── Step 5: Final verification ─────────────────────────────────────────
    print("\n[5/5] Verification...")

    cursor.execute("SHOW TABLES")
    tables = [row[0] for row in cursor.fetchall()]
    print_step(f"Tables in restaurant_db: {', '.join(tables)}")

    cursor.execute("SELECT COUNT(*) FROM restaurant_tables")
    (n,) = cursor.fetchone()
    print_step(f"restaurant_tables: {n} rows")

    cursor.execute("SELECT COUNT(*) FROM menu_items")
    (n,) = cursor.fetchone()
    print_step(f"menu_items: {n} rows")

    cursor.execute("SELECT COUNT(*) FROM orders")
    (n,) = cursor.fetchone()
    print_step(f"orders: {n} rows (empty, ready for customers)")

    cursor.execute("SELECT COUNT(*) FROM order_items")
    (n,) = cursor.fetchone()
    print_step(f"order_items: {n} rows (empty, ready for customers)")

    cursor.close()
    conn.close()

    print("\n" + "=" * 50)
    print("Database setup complete! All done.")
    print("=" * 50)
    print("\nNext step: Run the Flask server and test the database connection.")
    print("  python app.py\n")


if __name__ == "__main__":
    run_setup()
