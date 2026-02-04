#!/usr/bin/env python3
"""
Migration script to add acronym support fields to FeedSource table.
This migration is safe to run multiple times.
"""

import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'feeds.db')

def migrate():
    """Add is_acronym and context columns if they don't exist."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Check existing columns in FeedSource table
        cursor.execute("PRAGMA table_info(feedsource)")
        source_columns = [row[1] for row in cursor.fetchall()]
        
        if 'is_acronym' not in source_columns:
            print("Adding is_acronym column to FeedSource table...")
            cursor.execute("ALTER TABLE feedsource ADD COLUMN is_acronym INTEGER DEFAULT 0")
            print("✓ Added is_acronym to FeedSource table")
        else:
            print("✓ is_acronym already exists in FeedSource table")
        
        if 'context' not in source_columns:
            print("Adding context column to FeedSource table...")
            cursor.execute("ALTER TABLE feedsource ADD COLUMN context TEXT")
            print("✓ Added context to FeedSource table")
        else:
            print("✓ context already exists in FeedSource table")
        
        conn.commit()
        print("\nMigration completed successfully!")
        print("\nNext steps:")
        print("1. Update frontend to detect acronyms (all-caps, short length)")
        print("2. Send is_acronym=1 and context (original prompt) in API requests")
        print("3. Acronyms will use vector-only search, avoiding substring false positives")
        
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
