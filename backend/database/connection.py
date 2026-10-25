"""
database/connection.py — MySQL Connection Helper
================================================

CONCEPT: How does a request travel through our system?
-------------------------------------------------------
When Next.js sends:
    GET http://localhost:5000/api/tables

Here is the journey:

  1. Browser / Next.js sends an HTTP request
         |
         v
  2. Flask receives it (our app.py is listening on port 5000)
         |
         v
  3. Flask matches the URL to a route function
     e.g. @table_bp.route("/api/tables") → get_all_tables()
         |
         v
  4. Our route function calls get_db_connection()
         |
         v
  5. mysql-connector-python opens a TCP socket to MySQL
         |
         v
  6. We send a SQL query: cursor.execute("SELECT * FROM ...")
         |
         v
  7. MySQL runs the query and returns rows
         |
         v
  8. We package the data as JSON using jsonify()
         |
         v
  9. Flask sends the HTTP response back to Next.js

CONCEPT: What is a cursor?
---------------------------
A cursor is like a "handle" or "pointer" into the database.
You send SQL through the cursor, and read results from it.

Think of it like a remote control for the database:
  cursor.execute("SELECT ...")  →  sends the SQL command
  cursor.fetchall()             →  retrieves ALL matching rows
  cursor.fetchone()             →  retrieves ONE row
  cursor.close()                →  release the cursor

WHY dictionary=True?
---------------------
By default, MySQL returns rows as plain tuples:
  (1, 'Chicken Momo', 250.00, 'Momo')

With dictionary=True, rows come back as Python dicts:
  {'id': 1, 'name': 'Chicken Momo', 'price': 250.00, 'category': 'Momo'}

Dicts are much easier to work with and convert to JSON.
"""

import mysql.connector
from mysql.connector import Error, pooling
import sys
import os
import datetime
import threading
from flask import jsonify

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import Config

_pool_lock = threading.Lock()
_connection_pool = None


def _build_connection_args():
    conn_args = {
        "host": Config.DB_HOST,
        "port": Config.DB_PORT,
        "user": Config.DB_USER,
        "password": Config.DB_PASSWORD,
        "database": Config.DB_NAME,
        "autocommit": False,
    }
    if "localhost" not in str(Config.DB_HOST) and "127.0.0.1" not in str(Config.DB_HOST):
        conn_args["ssl_disabled"] = False
        conn_args["ssl_verify_identity"] = False
    return conn_args


def _get_or_create_pool():
    global _connection_pool
    if _connection_pool is not None:
        return _connection_pool

    with _pool_lock:
        if _connection_pool is None:
            try:
                conn_args = _build_connection_args()
                _connection_pool = pooling.MySQLConnectionPool(
                    pool_name="restaurant_pool",
                    pool_size=10,
                    pool_reset_session=True,
                    **conn_args
                )
                print("[INFO] MySQL connection pool initialized (size=10).")
            except Exception as pool_err:
                print(f"[WARN] Failed to initialize connection pool ({pool_err}). Falling back to standalone connections.")
                _connection_pool = None
    return _connection_pool


def _configure_timezone(connection):
    """
    Sets MySQL session timezone to match the server's local operating system
    timezone (e.g. UTC+05:45 for Nepal Standard Time).
    This ensures TIMESTAMP columns (like created_at) are stored and returned
    accurately in local time without UTC offset mismatch.
    """
    try:
        offset = datetime.datetime.now().astimezone().strftime("%z")
        if len(offset) == 5:
            formatted_tz = f"{offset[:3]}:{offset[3:]}"
            tz_cursor = connection.cursor()
            tz_cursor.execute(f"SET time_zone = '{formatted_tz}'")
            tz_cursor.close()
    except Exception as tz_err:
        print(f"[WARN] Failed to set session time_zone: {tz_err}")


def get_db_connection():
    """
    Returns a MySQL connection with dictionary cursor support,
    drawn from the connection pool when available to avoid SSL/TCP handshake latency.
    """
    try:
        pool = _get_or_create_pool()
        if pool:
            try:
                conn = pool.get_connection()
                _configure_timezone(conn)
                return conn
            except Exception as pool_fetch_err:
                print(f"[WARN] Pool get_connection failed ({pool_fetch_err}), attempting direct connection...")

        # Fallback to direct connection if pooling is unavailable or exhausted
        conn_args = _build_connection_args()
        connection = mysql.connector.connect(**conn_args)
        _configure_timezone(connection)
        return connection
    except Error as e:
        raise Exception(f"Cannot connect to MySQL: {e}")


# ── Response Helper Functions ──────────────────────────────────────────────
# These are small utility functions to keep our route code clean.
# Instead of repeating jsonify({"error": "..."}) everywhere,
# we call error_response("...") and it returns the same thing.

def success_response(data, status_code=200):
    """
    Returns a successful JSON response.

    CONCEPT: HTTP Status Codes
    ---------------------------
    Every HTTP response has a numeric status code that tells the
    client whether the request succeeded and why.

    Common codes we'll use:
      200 OK          → Request succeeded, returning data
      201 Created     → Resource was created (after POST)
      400 Bad Request → Client sent invalid data
      404 Not Found   → The requested resource doesn't exist
      500 Server Error → Something broke on our end

    The browser and Next.js use these codes to decide what to do.
    For example, if we return 404, Next.js knows "this doesn't exist"
    and can show a proper "not found" message to the user.
    """
    return jsonify(data), status_code


def error_response(message, status_code=400):
    """
    Returns a consistent JSON error response.

    Example output:
        HTTP 404
        {"error": "Table not found"}
    """
    return jsonify({"error": message}), status_code

