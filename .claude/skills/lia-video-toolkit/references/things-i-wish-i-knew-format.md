# 'Things I wish I knew': 5 lessons in 50 seconds, each with what it cost me

The advice format that gets saved because every lesson is attached to the mistake that taught it. The prompt orders the lessons by cost and plans one number on screen per lesson.

Category: formats · difficulty: beginner · time: 15 min · works with: claude-code, claude, chatgpt, any-llm · verified: False
Source: https://superduperai.co/library/things-i-wish-i-knew-format/

## Prompt / recipe

```
Write a '{N} things I wish I knew before {starting X}' script. The format works because each lesson carries the price I paid for not knowing it, so the viewer saves the video to avoid the bill. A lesson with no cost attached is a platitude; cut it.

Rules for the lessons:
- Each one is a single sentence of advice plus the thing that happened to me because I did not know it.
- Each has a cost the viewer can picture: hours, money, a ruined batch, a lost file.
- Order by cost, cheapest first, most expensive last.

Structure ({N} = 5, 50 s, 9:16, face to camera with inserts where I have the evidence):
- 0-3 s HOOK: '{N} things I wish I knew before {starting X}. Number {N} cost me {the biggest cost}.' On-screen: '{N} things'.
- 3-45 s LESSONS: about 8 s each. Pattern per lesson: the advice (3 s, on screen as a 5-word line with its number), the story (5 s, one sentence, past tense, an insert if I have a photo or a screen).
- 45-48 s: 'The one I'd tell you first is number {pick}.' One sentence on why.
- 48-50 s CLOSE: 'Save this for someone starting out.' No download ask; if a product solved one lesson it is named in that lesson only.

Word budget: 125-135 words at 165 wpm. On-screen: the lesson number and 5-word line per lesson, the cost as a number where there is one.

Return: the five lessons with their costs as a list (so I can reorder), then a table (time, lesson, spoken line, on-screen, insert).

Starting X: {what I started}
Lessons, rough: {list with what each cost me}
```

## Example

```
Starting X: selling handmade ceramics online.

Lessons by cost: 1 photograph every piece the day it comes out of the kiln (cost: 2 evenings re-shooting), 2 write the dimensions on the listing (cost: 4 returns), 3 pack as if the courier will drop it from the van (cost: 3 broken mugs, about 90 dollars), 4 raise prices before you are busy (cost: a month of underpaid work), 5 keep the originals of every photo (cost: a lost phone, 60 listings re-shot).

| Time | Lesson | Spoken line | On-screen | Insert |
|---|---|---|---|---|
| 0-3 s | | Five things I wish I knew before selling ceramics online. Number five cost me sixty listings. | 5 THINGS | |
| 3-11 s | 1 | Shoot every piece the day it comes out. I waited, the light changed, I re-shot two evenings. | 1 · SHOOT ON KILN DAY | Two photos, different light |
| 11-19 s | 2 | Put the dimensions on the listing. Four mugs came back as 'smaller than expected'. | 2 · DIMENSIONS ON LISTING · 4 RETURNS | Return label |
| 19-27 s | 3 | Pack for a drop from the van. Three broken, ninety dollars, one week. | 3 · PACK FOR THE DROP · $90 | Broken mug |
| 27-35 s | 4 | Raise prices before you're busy. I spent a month fully booked and underpaid. | 4 · RAISE PRICES EARLY | Calendar full |
| 35-45 s | 5 | Keep the original photos somewhere that is not your phone. The phone died and I re-shot sixty listings in a weekend; the background app made it bearable, but it was still a weekend. | 5 · BACK UP ORIGINALS · 60 LISTINGS | Phone with a cracked screen |
| 45-48 s | | The one I'd tell you first is three. Breakage is the only one you can't fix after. | | |
| 48-50 s | | Save this for someone starting out. | SAVE | |
```

## Tips

- The cost on screen does most of the work. '$90' under a broken mug is remembered; 'pack carefully' is not.
- Record the stories before the advice lines. The advice is easy to re-say; the story has to sound like the first time.

## Related

- three-mistakes-format
- listicle-countdown-format
