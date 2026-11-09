# Generate 20 hooks for a topic and rank them by a stated rubric

One prompt that produces 20 openers across the 8 archetypes, scores each on four named criteria, and returns the top 5 with the score shown, so the ranking can be argued with instead of trusted.

Category: hooks · difficulty: beginner · time: 10 min · works with: claude-code, claude, chatgpt, any-llm · verified: False
Source: https://superduperai.co/library/generate-20-hooks-ranked-by-rubric/

## Prompt / recipe

```
Generate 20 hooks for a short vertical video about {topic}, aimed at {audience}, where the video's goal is {reach / convert / trust}.

Spread: at least 2 of each archetype: question, bold claim, pain point, curiosity gap, 'stop doing X', number, contrarian, result-first. Label each with its archetype.

Rules for every hook: max 12 words; spoken and on-screen are the same words; present tense; no 'ever wondered', 'what if I told you', 'you won't believe', 'secret', 'hack', 'ultimate'; a number only if the reader could measure it.

Score each hook 0-3 on four criteria and show the four digits:
- SPECIFIC: names a place, object, number or moment (3) vs could be about any topic (0).
- CHECKABLE: the video can prove or deliver it by 20 s (3) vs it is an opinion or a tease (0).
- SOUND-OFF: works as text on a still frame (3) vs needs the voice (0).
- MATCH TO GOAL: for reach, how many people have a guess or an opinion; for convert, how close it is to the moment of need; for trust, how much it admits (3 to 0).

Return: a table of 20 rows (number, archetype, hook, four digits, total out of 12), then the top 5 by total with one line each on what frame 1 shows, then the 3 lowest with one line on why they failed. Do not round the scores up to make a nice top 5; ties are fine.
```

## Steps

- Fill topic, audience and the goal. The goal changes the fourth score; 'reach' and 'convert' rank differently.
- Shoot the top 3, not the top 1. The rubric predicts the order wrong often enough that three is the cheapest insurance.
- Put each one on its own campaign link and judge after a week on installs (see the A/B entry).

## Example

```
Topic: a weeknight cooking channel, one chicken into three dinners. Audience: parents cooking on weekdays. Goal: reach.

| # | Archetype | Hook | S C O M | Total |
|---|---|---|---|---|
| 1 | result-first | Three dinners. One chicken. Seven dollars forty. | 3 3 3 2 | 11 |
| 2 | number | One chicken, three meals, one day. Let's see what it costs. | 3 3 2 3 | 11 |
| 3 | pain-point | It's six pm, the chicken is frozen, and the kids are asking. | 3 2 2 3 | 10 |
| 4 | stop-doing | Stop buying chicken breasts. Buy the bird. | 2 3 3 2 | 10 |
| 5 | contrarian | Meal prep on Sunday is why you order takeaway on Wednesday. | 2 2 2 3 | 9 |
| 6 | question | Why is the whole chicken cheaper than two breasts? | 2 3 2 2 | 9 |
| 7 | curiosity-gap | The third dinner is the one nobody expects. It's at the end. | 2 3 1 2 | 8 |
| 8 | bold-claim | Under two dollars a plate, four people, no coupons. | 3 3 3 2 | 11 |
| ... | | (12 more rows) | | |

Top 5: 1, 2, 8, 3, 4. Frame 1 for #1: three plates in a row, receipt propped behind them. Frame 1 for #2: the whole bird on the board, knife beside it.

Lowest 3: 'Cooking doesn't have to be hard' (0 0 1 0, portable to any topic); 'You won't believe this chicken trick' (0 0 1 1, banned phrase and nothing checkable); 'Let me show you my process' (0 1 0 0, no promise).
```

## Tips

- Showing the four digits is the point. A ranked list with hidden scores cannot be corrected; a list with scores lets you say 'that one is not a 3 on checkable' and move on.
- In Claude Code, ask for the table as a CSV file so the three you shoot can be matched to their campaign links later.

## Related

- hook-ab-test-campaign-links
- hook-rewrite-five-stronger-versions
