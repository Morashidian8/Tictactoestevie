# '3 mistakes' in 40 seconds: the educational format that converts

Three mistakes the viewer is making right now, each with the fix shown in a shot, ranked so the last one is the one they did not know about. Prompt returns the script, text plan and shot list.

Category: formats · difficulty: beginner · time: 15 min · works with: claude-code, claude, chatgpt, any-llm · verified: False
Source: https://superduperai.co/library/three-mistakes-format/

## Prompt / recipe

```
Write a '3 mistakes' script about {topic} for {audience}. The format works because every viewer checks themselves against the list; educational videos convert because the fix is the product or the method.

Rules for the mistakes:
- Mistake 1 is the one everyone knows they make (recognition).
- Mistake 2 is the one they suspect (confirmation).
- Mistake 3 is the one they have never heard (the reason to save the video).
- Each mistake is a thing the viewer can check in under a minute. No vague ones ('not being consistent').

Structure (40 s, 9:16):
- 0-3 s HOOK: 'Three {topic} mistakes, and number three is the one nobody tells you.' or a sharper variant. Text on screen: '3 mistakes' with the topic word.
- 3-14 s MISTAKE 1: name it (3 s), show it (4 s), show the fix (4 s).
- 14-25 s MISTAKE 2: same shape.
- 25-37 s MISTAKE 3: same shape, slightly longer on the fix.
- 37-40 s CLOSE: 'Save this for the next time you {action}.' A save ask, not a download ask. The download ask goes in one video out of several, not here.

Word budget: 100-110 words at 165 wpm. On-screen text: a numbered title card per mistake (1/3, 2/3, 3/3) with the mistake in 4 words max, and the fix in 4 words max when it appears.

Return: a table (time, section, spoken line, on-screen text, what is in the shot), then the three mistakes as a one-line list for the caption.

Topic: {topic}
Audience: {audience}
What the fix involves: {the method or the product feature, if any}
```

## Example

```
Topic: product photos for an online shop. Audience: someone selling handmade things from home.

| Time | Section | Spoken line | On-screen text | Shot |
|---|---|---|---|---|
| 0-3 s | Hook | Three product-photo mistakes, and the third one is why your listing looks cheap. | 3 PHOTO MISTAKES | Face, phone in hand |
| 3-6 s | M1 name | One. Shooting under the kitchen light. | 1/3 OVERHEAD LIGHT | Ceiling lamp |
| 6-10 s | M1 show | Yellow cast, shadow under everything. | | Mug under the lamp |
| 10-14 s | M1 fix | Window, side on, lamp off. | FIX: WINDOW, SIDE ON | Same mug by the window |
| 14-17 s | M2 name | Two. Zooming in. | 2/3 DIGITAL ZOOM | Fingers pinching |
| 17-21 s | M2 show | The phone throws away pixels; the edge goes soft. | | Blurry edge close-up |
| 21-25 s | M2 fix | Step closer, crop later. | FIX: STEP CLOSER | Hand moving the phone |
| 25-28 s | M3 name | Three. The background. | 3/3 THE BACKGROUND | Cluttered counter |
| 28-32 s | M3 show | Your eye reads the mess before it reads the product. | | Same |
| 32-37 s | M3 fix | Cut it out and put it on white; the app does that in one tap, on the phone. | FIX: CUT OUT, WHITE | Thumb taps, background drops |
| 37-40 s | Close | Save this for your next listing. | SAVE FOR NEXT TIME | Face |

Caption list: overhead light, digital zoom, cluttered background.
```

## Tips

- The fix for mistake 3 is where the product lives, if there is one. One mention, shown not pitched.
- 'Save this' outperforms 'follow' on an educational video because it is the thing the viewer actually wants to do with it.
