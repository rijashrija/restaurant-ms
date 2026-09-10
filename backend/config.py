"""
config.py — Application Configuration
======================================

What is this file?
------------------
This file holds all the settings for our Flask application.
Instead of scattering database passwords and URLs throughout our code,
we centralize them here.

What are Environment Variables?
---------------------------------
An environment variable is a value stored OUTSIDE your code — in a file
called `.env` or in the operating system itself.

WHY? Two main reasons:
1. Security: You never commit passwords to Git (GitHub, etc.)
   If you hardcode "password123" in app.py and push it to GitHub,
   anyone can see it. With .env files, you add .env to .gitignore.

2. Flexibility: On your laptop, the database is at "localhost".
   On a production server, it might be "db.myrestaurant.com".
   You change one .env file, not 20 lines of code.

HOW it works in Flask:
- We use the `python-dotenv` library to load the .env file.
- Then `os.getenv("KEY")` reads that value.
"""

import os
from dotenv import load_dotenv

# Load the .env file from the backend/ folder
# This reads all KEY=VALUE pairs from .env and makes them
# available via os.getenv()
load_dotenv()


class Config:
    """
    All application settings live here as class attributes.
    
    We use os.getenv("KEY", "default_value") pattern:
    - First argument: the variable name in .env
    - Second argument: a fallback value if the variable is missing
    """

    # --- Database Settings ---
    # These tell Flask where to find MySQL and how to log in.
    DB_HOST = os.getenv("DB_HOST", "localhost")
    DB_PORT = int(os.getenv("DB_PORT", "3306"))   # MySQL default port is 3306
    DB_USER = os.getenv("DB_USER", "root")
    DB_PASSWORD = os.getenv("DB_PASSWORD", "")
    DB_NAME = os.getenv("DB_NAME", "restaurant_db")

    # --- Flask Settings ---
    DEBUG = os.getenv("FLASK_DEBUG", "True") == "True"
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")
