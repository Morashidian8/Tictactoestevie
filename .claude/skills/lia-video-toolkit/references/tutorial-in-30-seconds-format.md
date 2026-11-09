# Tutorial in 30 seconds: result first, then the steps at reading speed

The compressed how-to that gets saved: the finished thing in frame 1, then 3-5 numbered steps each shown and captioned. The prompt budgets the words so the steps fit at 165 wpm.

Category: formats · difficulty: beginner · time: 10 min · works with: claude-code, claude, chatgpt, any-llm · verified: False
Source: https://superduperai.co/library/tutorial-in-30-seconds-format/

## Prompt / recipe

```
Write a 30-second tutorial script for: how to {task} using {method or tool}. The format works because the viewer sees the result before deciding to invest 30 seconds, and the numbered steps give them a reason to save it.

Structure (30 s, 9:16):
- 0-3 s RESULT: the finished thing, full frame. Spoken: 'Here is how to {task} in {N} steps.' On-screen: the result name and '{N} steps'.
- 3-25 s STEPS: {N} steps (3 to 5), equal time each. Each step is: one imperative spoken line (max 10 words), one shot that shows the action, one on-screen caption with the step number and a 3-word label. If a step needs a value (a setting, a time, a quantity) the value goes on screen, not only in the voice.
- 25-28 s RESULT AGAIN: the same result, 3 s, spoken: one line on what it is good for now.
- 28-30 s CLOSE: 'Save it for when you need it.' No download ask here; a tutorial that ends in a pitch gets scrolled. The product, if there is one, is visible in the steps.

Word budget: 70-80 words at 165 wpm. Mark anything spoken over 80 words as too long and cut a step instead of speeding up.

Return: the step list first (so I can check it is right), then a table (time, step, spoken line, on-screen caption, shot). Then a one-line caption for the post with the steps as a comma list.

Task: {task}
Method or tool: {method or tool}
Steps as I do them (I will correct you): {rough steps}
```

## Example

```
Task: make a cold brew concentrate. Method: a jar and a sieve.

Steps: 1 grind coarse, 2 one to four ratio, 3 twelve hours in the fridge, 4 strain twice.

| Time | Step | Spoken line | On-screen caption | Shot |
|---|---|---|---|---|
| 0-3 s | Result | Cold brew concentrate in four steps, no machine. | COLD BREW · 4 STEPS | Glass of cold brew poured over ice |
| 3-8 s | 1 | Grind coarse, like sea salt. | 1 · GRIND COARSE | Grounds in the palm next to salt |
| 8-14 s | 2 | One part coffee, four parts cold water, into a jar. | 2 · 1 : 4 BY WEIGHT | Scale: 100 g then 400 g |
| 14-19 s | 3 | Lid on, fridge, twelve hours. | 3 · 12 H IN THE FRIDGE | Jar into the fridge, clock overlay |
| 19-25 s | 4 | Strain through a sieve, then through a paper filter. | 4 · STRAIN TWICE | Sieve, then filter |
| 25-28 s | Result | Keeps a week. Dilute one to one over ice. | 1 : 1 OVER ICE | The glass again |
| 28-30 s | Close | Save it for Sunday. | | Hand sets the glass down |

Caption: grind coarse, 1:4, 12 h, strain twice.
```

## Tips

- Any number the viewer needs to remember goes on screen as digits. Spoken numbers do not survive sound-off viewing.
- Five steps is the ceiling at 30 s. A sixth step means a second video, and a second video is a series.

## Related

- three-mistakes-format
