# From a sentence to five search queries and one generation prompt

A prompt that turns each line needing a cutaway into five queries for your own footage or a stock site, ordered from literal to loose, plus one generation prompt as the fallback when nothing is found.

Category: broll · difficulty: beginner · time: 5 min · works with: claude-code, claude, chatgpt, any-llm · verified: False
Source: https://superduperai.co/library/broll-search-query-generator-prompt/

## Prompt / recipe

```
For each sentence below, produce search queries to find a cutaway that shows it literally, then a generation prompt as the fallback.

Per sentence:
SENTENCE: quoted.
THE THING TO SHOW: one noun phrase, the object or action the sentence is about.
QUERIES, 5, from most literal to loosest, each 2-5 words, no adjectives like 'beautiful' or 'cinematic':
1. the exact object + the exact action
2. the object + the setting
3. the object alone, close-up
4. the action alone, hands only
5. the setting alone, wide
FILTERS: orientation {9:16 or 16:9}, duration 5-15 s, no people's faces, no logos.
GENERATION PROMPT (fallback, one paragraph): subject with 2 visual details, one action, setting, shot size + one camera move, light, style lock: {style lock}, ambient sound, 5 s, 'no on-screen text, no faces, no logos'.
FOUND IN OWN FOOTAGE? If a clip in the list below shows the thing, name it first and skip the queries.

Own footage (optional, clip + description):
{paste clip list}
Sentences:
{paste sentences}
```

## Steps

- Search your own footage first; the sidecar descriptions (or Life2Film's segment list) are what the queries run against before any stock site.
- Run queries 1-3 on a stock site; if 4 and 5 are what you end up using, the shot is no longer literal, and the generation prompt is the better fallback.
- Put whichever clip you choose on the contact sheet with its sentence; a stock clip can be off topic as easily as a generated one.

## Tips

- Hands-only queries (4) find usable footage for almost any 'doing' sentence without a face to match.
- Keep the query sets with the project. The next video on the same topic reuses half of them.

## Related

- generated-vs-real-broll-decision-rule
- cutaway-matching-sentence-to-visual-prompt
- b-roll-pack-generation-prompt
