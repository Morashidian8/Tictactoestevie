# 'I tried it for 7 days': a diary cut with one metric logged every day

The experiment-diary format that stays honest because one number is measured daily and shown on screen; the prompt plans the daily clip, the tally and a verdict that includes what did not work.

Category: formats · difficulty: intermediate · time: 7 days · works with: claude-code, claude, chatgpt, any-llm, life2film · verified: False
Source: https://superduperai.co/library/i-tried-it-for-seven-days-format/

## Prompt / recipe

```
Write a '{N} days of {habit or tool}' diary script. The format works because the viewer is promised a verdict and gets a daily number along the way; a diary with no number is a vlog.

Before writing, choose ONE metric I can measure every day in under a minute (minutes, count, grams, a score out of 10). Every daily clip shows the metric on screen.

Structure (60 s, 9:16, cut from clips I film each day):
- 0-4 s HOOK: 'I did {habit} every day for {N} days. Day {N} surprised me.' On-screen: 'DAY 1 of {N}' and the metric at zero or baseline.
- 4-10 s WHY: the reason in two lines, present tense, and the rule I set myself.
- 10-48 s DAYS: one clip per day, 5-6 s each, shot in a different place or light where possible. Each has: a day stamp top-left, the metric for that day under it, and one spoken line (max 12 words) that says one thing that happened, not how I feel. Days 3 and 5 should contain a dip or a problem; a straight line is not believed.
- 48-56 s VERDICT: the metric on day 1 next to day {N}, on screen. Spoken: what changed, what did not, in two sentences.
- 56-60 s CLOSE: 'Would you try it for a week?' If a product was the tool, it was in every clip; no download ask, the comments will ask.

Word budget: 140-150 words at 165 wpm. On-screen: day stamp and metric on every clip, the two-number comparison at the verdict, nothing else.

Return: the metric and how it is measured (one line), then a table (day, time range, where I film, spoken line, on-screen), then the verdict lines.

Habit or tool: {habit or tool}
N: {7}
What I expect: {honest guess}
```

## Example

```
Habit: 10 minutes of a language app every morning before the phone opens anything else. N: 7. Metric: words I can recall on a 20-word evening test.

Metric: a 20-word self-test each evening, score out of 20, written on a sticky note held to camera.

| Day | Time | Where | Spoken line | On-screen |
|---|---|---|---|---|
| 1 | 10-16 s | Kitchen, 7 a.m. | Day one. Ten minutes, then coffee. Evening test: six. | DAY 1 · 6/20 |
| 2 | 16-22 s | Bus | Day two, on the bus. Eight. | DAY 2 · 8/20 |
| 3 | 22-27 s | Bed, lights off | Day three, I skipped the morning and did it at midnight. Five. | DAY 3 · 5/20 |
| 4 | 27-33 s | Park bench | Back to mornings. Nine. | DAY 4 · 9/20 |
| 5 | 33-38 s | Office desk | Day five, I'm bored of the same unit. Nine again. | DAY 5 · 9/20 |
| 6 | 38-43 s | Kitchen | Switched to a new unit, it hurt. Eleven. | DAY 6 · 11/20 |
| 7 | 43-48 s | Café | Day seven. Thirteen out of twenty. | DAY 7 · 13/20 |

Verdict: 'Six to thirteen in a week. The day I did it at midnight was the worst day, and the day I changed units was the best, so the time of day mattered more than the app did. Would you try it for a week?' On-screen: 6/20 → 13/20.
```

## Tips

- Film every day even on the day you fail. The failed day is the one that makes the verdict believable.
- Life2Film can pull the best 5 seconds from each day's clip by frame score, which is the whole edit for this format; you only write the lines.
- Keep N at 7. A 30-day version is a series of four 7-day videos, each with its own verdict.

## Related

- day-in-the-life-format-script
