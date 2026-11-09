# Comparison: two ways to do one thing, side by side, same task, same clock

The split-screen comparison that is fair enough to be believed: identical task, identical start, a visible timer, a verdict earned on screen. Prompt returns the script and the fairness checks.

Category: formats · difficulty: intermediate · time: 20 min · works with: claude-code, claude, chatgpt, any-llm · verified: False
Source: https://superduperai.co/library/side-by-side-comparison-format/

## Prompt / recipe

```
Write a side-by-side comparison script: {option A} vs {option B} for {task}. The format works when the viewer believes it was fair, so the fairness is part of the script. Use this format when one option replaces something slower or more expensive; use a generic name for the other option ('the usual way', 'a desktop editor'), never a competitor's brand.

Structure (40 s, 9:16 split top/bottom, or 16:9 split left/right):
- 0-3 s: the question, spoken and on screen: '{A} or {B} for {task}?' Both halves show the starting state, identical.
- 3-6 s: the rules, on screen as a 3-line list: same file / same start / timer on both. Spoken: 'Same photo, same start, clock running.'
- 6-30 s: the task, both halves running at once. A timer in each half. Spoken lines only when one side reaches a step: 'A is done cutting out. B is still selecting.' Max 6 lines, max 12 words each.
- 30-36 s: results side by side, timers frozen. Spoken: the two times and one difference you can see.
- 36-40 s: verdict in one sentence, with the case where the loser is still the right choice (one clause). No download ask; the result is the argument. Comment ask: 'what would you compare next?'

Word budget: 80-90 words at 165 wpm. On-screen: the question, the rules list, two timers, the two final times, the verdict in 5 words.

Return: the fairness checklist (what must be identical), then a table (time, left/top half, right/bottom half, spoken line, on-screen text).

Option A: {option A}
Option B: {option B}
Task: {task}
What I expect to find: {honest guess, including where B wins}
```

## Example

```
A: a background-removal photo app on a phone. B: the usual way, a desktop editor with a selection tool. Task: three product photos on white.

Fairness checklist: same three photos sent to both devices, both start from the file open, timers start on the first tap or click, no pre-made selections, both exported at the same size.

| Time | Top (phone app) | Bottom (desktop) | Spoken | On-screen |
|---|---|---|---|---|
| 0-3 s | Photo 1 open | Photo 1 open | Phone app or desktop editor for three listing photos? | PHONE vs DESKTOP |
| 3-6 s | Finger hovering | Cursor hovering | Same photos, same start, clocks running. | SAME FILES · SAME START · TIMER |
| 6-12 s | Tap, background drops | Selection tool tracing the handle | Phone's done with one. Desktop is still on the handle. | 0:06 / 0:06 |
| 12-20 s | Photo 2, 3 done | Still refining the edge of photo 1 | Two and three. Desktop, edge of number one. | 0:20 / 0:20 |
| 20-30 s | Export, done, timer stops | Photo 2 selection | Phone stops at thirty-one seconds. | 0:31 / 0:30 |
| 30-36 s | Three results | Three results, timer stopped later | Thirty-one seconds against four minutes ten. Look at the handle edge: the desktop one is cleaner. | 0:31 vs 4:10 |
| 36-40 s | | | Phone for a listing. Desktop when the edge is the product. What should I compare next? | PHONE FOR LISTINGS |
```

## Tips

- Name the case where the loser wins. A comparison with no concession reads as an ad and gets argued with instead of shared.
- Run the slower side for real and speed up the footage with a visible label. Cutting it short makes the result a claim instead of a measurement.

## Related

- before-after-reveal-format
