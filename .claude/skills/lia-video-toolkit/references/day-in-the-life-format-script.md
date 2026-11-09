# Day in the life: a 45-second cut from real footage with one through-line

A recipe for the vlog-style day that keeps working because the viewer waits for one promised payoff; the prompt turns your clip list into a timed script with text overlays.

Category: formats · difficulty: beginner · time: 20 min · works with: claude-code, claude, chatgpt, any-llm, life2film · verified: False
Source: https://superduperai.co/library/day-in-the-life-format-script/

## Prompt / recipe

```
You are a short-form editor. Write a day-in-the-life script for {topic} from the clip list below. The format works because the viewer is promised one payoff in the first line and stays to see it; a day without a promise is a slideshow.

Structure (45 s total, 9:16):
- 0-3 s HOOK: one line that names the day and the payoff ('the day I {goal}, and whether it worked'). Face or hands on screen, not a logo.
- 3-10 s SETUP: where we are, what is at stake, in 2 short lines.
- 10-35 s THE DAY: 5-7 clips, 3-5 s each, in shooting order. One spoken line per clip, max 10 words. Every clip must show a different place or action; skip two clips of the same table.
- 35-42 s PAYOFF: the result the hook promised, shown before it is said.
- 42-45 s CLOSE: one line that invites a comment ('would you do this?'). No download ask in this video; the CTA for this format is the comment and the link in bio.

Word budget: 110-120 words of voice-over at 165 wpm. On-screen text: the hook line as a 2-line caption at 0-3 s, a time stamp top-left on each clip (07:40, 09:15), the payoff as a single word or number at 35 s. Nothing else.

Return a table: time range, clip filename, spoken line, on-screen text, sound (ambient / music under / voice only). Then the voice-over as one paragraph for recording.

Clips (filename, what is in it, duration):
{clip list}
```

## Steps

- List the clips with what each one shows; an agent cannot see a filename.
- Pick the payoff before you prompt. 'I tried cooking every meal at home for a day: total cost' is a payoff; 'my day' is not.
- Record the voice-over as one take, then cut the picture to the voice. Fix the words, not the shots.

## Example

```
Topic: a weeknight cooking channel, the day of cooking all three meals from one chicken.

| Time | Clip | Spoken line | On-screen text | Sound |
|---|---|---|---|---|
| 0-3 s | 01-fridge.mp4 | One chicken, three meals, one day. Let's see what it costs. | ONE CHICKEN. THREE MEALS. | voice |
| 3-10 s | 02-receipt.mp4 | Whole bird, seven dollars forty. Everything else is already in the fridge. | $7.40 | voice |
| 10-14 s | 03-breaking-down.mp4 | Breasts for lunch, thighs for dinner, carcass for stock. | 07:40 | ambient |
| 14-18 s | 04-stock-pot.mp4 | Stock goes on first; it runs while I work. | 08:05 | ambient |
| 18-22 s | 05-lunch.mp4 | Lunch: breast, rice, the lemon from yesterday. | 12:30 | music under |
| 22-26 s | 06-thighs-pan.mp4 | Thighs skin down, do not touch them for six minutes. | 18:50 | ambient |
| 26-30 s | 07-dinner-plate.mp4 | Dinner. The kids did not ask what it was, which is a win. | 19:20 | music under |
| 30-35 s | 08-stock-jars.mp4 | Stock into jars. Tomorrow's soup is already done. | 21:00 | ambient |
| 35-42 s | 09-three-plates.mp4 | Three meals, four people, and the stock for tomorrow. Under two dollars a plate. | $1.85 / PLATE | voice |
| 42-45 s | 10-face.mp4 | Would you eat chicken three times in a day? | (none) | voice |

Voice-over (118 words): One chicken, three meals, one day...
```

## Tips

- Life2Film scores every frame and finds the scene changes on the device, so a 40-minute day comes back as the 12 clips worth listing before you prompt.
- In Claude Code, `/video-edit` reads the day's speech as text and writes the cut as a script; this prompt is the planning half of that.
- The time stamps on screen do the pacing work; a viewer who sees 07:40 then 19:20 feels the day pass without a single transition effect.

## skill

video-edit
