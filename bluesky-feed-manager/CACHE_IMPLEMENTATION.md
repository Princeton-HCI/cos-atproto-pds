# Long-Term Cache Implementation

## Summary

Implemented a long-term cache mechanism to prevent cold start issues when switching between feeds. The system now intelligently detects blueprint changes and invalidates caches appropriately.

## Key Changes

### 1. Blueprint Change Detection

- Added `blueprint_hash` field to `Feed` model to track blueprint state
- Added `blueprint_hash` field to `FeedCache` model to validate cached feeds
- Implemented `compute_blueprint_hash()` function that creates deterministic SHA256 hash of:
  - Feed sources (type, identifier, weight)
  - Ranking weights

### 2. Two-Tier Caching System

#### Short-Term Cache (30 seconds)

- Applied to search results (`SEARCH_CACHE_TTL = 30`)
- Prevents rapid re-fetching of the same searches
- Helps avoid overloading the VM with redundant API calls

#### Long-Term Cache (5 minutes)

- Applied to complete feed generation (`FEED_CACHE_TTL = 300`)
- Prevents cold starts when switching between feeds
- Significantly reduces wait time for frequently accessed feeds

### 3. Cache Invalidation Logic

The cache is invalidated and rebuilt in these scenarios:

1. **Blueprint Change**: When sources or ranking weights change for a feed
   - Detected by comparing current `blueprint_hash` with cached `blueprint_hash`
   - Always generates fresh feed (doesn't use cache)
   - Updates both short and long-term caches with new blueprint_hash
2. **Stale Posts**: When the oldest post in cache exceeds 48 hours

3. **Cache Age**: Background rebuild triggered after 5 minutes

### 4. File Changes

**models.py**:

- Added `blueprint_hash` to `Feed` model
- Added `blueprint_hash` to `FeedCache` model

**algos/feed.py**:

- Added `FEED_CACHE_TTL = 300` constant
- Added `compute_blueprint_hash()` function
- Modified `build_feed()` to save blueprint_hash with cache
- Modified `serve_from_cache()` to validate blueprint_hash
- Updated `handler()` to use `FEED_CACHE_TTL` instead of `SEARCH_CACHE_TTL` for background rebuilds

## Migration

Run the migration script to add the new columns to existing databases:

```bash
cd bluesky-feed-manager
python migrate_add_blueprint_hash.py
```

The migration is safe to run multiple times and will only add columns if they don't exist.

## Behavior

### Before

- Feeds regenerated every 30 seconds when accessed
- Cold start delay when switching to a feed not accessed recently
- Could serve cached feed from different blueprint if record_name reused

### After

- Feeds cached for 5 minutes (10x longer)
- No cold start delay for feeds accessed within 5 minutes
- Blueprint changes always trigger immediate regeneration
- Cache automatically invalidated when feed blueprint changes
- Different blueprints for same record_name never share cache

## User Impact

Users will experience:

- ✅ Faster feed switching (no cold start within 5 minutes)
- ✅ Consistent results when rapidly refreshing (30-second search cache)
- ✅ Fresh feeds when blueprints are updated
- ✅ Background updates keep feeds current without blocking requests
