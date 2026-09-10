"""
utils/auth.py — JWT Authentication Helpers
==========================================

CONCEPT: How does JWT-based authentication work?
-------------------------------------------------
Instead of storing sessions on the server (old way), we use
stateless JSON Web Tokens (JWT):

  1. User sends username + password → POST /api/auth/login
  2. Flask verifies the password against the stored hash
  3. Flask generates a signed JWT token:
         { "user_id": 3, "username": "alice", "role": "manager", "exp": ... }
     This token is signed with our SECRET_KEY so nobody can fake it.
  4. Frontend stores this token (in memory / localStorage)
  5. Every subsequent request includes the token in the header:
         Authorization: Bearer eyJhbGci...
  6. Flask's @require_auth decorator reads + verifies the token
     and knows who is making the request.

CONCEPT: Password Hashing (NEVER store plain text passwords!)
--------------------------------------------------------------
If we stored passwords as plain text and the database was hacked,
every user's password would be exposed.

Instead we store a one-way hash:
  - "mysecret" → bcrypt → "$2b$12$Gi8n..."
  - The hash cannot be reversed to get the original password.
  - To verify: hash the incoming password and compare to stored hash.

We use werkzeug.security (already bundled with Flask):
  generate_password_hash("mysecret")  → stores the hash
  check_password_hash(stored_hash, "mysecret")  → True/False
"""

import jwt
import os
from datetime import datetime, timezone, timedelta
from functools import wraps
from flask import request
from database.connection import error_response


SECRET_KEY = os.getenv("SECRET_KEY", "restaurant_secret_fallback")
TOKEN_EXPIRY_HOURS = 24


def generate_token(user_id: int, username: str, role: str, permissions: str = "orders,menu") -> str:
    """
    Creates a signed JWT token for a user.
    
    The token payload contains:
      - user_id, username, role, permissions: identity & access info
      - iat: issued at (when was it created)
      - exp: expiry (when does it stop being valid)
    """
    payload = {
        "user_id": user_id,
        "username": username,
        "role": role,
        "permissions": permissions,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRY_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")


def decode_token(token: str) -> dict:
    """
    Decodes and verifies a JWT token.
    Returns the payload dict, or raises an exception if invalid/expired.
    """
    return jwt.decode(token, SECRET_KEY, algorithms=["HS256"])


def require_auth(f):
    """
    A Python decorator that protects a Flask route.
    
    Usage:
        @order_bp.route("/api/orders", methods=["GET"])
        @require_auth
        def get_orders():
            ...   # Only runs if a valid token is present
    
    CONCEPT: Python Decorators
    ---------------------------
    A decorator wraps a function with extra behavior.
    @require_auth before a route means: 
      "Before calling get_orders(), run the auth check first."
    If the check fails, we return a 401 error immediately
    and the original route function never runs.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        
        if not auth_header.startswith("Bearer "):
            return error_response("Authentication required. Please log in.", 401)
        
        token = auth_header.split(" ", 1)[1]
        
        try:
            payload = decode_token(token)
            # Attach user info to the request so the route can access it
            request.current_user = payload
        except jwt.ExpiredSignatureError:
            return error_response("Session expired. Please log in again.", 401)
        except jwt.InvalidTokenError:
            return error_response("Invalid token. Please log in again.", 401)
        
        return f(*args, **kwargs)
    return decorated


def require_owner(f):
    """
    A decorator that ensures only the Owner can call a route.
    Must be used AFTER @require_auth.
    
    Usage:
        @auth_bp.route("/api/auth/create-manager", methods=["POST"])
        @require_auth
        @require_owner
        def create_manager():
            ...
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        user = getattr(request, "current_user", None)
        if not user or user.get("role") != "owner":
            return error_response("Owner access required.", 403)
        return f(*args, **kwargs)
    return decorated
