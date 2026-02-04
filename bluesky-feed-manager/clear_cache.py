#!/usr/bin/env python3
"""
Utility script to clear feed caches.
Useful for testing or forcing a complete feed regeneration.
"""

import sqlite3
import os
import sys

DB_PATH = os.path.join(os.path.dirname(__file__), 'feeds.db')

def clear_all_caches():
    """Clear all feed and search caches."""
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH}")
        return
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Clear feed cache
        cursor.execute("DELETE FROM feedcache")
        feed_count = cursor.rowcount
        
        # Clear search cache
        cursor.execute("DELETE FROM searchcache")
        search_count = cursor.rowcount
        
        conn.commit()
        print(f"✅ Cleared {feed_count} feed cache entries")
        print(f"✅ Cleared {search_count} search cache entries")
        
    except Exception as e:
        print(f"❌ Failed to clear caches: {e}")
        conn.rollback()
    
    finally:
        conn.close()

def clear_feed_cache(feed_uri: str):
    """Clear cache for a specific feed."""
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH}")
        return
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        cursor.execute("DELETE FROM feedcache WHERE feed_uri = ?", (feed_uri,))
        count = cursor.rowcount
        conn.commit()
        
        if count > 0:
            print(f"✅ Cleared cache for feed: {feed_uri}")
        else:
            print(f"ℹ️  No cache found for feed: {feed_uri}")
        
    except Exception as e:
        print(f"❌ Failed to clear cache: {e}")
        conn.rollback()
    
    finally:
        conn.close()

def list_cached_feeds():
    """List all feeds with cached data."""
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH}")
        return
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            SELECT 
                feed_uri, 
                timestamp, 
                datetime(timestamp, 'unixepoch') as cached_at,
                blueprint_hash
            FROM feedcache 
            ORDER BY timestamp DESC
        """)
        
        rows = cursor.fetchall()
        
        if not rows:
            print("No cached feeds found")
            return
        
        print(f"\n📊 Found {len(rows)} cached feeds:\n")
        for feed_uri, timestamp, cached_at, blueprint_hash in rows:
            age_minutes = (int(__import__('time').time()) - timestamp) // 60
            hash_short = blueprint_hash[:12] if blueprint_hash else "N/A"
            print(f"  • {feed_uri}")
            print(f"    Cached: {cached_at} ({age_minutes} minutes ago)")
            print(f"    Blueprint: {hash_short}...")
            print()
        
    except Exception as e:
        print(f"❌ Failed to list caches: {e}")
    
    finally:
        conn.close()

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python clear_cache.py all              # Clear all caches")
        print("  python clear_cache.py list             # List cached feeds")
        print("  python clear_cache.py <feed_uri>       # Clear specific feed cache")
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == 'all':
        clear_all_caches()
    elif command == 'list':
        list_cached_feeds()
    else:
        clear_feed_cache(command)
