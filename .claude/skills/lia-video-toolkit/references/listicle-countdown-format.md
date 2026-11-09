# Countdown listicle: 5 items in 45 seconds, best one last, numbers on screen

The ranked list format, with the rule that makes it hold: each item gets shorter as the count drops and number one gets the longest shot. The prompt returns script, text plan and the caption list.

Category: formats · difficulty: beginner · time: 15 min · works with: claude-code, claude, chatgpt, any-llm · verified: False
Source: https://superduperai.co/library/listicle-countdown-format/

## Prompt / recipe

```
Write a countdown listicle script: top {N} {things} for {audience}. The format works because the number on screen tells the viewer how much is left and the rank promises the best is still coming. Count DOWN from {N} to 1.

Structure ({N} = 5, 45 s, 9:16):
- 0-3 s HOOK: '{N} {things} ranked, and number one is not what you think.' or a variant with a sharper claim you can back up. On-screen: '{N}' large.
- 3-33 s ITEMS 5 to 2: 7 s each. Each item is: the number on screen for the whole item, one shot of the thing in use, one spoken line that says why it is on the list (max 14 words), and a 3-word on-screen label.
- 33-42 s ITEM 1: 9 s, two shots, two lines. The reason it is first must be a reason the viewer can check.
- 42-45 s CLOSE: 'What would you put at number one?' The comment is the CTA. No download ask in a listicle; if the product is on the list it is one item, shown like the others.

Word budget: 110-125 words at 165 wpm. On-screen: the countdown number (bottom corner, constant per item), the item label, nothing else.

Return: the ranked list with a one-line reason each (so I can reorder), then a table (time, rank, spoken line, on-screen label, shot).

Things: {things}
Audience: {audience}
Candidates: {your list, or leave blank}
```

## Example

```
Things: kitchen tools under twenty dollars. Audience: someone cooking at home three nights a week.

Ranked: 5 bench scraper (moves everything, cleans the board), 4 digital scale (recipes stop failing), 3 instant-read thermometer (no more cutting into chicken), 2 microplane (garlic, parmesan, zest in seconds), 1 a sharp 8-inch knife, honed weekly (every other tool is slower without it).

| Time | Rank | Spoken line | On-screen label | Shot |
|---|---|---|---|---|
| 0-3 s | | Five kitchen tools under twenty dollars, ranked. Number one is not a gadget. | 5 | Hand sweeps them across the counter |
| 3-10 s | 5 | Bench scraper. Moves the onion, cleans the board, costs less than a coffee. | BENCH SCRAPER | Scraping diced onion into a pan |
| 10-17 s | 4 | Digital scale. Recipes stop failing when a cup stops being a guess. | DIGITAL SCALE | Flour on the scale, 120 g |
| 17-24 s | 3 | Thermometer. Chicken out at sixty-five, never cut open to check. | THERMOMETER | Probe in a thigh, reading |
| 24-31 s | 2 | Microplane. Garlic, parmesan, lemon zest, all in ten seconds. | MICROPLANE | Zesting a lemon |
| 31-33 s | 2 | And it is the one guests ask about. | | Bowl of zest |
| 33-38 s | 1 | A sharp eight-inch knife. Not expensive, just sharp. | 8-INCH KNIFE | Slicing a tomato cleanly |
| 38-42 s | 1 | Hone it once a week and every other tool on this list gets faster. | HONE WEEKLY | Knife on a steel |
| 42-45 s | | What's your number one? | | Face |
```

## Tips

- The countdown number stays on screen for the whole item, not just at the cut. It is the progress bar.
- If number one is your product, the list becomes an ad and gets treated like one. Put the product at 3 and let the comments find it.

## Related

- three-mistakes-format
