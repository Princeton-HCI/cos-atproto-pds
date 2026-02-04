#!/usr/bin/env python3
"""
Migration script to add blueprint_hash columns to Feed and FeedCache tables.
This migration is safe to run multiple times.
"""

import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'feeds.db')

def migrate():
    """Add blueprint_hash columns if they don't exist."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Check if blueprint_hash exists in Feed table
        cursor.execute("PRAGMA table_info(feed)")
        feed_columns = [row[1] for row in cursor.fetchall()]
        
        if 'blueprint_hash' not in feed_columns:
            print("Adding blueprint_hash column to Feed table...")
            cursor.execute("ALTER TABLE feed ADD COLUMN blueprint_hash TEXT")
            print("✓ Added blueprint_hash to Feed table")
        else:
            print("✓ blueprint_hash already exists in Feed table")
        
        # Check if blueprint_hash exists in FeedCache table
        cursor.execute("PRAGMA table_info(feedcache)")
        cache_columns = [row[1] for row in cursor.fetchall()]
        
        if 'blueprint_hash' not in cache_columns:
            print("Adding blueprint_hash column to FeedCache table...")
            cursor.execute("ALTER TABLE feedcache ADD COLUMN blueprint_hash TEXT")
            print("✓ Added blueprint_hash to FeedCache table")
        else:
            print("✓ blueprint_hash already exists in FeedCache table")
        
        conn.commit()
        print("\nMigration completed successfully!")
        
    except Exception as e:
        print(f"\nMigration failed: {e}")
        conn.rollback()
        raise
    
    finally:
        conn.close()

if __name__ == '__main__':
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH}")
        print("The database will be created when you start the server.")
        exit(0)
    
    migrate()
