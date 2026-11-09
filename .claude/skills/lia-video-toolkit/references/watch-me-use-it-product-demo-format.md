# 'Watch me use it': a 30-second product demo with no pitch and one real task

The demo that converts because it is a task, not a feature tour: one thing the viewer wants done, done on camera, in real time where possible. The prompt forbids adjectives and plans the text.

Category: formats · difficulty: beginner · time: 15 min · works with: claude-code, claude, chatgpt, any-llm · verified: False
Source: https://superduperai.co/library/watch-me-use-it-product-demo-format/

## Prompt / recipe

```
Write a 'watch me use it' demo script for {product} doing {one task the viewer wants done}. The format works because the viewer judges the product by watching it do a thing they need, so the script contains no adjectives about the product, only what happens on screen.

Rules:
- One task, start to finish. Not three features.
- Real time where it is under 15 s; a labelled speed-up ('4x') where it is longer. Never cut out the waiting silently.
- Every spoken line describes an action or a result. Delete any line with 'easy', 'powerful', 'seamless', 'amazing'.

Structure (30 s, 9:16, phone or screen recording with hands or a cursor visible):
- 0-3 s: the task stated as the viewer would say it ('I need this photo on a white background by tonight'). On-screen: the task in 5 words.
- 3-8 s: the starting state, held. What is wrong with it, one line.
- 8-24 s: the task done. 3-4 actions, one spoken line each (max 10 words), on-screen label per action with the tap or key named.
- 24-28 s: the result, held, full frame. One line on what it is now good for.
- 28-30 s: one line. This is the ONE video in the series that carries the download ask, so say the name once and point to the link in bio. In the other videos of the series, leave this line out.

Word budget: 60-70 words at 165 wpm. On-screen text: the task, one label per action, the result label. Nothing animated.

Return: a table (time, what is on screen, spoken line, on-screen label), a list of the actual taps/clicks in order so I can rehearse it, and the caption (one line, the task, no hashtag spam).

Product: {product}
Task: {task}
Actual steps in the product: {the clicks}
```

## Example

```
Product: a notes app for students. Task: turn a photo of a whiteboard into typed, searchable notes.

| Time | On screen | Spoken line | Label |
|---|---|---|---|
| 0-3 s | Phone pointed at a whiteboard full of equations | Lecture's over and this is all I've got. | WHITEBOARD TO NOTES |
| 3-8 s | The photo in the camera roll, glare across half of it | A photo. Half of it is glare and none of it is searchable. | |
| 8-12 s | Share sheet, tap the app | Share to the app. | TAP: SHARE |
| 12-17 s | Progress, then text appears in a note | It reads the board, glare and all. | 1x, REAL TIME |
| 17-21 s | Tap on an equation, it becomes editable | Tap any line to fix it. | TAP: EDIT |
| 21-24 s | Search bar, type 'eigen', the note appears | Searchable from now on. | SEARCH: eigen |
| 24-28 s | The typed note full screen, the photo as a thumbnail at the top | That's the whole lecture, typed, with the photo kept. | |
| 28-30 s | App icon in the corner | It's called {product}, link in bio. | |

Taps: camera roll, share, app, wait, tap line, edit, back, search 'eigen'.
Caption: whiteboard photo to typed notes, from the share sheet.
```

## Tips

- In Claude Code, `/video-promo` reads the PRD and writes the hook/problem/demo/CTA script; use this prompt when you want a single task instead of a tour.
- Shoot the task three times and use the take where something small went wrong and you fixed it on camera. That is the moment that reads as real.
- The creator-growth rule: the download ask lives in one video in several, not in every one. Pick which one before you shoot the series.

## Related

- screen-recording-walkthrough-format
- before-after-reveal-format

## skill

video-promo
