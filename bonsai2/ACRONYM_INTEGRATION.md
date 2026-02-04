# Acronym Detection Integration Guide

This guide shows how to integrate acronym detection into both Bonsai Classic and Bonsai v2 interfaces.

## Setup

1. Run the database migration:

```bash
cd bluesky-feed-manager
python migrate_add_acronym_support.py
```

2. Import the utility in your components:

```javascript
import {
  isLikelyAcronym,
  processTopicsWithAcronymDetection,
} from "../utils/acronymDetection";
```

## Integration Points

### Bonsai Classic Integration

**Location**: `src/components/BonsaiClassic.js`

#### 1. When Converting Blueprint for Deployment

Find the function that converts Classic weights back to standard format (around lines 240-280). Update it to include acronym detection:

```javascript
// In handleActivateFeedFromList or handleActivateCurrentFeed
// When preparing standardBlueprint for API

const standardBlueprint = {
  topic_preferences: (feedBlueprint.topic_preferences || []).map((topic) => {
    // Convert Classic UI weights back to standard API format
    let standardWeight = topic.weight;
    if (topic.weight === 0.3) standardWeight = 0.5;
    if (topic.weight === 0.75) standardWeight = 0.5;

    // Add acronym detection
    const isAcronym = isLikelyAcronym(topic.name);

    return {
      name: topic.name,
      weight: standardWeight,
      is_acronym: isAcronym ? 1 : 0,
      context: isAcronym ? feedIntent : null, // feedIntent should be stored in state
    };
  }),
  // ... rest of blueprint
};
```

#### 2. Store Original Intent

Add a new state variable to track the original feed intent:

```javascript
const [feedIntent, setFeedIntent] = useState("");
```

Update the feed object structure to store intent:

```javascript
const newFeed = {
  id: feedId,
  name: feedName,
  blueprint: feedBlueprint,
  rankingStyle,
  intent: feedIntent, // Add this
  createdAt: now,
  updatedAt: now,
  isActive: false,
};
```

#### 3. UI for Intent Input (Optional)

Add a text input field in the feed creation flow to capture the user's intent:

```javascript
<div style={{ marginBottom: "20px" }}>
  <label style={{ display: "block", marginBottom: "8px", fontWeight: "500" }}>
    Feed Description (helps with acronym disambiguation)
  </label>
  <input
    type="text"
    value={feedIntent}
    onChange={(e) => setFeedIntent(e.target.value)}
    placeholder="e.g., CHI conference and HCI research"
    style={{
      width: "100%",
      padding: "8px 12px",
      borderRadius: "4px",
      border: "1px solid #e5e7eb",
    }}
  />
</div>
```

### Bonsai v2 Integration

**Location**: `src/components/v2/FeedBuilderUI.js`

#### When Processing Ruleset Response

After receiving the ruleset from the generator API, add acronym detection before deployment:

```javascript
// In the function that handles ruleset generation response
const handleGenerateFeed = async () => {
  try {
    const response = await axios.post(
      process.env.REACT_APP_BLUESKY_FEED_RULESET_GENERATOR_API,
      { intent: feedIntent },
    );

    const blueprint = response.data.blueprint;

    // Add acronym detection to topic_preferences
    const processedTopicPreferences = (blueprint.topic_preferences || []).map(
      (topic) => ({
        ...topic,
        is_acronym: isLikelyAcronym(topic.name) ? 1 : 0,
        context: isLikelyAcronym(topic.name) ? feedIntent : null,
      }),
    );

    const enhancedBlueprint = {
      ...blueprint,
      topic_preferences: processedTopicPreferences,
    };

    setFeedBlueprint(enhancedBlueprint);
  } catch (error) {
    console.error("Failed to generate feed:", error);
  }
};
```

## Backend API Changes

The backend already handles the new fields. When creating/updating feeds, ensure the API payload includes:

```javascript
const payload = {
  handle: credentials.handle,
  password: credentials.password,
  hostname: extractedHostname,
  record_name: feedMetadata.recordName,
  display_name: feedMetadata.displayName,
  description: feedMetadata.description,
  blueprint: {
    topic_preferences: [
      {
        name: "CHI",
        weight: 0.65,
        is_acronym: 1, // New field
        context: "CHI conference Human-Computer Interaction research", // New field
      },
      {
        name: "Ferrari",
        weight: 0.65,
        is_acronym: 0, // Regular term
        context: null,
      },
    ],
    // ... rest of blueprint
  },
};
```

## Testing the Integration

### Test Case 1: Acronym Detection

```javascript
import { isLikelyAcronym } from "./utils/acronymDetection";

console.log(isLikelyAcronym("CHI")); // true
console.log(isLikelyAcronym("NBA")); // true
console.log(isLikelyAcronym("Ferrari")); // false
console.log(isLikelyAcronym("basketball")); // false
```

### Test Case 2: Full Feed Creation

Create a feed with:

- Intent: "I want posts about CHI conference and HCI research"
- Topics: ["CHI", "HCI", "research", "papers"]

Expected behavior:

- "CHI" → `is_acronym: 1`, `context: "I want posts about CHI conference..."`
- "HCI" → `is_acronym: 1`, `context: "I want posts about CHI conference..."`
- "research" → `is_acronym: 0`, `context: null`
- "papers" → `is_acronym: 0`, `context: null`

Backend will:

- Use vector-only search for "CHI" and "HCI" with full context
- Use both text + vector search for other terms

### Test Case 3: Feed Results

Before acronym support:

- Feed about "CHI" returns posts about "chicken" and "child"

After acronym support:

- Feed about "CHI" with context returns only CHI conference and HCI research posts

## Rollout Strategy

1. **Phase 1**: Deploy backend changes
   - Run migration
   - Update feed.py logic
   - Test with API calls that include new fields

2. **Phase 2**: Update frontends
   - Add acronymDetection utility
   - Integrate into Bonsai Classic
   - Integrate into Bonsai v2
   - Test feed creation end-to-end

3. **Phase 3**: Backfill existing feeds (optional)
   - Script to detect acronyms in existing feeds
   - Add context from feed descriptions
   - Update FeedSource records

## Backwards Compatibility

- New fields default to 0/null, so existing feeds work unchanged
- Feeds created before this change will use both search types for all terms
- After frontend update, new feeds will have smart acronym handling
- No breaking changes to API contracts
