# Myth vs fact: three beliefs checked in 35 seconds, each with a demonstration

The format where a common belief is stated, then tested on camera, then labelled. Works because the viewer picks a side in the first second; the prompt insists on a visible test per myth.

Category: formats · difficulty: intermediate · time: 15 min · works with: claude-code, claude, chatgpt, any-llm · verified: False
Source: https://superduperai.co/library/myth-vs-fact-format/

## Prompt / recipe

```
Write a myth vs fact script about {topic}. The format works because the viewer guesses the answer before you give it and watches to see if they were right. Every myth must be checked by something visible in the shot, not by an assertion. If a myth cannot be demonstrated, replace it.

Structure (35 s, 9:16):
- 0-3 s HOOK: 'Three things everyone believes about {topic}. One of them is true.' On-screen: 'MYTH or FACT?'
- 3-13 s MYTH 1: state it as a quote people say (2 s, text on screen in quote marks), show the test (6 s), stamp the verdict (2 s, big text: MYTH or FACT).
- 13-23 s MYTH 2: same shape.
- 23-33 s MYTH 3: same shape. Order them so the verdicts are not all the same; the one that is true goes last.
- 33-35 s CLOSE: 'Which one did you get wrong?' Comment ask, no download ask.

Word budget: 85-95 words at 165 wpm. On-screen text: the belief in quote marks, then the verdict stamp. Nothing else, so the stamp has impact.

Return: the three beliefs with how each is tested on camera (I will reject any that are not tested), then a table (time, section, spoken line, on-screen text, shot).

Topic: {topic}
Beliefs I hear most: {list, or leave blank and propose}
```

## Example

```
Topic: learning a language as an adult.

Beliefs and tests:
1. 'You need an hour a day.' Test: show a phone timer at 10:00, a notebook page from day 1 and day 60. Verdict: MYTH.
2. 'Apps alone are enough.' Test: play a 5-second clip of a real conversation at speed, then the same sentence in the app at app speed. Verdict: MYTH.
3. 'Speaking badly early is better than waiting.' Test: a clip of a day-10 voice note, clumsy, next to a day-90 voice note. Verdict: FACT.

| Time | Section | Spoken line | On-screen text | Shot |
|---|---|---|---|---|
| 0-3 s | Hook | Three things everyone believes about learning a language. One is true. | MYTH or FACT? | Face |
| 3-5 s | M1 | 'You need an hour a day.' | "an hour a day" | Text over a desk |
| 5-11 s | M1 test | Ten minutes, every day. Day one, day sixty. The notebook does not lie. | | Timer, then the two pages |
| 11-13 s | M1 verdict | Myth. | MYTH | Stamp |
| 13-15 s | M2 | 'The app is enough.' | "the app is enough" | Phone |
| 15-21 s | M2 test | This is a waiter at speed. This is the app. Hear the gap. | | Two clips back to back |
| 21-23 s | M2 verdict | Myth. | MYTH | Stamp |
| 23-25 s | M3 | 'Speak badly early.' | "speak badly early" | Face |
| 25-31 s | M3 test | Day ten. Painful. Day ninety. Same sentence. | DAY 10 / DAY 90 | Two voice notes with waveforms |
| 31-33 s | M3 verdict | Fact. | FACT | Stamp |
| 33-35 s | Close | Which one did you get wrong? | | Face |
```

## Tips

- A myth with no test is an opinion video wearing a costume. Cut it or find the test.
- Put the true one last; a viewer who was right about two myths stays to be wrong about the third.
