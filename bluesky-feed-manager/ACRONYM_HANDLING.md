# Acronym Handling in Feed Generation

## Problem

Lesser-known acronyms (like "CHI") create false positives in feed generation because:

1. **Substring matching** is too broad - "chi" matches "chicken", "child", "Chicago", etc.
2. **Vector search** without context is ambiguous - "CHI" could mean many things

Example: A feed about "CHI" (intended: CHI conference on Human-Computer Interaction) shows posts about "chicken recipes" and "child care"

## Solution

Implement **acronym-aware search strategy** that:

- Detects acronyms on the frontend using heuristics (all-caps, short length)
- Stores acronym metadata in the database
- Uses **vector-only search** for acronyms (skips substring matching)
- Adds context from the original prompt to disambiguate meaning

## Architecture

### Database Schema

Added to `FeedSource` model:

```python
is_acronym = IntegerField(default=0)  # 1 if identifier is an acronym
context = TextField(null=True)         # Original prompt for disambiguation
```

### Frontend Detection

```javascript
import {
  isLikelyAcronym,
  processTopicsWithAcronymDetection,
} from "./utils/acronymDetection";

const userIntent = "I want a feed about CHI, Ferrari, and NBA basketball";
const topics = ["CHI", "Ferrari", "NBA", "basketball"];

const processed = processTopicsWithAcronymDetection(topics, userIntent);
// CHI and NBA flagged as acronyms with context
// Ferrari and basketball are regular terms
```

### Backend Handling

```python
# In feed.py build_feed():
if src.is_acronym:
    # Vector-only search with context
    query = f"{src.context} {src.identifier}" if src.context else src.identifier
    tasks.append(search_vector(query, limit))  # e.g., "CHI conference Human-Computer Interaction CHI"
else:
    # Regular terms: both text and vector search
    tasks.append(search_text(src.identifier, limit))
    tasks.append(search_vector(src.identifier, limit))
```

## Acronym Detection Heuristics

A term is flagged as an acronym if:

1. **All uppercase**: "CHI", "NBA", "AI"
2. **2-6 characters**: Short enough to be an acronym
3. **Alpha-only**: No spaces or special characters (periods allowed)

Examples:

- ✅ Detected: "CHI", "NBA", "AI", "ML", "NYC"
- ❌ Not detected: "Ferrari" (mixed case), "basketball" (lowercase), "A" (too short)

## Search Strategy Comparison

| Term Type | Substring Search  | Vector Search | Context Added |
| --------- | ----------------- | ------------- | ------------- |
| Regular   | ✅ Yes            | ✅ Yes        | ❌ No         |
| Acronym   | ❌ No (too broad) | ✅ Yes        | ✅ Yes        |

### Why This Works

**Regular terms** (e.g., "Ferrari", "basketball"):

- Substring search is safe - "Ferrari" won't match unrelated words
- Vector search adds semantic understanding
- No disambiguation needed

**Acronyms** (e.g., "CHI", "NBA"):

- Substring search disabled - prevents "chi" matching "chicken"
- Vector search enhanced with context - "I want a feed about CHI conference" → understands it's the HCI conference
- Context provides semantic grounding for the acronym

## API Changes

### Creating a Feed with Acronyms

**Before**:

```json
{
  "topic_preferences": [{ "name": "CHI", "weight": 0.65 }]
}
```

**After**:

```json
{
  "topic_preferences": [
    {
      "name": "CHI",
      "weight": 0.65,
      "is_acronym": 1,
      "context": "I want a feed about CHI conference and HCI research"
    }
  ]
}
```

## Migration

Run the migration to add new fields:

```bash
cd bluesky-feed-manager
python migrate_add_acronym_support.py
```

## Frontend Integration Examples

### Bonsai Classic

```javascript
// In BonsaiClassic.js when generating feed
const feedIntent = "Give me CHI conference and HCI research posts";
const topics = ["CHI", "HCI"];

const processedTopics = topics.map((topic) => ({
  name: topic,
  weight: 0.65,
  is_acronym: isLikelyAcronym(topic) ? 1 : 0,
  context: isLikelyAcronym(topic) ? feedIntent : null,
}));

// Send processedTopics in blueprint
```

### Bonsai v2

```javascript
// In FeedBuilderUI.js after ruleset generation
const userIntent = feedIntent;
const generatedTopics = rulesetResponse.topic_preferences;

const processedTopics = generatedTopics.map((topic) => ({
  ...topic,
  is_acronym: isLikelyAcronym(topic.name) ? 1 : 0,
  context: isLikelyAcronym(topic.name) ? userIntent : null,
}));
```

## Expected Behavior Changes

### Before Acronym Support

Feed about "CHI":

- ❌ Posts about "chicken recipes" (substring match on "chi")
- ❌ Posts about "child development" (substring match on "chi")
- ⚠️ Some posts about Chicago (lucky vector matches)

### After Acronym Support

Feed about "CHI" with context "CHI conference Human-Computer Interaction":

- ✅ Posts about CHI conference papers and presentations
- ✅ Posts about HCI research and CHI submissions
- ✅ Posts mentioning CHI conference attendees and sessions
- ❌ No false positives from "chicken" or "child"

## Testing

Test cases to verify:

1. **"CHI" with context "CHI conference HCI"** → CHI conference and HCI research posts only
2. **"NBA"** with context → Basketball posts only
3. **"Ferrari"** (not acronym) → Both searches active, good results
4. **"AI" with context "artificial intelligence"** → Tech/AI posts, not unrelated "ai" substrings

## Performance Impact

- **Reduced API calls**: Acronyms skip text search (1 search instead of 2)
- **Better cache efficiency**: Fewer false positives mean more relevant cached results
- **Improved user experience**: More accurate feeds, especially for niche topics with short names
