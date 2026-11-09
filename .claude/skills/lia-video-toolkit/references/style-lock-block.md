# Style lock: one paragraph that makes every clip look like the same film

A reusable style paragraph (stock, palette, grain, light rules) appended to every generation prompt so a series cuts together instead of looking like ten different ads.

Category: generation · difficulty: beginner · time: 10 min · works with: veo, sora, kling, runway, image-gen · verified: False
Source: https://superduperai.co/library/style-lock-block/

## Prompt / recipe

```
STYLE LOCK (append to every prompt in the series):
Shot on {film stock or camera feel: Kodak 5219 / 16mm / Alexa clean digital / VHS}. {Palette: two dominant colours + one accent, e.g. 'teal shadows, amber highlights, red accent'}. {Grain: none / light / heavy}. {Contrast: soft and lifted blacks / punchy}. Lighting always {rule: motivated by a visible source / single key from camera left / flat overcast}. {Lens feel: 35mm, mild distortion / 85mm compression}. {Aspect ratio}. No on-screen text, no logos, no lens flares unless stated.
```

## Steps

- Write the style lock once, from a reference film or a still you like. Name real things (a stock, a focal length) rather than adjectives.
- Paste it at the end of every prompt, after the shot description.
- When a clip comes back off-style, do not add adjectives to the lock: remove the words in the shot prompt that conflict with it.

## Example

```
Shot on 16mm, Kodak 250D feel. Teal shadows, amber highlights, red accent. Light grain. Soft contrast with lifted blacks. Lighting always motivated by a visible source. 35mm lens feel. 9:16 vertical. No on-screen text, no logos, no lens flares.
```

## Tips

- A palette with three named colours is the most effective single line in the lock; most 'does not match' problems are colour.
- Keep one lock per project in a text file next to the clips; Life2Film and most editors will not fix a mismatched look, they will only make it obvious.

## Related

- character-consistency-reference-sheet
