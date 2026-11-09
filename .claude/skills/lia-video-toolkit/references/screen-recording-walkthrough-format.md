# Screen-recording walkthrough: 45 seconds, one outcome, zoom on every click

The faceless screen walkthrough that stays watchable because every click is zoomed and labelled and the outcome is shown first. The prompt returns the click list, the zoom plan and the voice-over.

Category: formats · difficulty: beginner · time: 20 min · works with: claude-code, claude, chatgpt, any-llm · verified: False
Source: https://superduperai.co/library/screen-recording-walkthrough-format/

## Prompt / recipe

```
Write a screen-recording walkthrough script for {outcome} in {app or workflow}. The format works when the viewer can follow every click at phone size, so each click gets a zoom and a label and the dead time between clicks is cut.

Structure (45 s, 9:16 crop of a screen recording, or 16:9 for YouTube):
- 0-3 s OUTCOME: the finished state on screen. Spoken: 'Here is how to get {outcome} in {N} clicks.' On-screen: '{N} clicks'.
- 3-6 s START: the starting screen, full. One line on where we are.
- 6-38 s CLICKS: {N} clicks (4 to 7). For each: zoom to 200% on the element 0.5 s before the click, hold 1 s after, cut the waiting. Spoken line per click, max 8 words, imperative. On-screen: the click number and the element name as typed in the app ('Export', 'Cut out'). If a value is typed, show it as text on screen.
- 38-43 s OUTCOME AGAIN: the result, with one line on what to do with it.
- 43-45 s CLOSE: 'Saved? Try it on your next one.' No download ask in a walkthrough; the app is on screen the whole time.

Word budget: 75-85 words at 165 wpm; silence between clicks is fine, music under at low level.

Return: the click list (element, what happens) so I can rehearse, then a table (time, screen state, zoom target, spoken line, on-screen label), then a one-line title for YouTube under 60 characters.

Outcome: {outcome}
App or workflow: {app or workflow}
Clicks as I do them: {rough list}
```

## Example

```
Outcome: a weekly meal plan exported as a shopping list. App: a recipe notes app.

Clicks: 1 open 'This week', 2 tap '+' and pick 5 recipes, 3 tap 'Shopping list', 4 tap 'Merge duplicates', 5 tap 'Share' to the reminders app.

| Time | Screen | Zoom | Spoken line | Label |
|---|---|---|---|---|
| 0-3 s | Shopping list in reminders, 23 items | none | Five recipes to one shopping list in five taps. | 5 TAPS |
| 3-6 s | App home | none | Start on the home screen. | |
| 6-12 s | 'This week' tab | the tab | Open This week. | 1 · THIS WEEK |
| 12-20 s | Recipe picker, five selected | the '+' then the picker | Tap plus, pick your five. | 2 · + ADD RECIPES |
| 20-26 s | Shopping list, 31 items | the button | Tap Shopping list. | 3 · SHOPPING LIST |
| 26-32 s | Same list, 23 items | the toggle | Merge duplicates. Three onions become one line. | 4 · MERGE DUPLICATES |
| 32-38 s | Share sheet | the share icon | Share to reminders. | 5 · SHARE |
| 38-43 s | Reminders app, 23 items, checkboxes | none | That's the shop. Tick them off in the aisle. | |
| 43-45 s | Same | none | Saved? Try it on Sunday. | |

YouTube title: 5 recipes to one shopping list in 5 taps
```

## Tips

- Record at the device's native resolution and crop to 9:16 in the edit; a 16:9 recording squeezed into vertical is unreadable on a phone.
- Cut every pause longer than 0.5 s between clicks. Loading spinners are where viewers leave.
- In Claude Code, `/video-promo` assumes screen recording as the primary footage and writes the shot list; use this prompt for the per-click zoom plan it does not produce.

## Related

- watch-me-use-it-product-demo-format
- tutorial-in-30-seconds-format

## skill

video-promo
