# Hook text on screen: a plan for the first three seconds, word by word

A prompt that plans what text appears in the first 3 seconds of a vertical video: the words, the moment each appears, the hold, what the picture does under it. Written so the hook works muted.

Category: captions · difficulty: beginner · time: 10 min · works with: claude-code, claude, chatgpt, any-llm · verified: False
Source: https://superduperai.co/library/hook-text-on-screen-plan-prompt/

## Prompt / recipe

```
Plan the on-screen text for the first 3 seconds of a vertical video about {topic}. The video autoplays muted; the text must carry the hook alone.

Output a table: Time in (s) | Text (exact words) | Hold (s) | Where in frame | What the picture does under it | Why the viewer stays.

Rules:
- Max 2 text events in 3 seconds. Max 5 words each.
- The first text lands at 0.0-0.3 s, not after a logo.
- Hold = words / 2.5 seconds, minimum 1.2 s (a parameter).
- The text is one of: a number the viewer can check, a contradiction, a question with a one-word answer, a 'before' label over a 'before' picture.
- Frame position: middle third, or upper third if the subject's face is in the middle; never the bottom 20 percent.
- The picture under the text moves: motion toward the camera, a hand entering, a reveal; never a static frame with text on it.
- The spoken hook, if any, must not be the same sentence as the text.

Then write 3 alternative text pairs for A/B, each with a different hook type.

Context:
{what the video shows in the first 3 seconds, and the hook line if spoken}
```

## Steps

- Describe the actual first 3 seconds of footage you have; the plan is for that picture, not an imagined one.
- Mock the two text events on a frame grab and look at it on a phone at arm's length before editing.
- Post the A/B pairs as separate videos a day apart; note which hook type held viewers past 3 seconds for this topic.

## Tips

- Five words at 2.5 words per second is 2 seconds. Two events fill 3 seconds exactly; a third is unreadable.
- The cold open rule from real footage applies: the picture under the hook is chosen by eye for fire, water, neon, motion toward the camera, a face with an expression.

## Related

- reading-speed-on-screen-text-parameters
- cold-open-then-hook-contact-sheet
