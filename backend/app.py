"""
app.py — Flask Application Entry Point
========================================

This is the "main" file of our backend. It is the first file
Python runs when we start the Flask server.

What does it do?
-----------------
1. Creates the Flask application object
2. Configures CORS (explains below)
3. Registers our route Blueprints
4. Defines a health check endpoint
5. Starts the development server

──────────────────────────────────────────────────────────────────

CONCEPT: What is Flask?
------------------------
Flask is a "web framework" — a library that makes it easy to build
web servers in Python.

Without Flask, you'd have to manually:
- Listen for incoming network connections
- Parse HTTP request headers
- Route requests to the right function
- Format responses

Flask handles all of that. You just write:

    @app.route("/api/menu")
    def get_menu():
        return {"items": [...]}

And Flask does the rest.

──────────────────────────────────────────────────────────────────

CONCEPT: What is CORS?
------------------------
CORS = Cross-Origin Resource Sharing

Browsers have a built-in security rule called the "Same-Origin Policy":
A webpage can only make requests to the SAME server it was loaded from.

Our setup breaks this rule:
  - Next.js is at: http://localhost:3000
  - Flask is at:   http://localhost:5000

These are DIFFERENT origins (different ports = different origin).

So when Next.js tries to call Flask's API, the browser says:
"STOP! This looks suspicious. I won't allow it."

The fix: Flask must send a special header in its response:
  Access-Control-Allow-Origin: http://localhost:3000

This tells the browser: "I (the server at port 5000) have
explicitly allowed requests from port 3000. It's safe."

We use the `flask-cors` library to add these headers automatically.

──────────────────────────────────────────────────────────────────

CONCEPT: What is a Blueprint?
-------------------------------
Instead of defining all routes in this one file (which would become
hundreds of lines long), we split routes into separate files and
use Flask Blueprints to organize them.

Think of it like importing different sections:
  - menu_bp   handles everything at /api/menu/...
  - order_bp  handles everything at /api/orders/...
  - table_bp  handles everything at /api/tables/...

We register (connect) those Blueprints here in app.py.

──────────────────────────────────────────────────────────────────
"""

from flask import Flask, jsonify
from flask_cors import CORS

from config import Config
from routes.menu_routes import menu_bp
from routes.order_routes import order_bp
from routes.table_routes import table_bp
from routes.auth_routes import auth_bp
from routes.settings_routes import settings_bp
from routes.category_routes import category_bp
from routes.dashboard_routes import dashboard_bp
from database.connection import get_db_connection


def create_app():
    """
    Application Factory Pattern
    ----------------------------
    Instead of creating the Flask app at module level (which makes
    testing harder), we wrap it in a function called create_app().
    
    This is the recommended Flask pattern. It makes the app easier
    to test and configure for different environments.
    """

    # Create the Flask application instance
    # __name__ tells Flask where to look for templates and static files
    app = Flask(__name__)

    # Load configuration from our Config class (which reads .env)
    app.config.from_object(Config)

    # ── Configure CORS ────────────────────────────────────────────────────
    # origins: Only allow requests from our Next.js frontend.
    # During development this is localhost:3000.
    # In production you'd change this to your actual domain.
    #
    # supports_credentials: Allow cookies/auth headers (needed for sessions)
    CORS(app, origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://192.168.1.29:3000"], supports_credentials=True)

    # ── Register Blueprints ───────────────────────────────────────────────
    # Each blueprint contains a group of related routes.
    # We'll add actual routes inside these files in later phases.
    app.register_blueprint(menu_bp)
    app.register_blueprint(order_bp)
    app.register_blueprint(table_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(settings_bp)
    app.register_blueprint(category_bp)
    app.register_blueprint(dashboard_bp)

    # ── Health Check Endpoint ─────────────────────────────────────────────
    # A health check is a simple endpoint we can call to verify
    # the server is running. It's the first thing we test.
    #
    # CONCEPT: What is jsonify()?
    # jsonify() converts a Python dictionary into a JSON HTTP response.
    # JSON (JavaScript Object Notation) is the universal data format
    # that browsers and APIs use to communicate.
    #
    # Example: {"status": "ok"} → sent as HTTP response with
    # Content-Type: application/json header
    @app.route("/health", methods=["GET"])
    def health_check():
        return jsonify({
            "status": "ok",
            "message": "Flask backend is running!",
            "restaurant": "My Restaurant"
        }), 200
        # 200 is the HTTP status code for "Success"
        # We'll learn more status codes as we build more routes

    # ── Database Connection Test ───────────────────────────────────────────
    # This endpoint actually opens a connection to MySQL and runs a query.
    # Use it to confirm Flask ↔ MySQL is working before building full APIs.
    @app.route("/api/db-test", methods=["GET"])
    def db_test():
        conn = None
        cursor = None
        try:
            conn = get_db_connection()
            cursor = conn.cursor(dictionary=True)

            # Simple test: ask MySQL what version it is
            cursor.execute("SELECT VERSION() AS version")
            result = cursor.fetchone()

            # Also count our tables to confirm the schema is there
            cursor.execute("SELECT COUNT(*) AS count FROM restaurant_tables")
            table_count = cursor.fetchone()

            cursor.execute("SELECT COUNT(*) AS count FROM menu_items")
            menu_count = cursor.fetchone()

            return jsonify({
                "status": "ok",
                "message": "Flask successfully connected to MySQL!",
                "mysql_version": result["version"],
                "restaurant_tables": table_count["count"],
                "menu_items": menu_count["count"],
            }), 200

        except Exception as e:
            return jsonify({
                "status": "error",
                "message": f"Database connection failed: {str(e)}"
            }), 500

        finally:
            if cursor:
                cursor.close()
            if conn:
                conn.close()

    return app


# ── Start the Server ──────────────────────────────────────────────────────
# This block only runs when you execute: python app.py
# It does NOT run when another file imports app.py
#
# app.run() starts Flask's built-in development web server.
# It listens for incoming HTTP requests on the specified host and port.
#
# host="0.0.0.0" → Accept connections from any network interface
#                   (needed for mobile devices to connect in Phase 8)
# debug=True     → Auto-restart when you save changes + show error details
if __name__ == "__main__":
    app = create_app()
    print("\n=== Restaurant Management System - Flask Backend ===")
    print("=" * 50)
    print("[OK] Server starting at http://localhost:5000")
    print("[OK] Health check: http://localhost:5000/health")
    print("=" * 50)
    print("Press CTRL+C to stop the server\n")
    app.run(host="0.0.0.0", port=5000, debug=Config.DEBUG)
