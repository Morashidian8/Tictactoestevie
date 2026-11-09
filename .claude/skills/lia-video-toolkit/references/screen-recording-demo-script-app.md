# Screen-recording demo script for an app: what to click, what to say, when

A prompt that writes a demo script where every spoken line is paired with one on-screen action, so the recording is done in one pass and the narration recorded over it afterwards.

Category: scripts · difficulty: beginner · time: 15 min · works with: claude-code, claude, chatgpt, any-llm · verified: False
Source: https://superduperai.co/library/screen-recording-demo-script-app/

## Prompt / recipe

```
Write a screen-recording demo script for {app} that shows {the one job it does} in {60-90} seconds. The recording is the picture; the narration is recorded separately over it.

Output a table: Time | Action on screen (what I click, type or scroll) | Narration (what is said during this action) | Hold (seconds the result stays on screen).

Rules:
- Start on the result, not the login screen: the first 5 s show the finished thing, then cut to the start.
- One action per row. 'Open settings and change the language' is two rows.
- Narration describes what the viewer sees and why it matters, never 'now I click'. Max 18 words per row.
- Every row where a result appears gets a Hold of at least 2 s. No row shorter than 2 s.
- No feature that is not needed for {the one job}. Mention the others in one closing line at most.
- End on the result again, with the URL spoken once.

Context about the app:
{paste README or feature list}
```

## Steps

- Prepare the app state before recording: sample data that looks real, notifications off, a clean desktop, the window at the final export size.
- Record the actions following the table without talking. Then read the narration over the recording and stretch holds in the edit where the voice runs long.
- Cursor: slow, straight lines, a pause before each click. A fast cursor is the one thing viewers notice and remember.

## Tips

- Record at the output size or an integer multiple of it; non-integer scaling blurs UI text.
- For an iOS app, record on the Simulator or mirror the device; for web, a clean browser profile with no extensions.

## Related

- screen-recording-broll-rules-app-demos
- promo-script-30-45-seconds-template
