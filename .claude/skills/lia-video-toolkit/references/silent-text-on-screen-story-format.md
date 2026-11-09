# Silent text-on-screen story: 25 seconds, one line per shot, paced for reading

The no-voice format that works with sound off because the text is the narration; the prompt paces each line to its shot at 2 words a second and puts the turn on the second-last card.

Category: formats · difficulty: beginner · time: 15 min · works with: claude-code, claude, chatgpt, any-llm · verified: False
Source: https://superduperai.co/library/silent-text-on-screen-story-format/

## Prompt / recipe

```
Write a silent text-on-screen story about {topic}. The format works because most feeds autoplay muted; the text is the whole story, so every line is written to be read, not heard. Pacing rule: a viewer reads about 2 words per second on a phone, so a line of 8 words needs a 4-second shot. Lines are max 9 words.

Structure (25 s, 9:16, 7-8 shots, music or ambient under, no voice):
- Card 1 (0-3 s): the situation in one line, present tense, second person or first ('day 1 of learning to draw at 34'). The shot is the subject already in action.
- Cards 2-5 (3-17 s): one line each, each a step or a day. The shot shows the thing the line names. Lines get slightly shorter as they go.
- Card 6 (17-21 s): the turn: the result, the surprise, or the failure. 4-6 words.
- Card 7 (21-25 s): the landing: one line that gives the viewer something to do or think. No download ask; if an app is in the shots it is in the shots.

Word budget: 45-55 words on screen total. Each card's duration = word count / 2, rounded up, minimum 3 s.

Return: a table (card, duration, text line, what the shot shows, text position: upper third / centre / lower third), then a note on the font (one sans-serif, white with a soft shadow, 48-60 px at 1080 wide) and the safe zones to avoid (the bottom 20 percent and the right edge).

Topic: {topic}
The turn: {what happens on card 6}
```

## Example

```
Topic: a 30-day drawing habit. Turn: day 30 looks worse than day 12, and that is fine.

| Card | Duration | Text | Shot | Position |
|---|---|---|---|---|
| 1 | 4 s | day 1 of learning to draw at 34 | A hand drawing a crooked cup on a kitchen table | upper third |
| 2 | 3 s | ten minutes before work. every day. | Alarm on a phone, 06:50, the sketchbook beside it | centre |
| 3 | 4 s | day 6. the cup still looks like a bucket. | A page of cups, all wrong | lower third |
| 4 | 3 s | day 12. one of them looks like a cup. | A single decent cup, finger pointing | centre |
| 5 | 3 s | day 20. tried a face. regret. | A bad face, page half-covered by the hand | upper third |
| 6 | 4 s | day 30 is worse than day 12 | Two pages side by side, day 12 and day 30 | centre |
| 7 | 4 s | because day 30 is a face, not a cup. | Hand closes the book, writes '31' on the next page | lower third |

Font: one sans-serif, white, soft shadow, 56 px at 1080 wide. Keep text out of the bottom 20 percent (captions and buttons) and 10 percent off the right edge (icons).
```

## Tips

- Read every card aloud at a normal pace with a timer. If the card ends before you finish, the shot is too short.
- Lowercase reads as diary; uppercase reads as a headline. Pick one for the whole video.
- Add the platform's own captions anyway: the text is the story, but a subtitle track is what the accessibility settings read.

## Related

- pov-format-script
