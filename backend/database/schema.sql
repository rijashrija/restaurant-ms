-- =============================================================
-- schema.sql — Restaurant Management System Database
-- =============================================================
-- 
-- HOW TO USE THIS FILE:
-- Run it in MySQL to create all tables at once.
-- Command: mysql -u root -p restaurant_db < schema.sql
--
-- Or paste it directly into MySQL Workbench / CLI.
-- =============================================================


-- ──────────────────────────────────────────────────────────────
-- CONCEPT: What is a Database?
-- ──────────────────────────────────────────────────────────────
-- A database is an organized collection of data stored on disk.
-- MySQL is a "Relational Database" — it stores data in TABLES,
-- just like Excel spreadsheets, but much more powerful.
--
-- Each TABLE has:
--   - Columns (the type of data: name, price, status...)
--   - Rows    (the actual data: "Chicken Momo", 250, "available"...)
-- ──────────────────────────────────────────────────────────────


-- ──────────────────────────────────────────────────────────────
-- CONCEPT: What is a Primary Key?
-- ──────────────────────────────────────────────────────────────
-- Every table needs a way to uniquely identify each row.
-- A Primary Key (PK) is a column whose value is UNIQUE for every row.
--
-- Example: Two menu items can have the same name (imagine two
-- "Special Momo" variants). But their `id` will always differ:
--   id=1  → Chicken Momo
--   id=2  → Veg Momo
--
-- Rules for Primary Keys:
--   ✅ Must be unique (no two rows share the same PK value)
--   ✅ Cannot be NULL (empty)
--   ✅ Usually AUTO_INCREMENT (MySQL assigns it automatically)
--
-- We use `id INT AUTO_INCREMENT PRIMARY KEY` in every table.
-- ──────────────────────────────────────────────────────────────


-- ──────────────────────────────────────────────────────────────
-- CONCEPT: What is a Foreign Key?
-- ──────────────────────────────────────────────────────────────
-- A Foreign Key (FK) is how we CONNECT two tables.
--
-- Example: An order belongs to a table. We store the table's `id`
-- inside the `orders` row. This is the foreign key.
--
--   restaurant_tables    orders
--   ┌────┬─────────┐     ┌────┬──────────┬────────┐
--   │ id │ table_# │     │ id │ table_id │ status │
--   ├────┼─────────┤     ├────┼──────────┼────────┤
--   │  1 │    1    │◄────│ 101│    1     │ New    │
--   │  2 │    2    │     │ 102│    1     │ Ready  │
--   │  5 │    5    │◄────│ 103│    5     │ New    │
--   └────┴─────────┘     └────┴──────────┴────────┘
--
-- The FK constraint enforces referential integrity:
--   ❌ You CANNOT create an order for table_id=99 if table 99 doesn't exist
--   ❌ You CANNOT delete a table that has orders attached to it
-- This prevents "orphaned" data — orders pointing to nothing.
-- ──────────────────────────────────────────────────────────────


-- ──────────────────────────────────────────────────────────────
-- Step 1: Create and select the database
-- ──────────────────────────────────────────────────────────────
-- IF NOT EXISTS means this is safe to run again — it won't
-- crash if the database already exists.
CREATE DATABASE IF NOT EXISTS restaurant_db
    CHARACTER SET utf8mb4        -- Supports all characters including emoji, Nepali fonts
    COLLATE utf8mb4_unicode_ci;  -- Case-insensitive comparison (momo = MOMO = Momo)

USE restaurant_db;


-- ──────────────────────────────────────────────────────────────
-- TABLE 1: users
-- ──────────────────────────────────────────────────────────────
-- Stores owners, managers, and staff members.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    username        VARCHAR(100) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    role            ENUM('owner', 'manager', 'staff') NOT NULL DEFAULT 'staff',
    permissions     TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ──────────────────────────────────────────────────────────────
-- TABLE 2: restaurant_settings
-- ──────────────────────────────────────────────────────────────
-- Stores the branding of the restaurant.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS restaurant_settings (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    restro_name     VARCHAR(200) NOT NULL,
    tagline         VARCHAR(255),
    description     TEXT,
    logo_url        VARCHAR(500)
);

-- ──────────────────────────────────────────────────────────────
-- TABLE 3: menu_categories
-- ──────────────────────────────────────────────────────────────
-- Stores categories for menu items.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS menu_categories (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(100) NOT NULL UNIQUE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE
);

-- ──────────────────────────────────────────────────────────────
-- TABLE 4: restaurant_tables
-- ──────────────────────────────────────────────────────────────
-- Represents the physical tables in your restaurant.
-- Each table gets a unique QR code. When a customer scans it,
-- we look up the table using `qr_identifier`.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS restaurant_tables (
    -- PRIMARY KEY: Auto-assigned unique ID for each table
    -- INT        → Integer number (1, 2, 3...)
    -- AUTO_INCREMENT → MySQL assigns this automatically (1, then 2, then 3...)
    -- PRIMARY KEY → Marks this as the unique identifier for this table
    id              INT AUTO_INCREMENT PRIMARY KEY,

    -- The table number the customer sees (Table 1, Table 2...)
    -- NOT NULL → This field is required, cannot be empty
    -- UNIQUE   → No two rows can have the same table_number
    table_number    INT NOT NULL UNIQUE,

    -- The identifier embedded in the QR code URL
    -- e.g. "table-1", "table-2"
    -- VARCHAR(50) → Text up to 50 characters long
    qr_identifier   VARCHAR(50) NOT NULL UNIQUE,

    -- Current status of the table
    -- ENUM: Only allows one of these specific values
    -- If you try to insert "busy" it will fail — prevents typos
    status          ENUM('available', 'occupied') NOT NULL DEFAULT 'available',

    -- When this table record was created
    -- TIMESTAMP → Stores date + time
    -- DEFAULT CURRENT_TIMESTAMP → MySQL fills this in automatically
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ──────────────────────────────────────────────────────────────
-- TABLE 2: menu_items
-- ──────────────────────────────────────────────────────────────
-- Stores all food and drink items in the menu.
-- Items are never deleted — just marked unavailable.
-- This preserves history (old orders still reference old items).
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS menu_items (
    id              INT AUTO_INCREMENT PRIMARY KEY,

    -- Item name: "Chicken Momo", "Coke", "Chowmein"
    name            VARCHAR(200) NOT NULL,

    -- Optional longer description
    -- TEXT → For longer text (no character limit like VARCHAR)
    description     TEXT,

    -- Price of the item
    -- DECIMAL(10, 2) → Up to 10 digits total, 2 after decimal point
    -- e.g. 12345678.99 is valid. This is correct for prices.
    -- WHY NOT FLOAT? Float has rounding errors. DECIMAL is exact.
    -- 250.00 stays 250.00, never becomes 249.9999997
    price           DECIMAL(10, 2) NOT NULL,

    -- Category: "Momo", "Drinks", "Main Course"...
    -- We store this as plain text for now (no separate category table)
    -- Simple and sufficient for one restaurant
    category        VARCHAR(100) NOT NULL,

    -- Optional image URL stored in the database
    -- The actual image is hosted somewhere (or in /public folder)
    image_url       VARCHAR(500),

    -- Can customers order this item right now?
    -- BOOLEAN (alias for TINYINT(1)): TRUE = 1, FALSE = 0
    -- DEFAULT TRUE → New items are available by default
    is_available    BOOLEAN NOT NULL DEFAULT TRUE,

    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- When was this item last updated? (price change, description edit...)
    -- ON UPDATE CURRENT_TIMESTAMP → MySQL updates this automatically
    -- whenever any field in this row changes
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);


-- ──────────────────────────────────────────────────────────────
-- TABLE 3: orders
-- ──────────────────────────────────────────────────────────────
-- Stores the "header" of each order.
-- Think of it like an order receipt: it says WHO ordered (which table)
-- and WHAT STATE the order is in. The actual food items are in
-- the order_items table.
--
-- Why separate orders and order_items?
-- One order has MANY items. If we stored items directly here,
-- we'd need columns like item1, item2, item3... which is terrible.
-- Instead: one row in `orders` + many rows in `order_items`.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
    id              INT AUTO_INCREMENT PRIMARY KEY,

    -- FOREIGN KEY: Which table placed this order?
    -- This stores the `id` from restaurant_tables.
    -- e.g. table_id = 5 means Table 5 placed this order.
    table_id        INT NOT NULL,

    -- Order status lifecycle:
    -- new → preparing → ready → completed
    --             ↓
    --          cancelled (at any point)
    status          ENUM('new', 'preparing', 'ready', 'completed', 'cancelled')
                    NOT NULL DEFAULT 'new',

    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- ── FOREIGN KEY CONSTRAINT ────────────────────────────────
    -- This enforces the relationship between orders and restaurant_tables.
    -- FOREIGN KEY (table_id) → the column in THIS table
    -- REFERENCES restaurant_tables(id) → must match a real row there
    -- ON DELETE RESTRICT → Prevent deleting a table that has orders
    CONSTRAINT fk_orders_table
        FOREIGN KEY (table_id)
        REFERENCES restaurant_tables(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
);


-- ──────────────────────────────────────────────────────────────
-- TABLE 4: order_items
-- ──────────────────────────────────────────────────────────────
-- Stores each food item WITHIN an order.
--
-- Example: Order #101 has 2 Momos and 1 Coke → 2 rows here:
--   order_id=101, menu_item_id=1, quantity=2, price=250.00
--   order_id=101, menu_item_id=4, quantity=1, price=80.00
--
-- WHY store price here?
-- Menu prices can change over time. If Momo goes from Rs.250 to Rs.300,
-- old orders should still show Rs.250 — what the customer actually paid.
-- We snapshot the price at the moment of ordering.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
    id              INT AUTO_INCREMENT PRIMARY KEY,

    -- Which order does this item belong to?
    order_id        INT NOT NULL,

    -- Which menu item was ordered?
    menu_item_id    INT NOT NULL,

    -- How many of this item?
    -- Must be at least 1 — enforced by CHECK constraint
    quantity        INT NOT NULL,

    -- Price PER UNIT at the time of ordering (snapshot)
    -- NOT the current price from menu_items
    price           DECIMAL(10, 2) NOT NULL,

    -- ── FOREIGN KEY: order_id → orders.id ───────────────────
    -- If we delete an order, delete its items too (CASCADE)
    CONSTRAINT fk_order_items_order
        FOREIGN KEY (order_id)
        REFERENCES orders(id)
        ON DELETE CASCADE,

    -- ── FOREIGN KEY: menu_item_id → menu_items.id ───────────
    -- RESTRICT prevents deleting a menu item that appears in any order
    -- (protects historical data)
    CONSTRAINT fk_order_items_menu
        FOREIGN KEY (menu_item_id)
        REFERENCES menu_items(id)
        ON DELETE RESTRICT,

    -- ── CHECK CONSTRAINT ──────────────────────────────────────
    -- Enforces business rules at the database level
    -- Even if Flask has a bug, MySQL will reject quantity < 1
    CONSTRAINT chk_quantity CHECK (quantity >= 1),
    CONSTRAINT chk_price    CHECK (price >= 0)
);


-- ──────────────────────────────────────────────────────────────
-- SAMPLE DATA: restaurant_tables
-- ──────────────────────────────────────────────────────────────
-- Insert 10 tables for testing.
-- The QR identifier matches what the URL will contain:
--   http://localhost:3000/menu?table=table-1
-- ──────────────────────────────────────────────────────────────
INSERT IGNORE INTO restaurant_tables (table_number, qr_identifier, status) VALUES
    (1,  'table-1',  'available'),
    (2,  'table-2',  'available'),
    (3,  'table-3',  'available'),
    (4,  'table-4',  'available'),
    (5,  'table-5',  'available'),
    (6,  'table-6',  'available'),
    (7,  'table-7',  'available'),
    (8,  'table-8',  'available'),
    (9,  'table-9',  'available'),
    (10, 'table-10', 'available');


-- ──────────────────────────────────────────────────────────────
-- SAMPLE DATA: menu_items
-- ──────────────────────────────────────────────────────────────
-- Real menu items for a Nepali restaurant context.
-- Prices are in NPR (Nepali Rupees).
-- ──────────────────────────────────────────────────────────────
INSERT IGNORE INTO menu_items (name, description, price, category, is_available) VALUES
    -- Momos
    ('Chicken Momo',     'Juicy steamed chicken dumplings served with tomato chutney', 250.00, 'Momo',        TRUE),
    ('Veg Momo',         'Soft steamed vegetable dumplings with spicy dipping sauce',  200.00, 'Momo',        TRUE),
    ('Buff Momo',        'Traditional buffalo meat dumplings, lightly spiced',          220.00, 'Momo',        TRUE),
    ('Fried Momo',       'Crispy deep-fried momo with sesame chutney',                 280.00, 'Momo',        TRUE),
    ('Jhol Momo',        'Steamed momo in a rich, spiced tomato broth',                300.00, 'Momo',        TRUE),

    -- Snacks
    ('Chowmein',         'Stir-fried noodles with vegetables and soy sauce',           180.00, 'Snacks',      TRUE),
    ('Chicken Chowmein', 'Stir-fried noodles with tender chicken strips',              220.00, 'Snacks',      TRUE),
    ('Samosa',           'Crispy pastry filled with spiced potatoes and peas',          60.00, 'Snacks',      TRUE),
    ('Spring Roll',      'Golden fried rolls filled with seasoned vegetables',          80.00, 'Snacks',      TRUE),

    -- Main Course
    ('Dal Bhat',         'Traditional lentil soup with steamed rice and seasonal vegetables', 250.00, 'Main Course', TRUE),
    ('Chicken Curry',    'Slow-cooked chicken in aromatic Nepali spices',              350.00, 'Main Course', TRUE),
    ('Buff Curry',       'Tender buffalo meat in traditional curry sauce',             320.00, 'Main Course', TRUE),
    ('Fried Rice',       'Wok-tossed rice with eggs, vegetables and soy sauce',        200.00, 'Main Course', TRUE),

    -- Drinks
    ('Coke',             'Chilled Coca-Cola 330ml',                                     80.00, 'Drinks',      TRUE),
    ('Fanta',            'Chilled Fanta Orange 330ml',                                  80.00, 'Drinks',      TRUE),
    ('Sprite',           'Chilled Sprite 330ml',                                        80.00, 'Drinks',      TRUE),
    ('Lemon Soda',       'Freshly squeezed lemon with sparkling water',                 90.00, 'Drinks',      TRUE),
    ('Masala Tea',       'Spiced milk tea with ginger, cardamom and cinnamon',          60.00, 'Drinks',      TRUE),
    ('Black Coffee',     'Strong brewed coffee, served hot',                            80.00, 'Drinks',      TRUE),
    ('Mango Lassi',      'Chilled yogurt blended with fresh mango',                    120.00, 'Drinks',      TRUE),

    -- Desserts
    ('Gulab Jamun',      'Soft milk solid dumplings in sweet rose syrup (2 pieces)',   120.00, 'Desserts',    TRUE),
    ('Ice Cream',        'Vanilla ice cream served with chocolate sauce',              150.00, 'Desserts',    TRUE);


-- ──────────────────────────────────────────────────────────────
-- VERIFICATION QUERIES
-- ──────────────────────────────────────────────────────────────
-- Run these to confirm everything was created and inserted correctly.
-- ──────────────────────────────────────────────────────────────

-- Show all tables in the database
-- SHOW TABLES;

-- Count rows in each table
-- SELECT COUNT(*) AS table_count  FROM restaurant_tables;
-- SELECT COUNT(*) AS menu_count   FROM menu_items;

-- See all menu items grouped by category
-- SELECT category, COUNT(*) AS item_count
-- FROM menu_items
-- GROUP BY category
-- ORDER BY category;
