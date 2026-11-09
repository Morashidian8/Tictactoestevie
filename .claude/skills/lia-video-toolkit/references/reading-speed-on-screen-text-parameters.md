# Reading speed for on-screen text and speech: the parameters to check against

How long a text overlay must stay up and how many words a voice can carry per second, given as parameters you measure on yourself, with the formula and the two failure modes: unreadable, and slow.

Category: captions · difficulty: beginner · time: 5 min · works with: manual, capcut, claude, any-llm · verified: False
Source: https://superduperai.co/library/reading-speed-on-screen-text-parameters/

## Prompt / recipe

```
READING SPEED, the parameters (not studies: measure them on yourself and your viewers)

On-screen text: 2-3 words per second of hold time, after a 0.5 s entrance. So a 6-word overlay stays at least 2.5-3.5 s. Phone, muted, one hand: use 2 words per second. Desktop, sound on, familiar words: 3.
Speech: 150-170 words per minute for narration; 165 wpm is a usable default. A 55-word line is about 20 s; 75-100 words fit 30-40 s.
Subtitles: 2 lines of about 32 characters, held 1-6 s; under 1 s is a flash the eye cannot land on, over 6 s means the cue should be split.

The check, for every overlay:
1. Count the words. Divide by 2.5. That is the minimum seconds on screen.
2. If the voice says something else while the text is up, the text gets the shorter end: max 5 words.
3. If the hold is longer than the formula by 2x, the text is a title card and needs a picture change under it.
4. Read the whole video with the sound off, at arm's length, on a phone. Any overlay you could not finish reading gets fewer words, not a longer hold.

When asking an agent for overlays, give it these numbers: 'Max {5} words per overlay, each on screen for at least words/2.5 seconds, total overlay time under {40} percent of the video.'
```

## Steps

- Measure your own narration speed once: read 100 words aloud, time it, write the wpm in your project notes. Scripts are budgeted from that number from now on.
- Put the words-per-second rule into every prompt that produces overlays, so the agent counts instead of guessing.
- Test on the slowest reader you know, on a phone. Their number is the parameter.

## Tips

- An overlay that repeats the spoken sentence is read twice at two speeds and feels slow. Put the number or the name in text, the sentence in voice.
- Platform UI covers the bottom of a vertical frame; text in that zone has a hold time of zero because it is never seen.

## Related

- burned-subtitles-9-16-parameters
- rewrite-script-to-55-words-20-seconds
