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
from mysql.connector import Error
import sys
import os
from flask import jsonify

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import Config


def get_db_connection():
    """
    Creates and returns a MySQL connection with dictionary cursor support.

    Usage in a route:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM menu_items")
        items = cursor.fetchall()
        cursor.close()
        conn.close()
        return jsonify(items), 200

    Returns:
        mysql.connector.connection.MySQLConnection
    Raises:
        Exception if the connection fails
    """
    try:
        conn_args = {
            "host": Config.DB_HOST,
            "port": Config.DB_PORT,
            "user": Config.DB_USER,
            "password": Config.DB_PASSWORD,
            "database": Config.DB_NAME,
            "autocommit": False,
        }
        # If connecting to remote cloud database (e.g. Aiven), configure SSL parameters with fallback
        if "localhost" not in str(Config.DB_HOST) and "127.0.0.1" not in str(Config.DB_HOST):
            try:
                ssl_args = dict(conn_args)
                ssl_args["ssl_disabled"] = False
                ssl_args["ssl_verify_identity"] = False
                return mysql.connector.connect(**ssl_args)
            except Exception as ssl_err:
                print(f"[WARN] SSL connection attempt failed ({ssl_err}), trying standard connection...")

        connection = mysql.connector.connect(**conn_args)
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

