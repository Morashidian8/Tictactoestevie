# Accessible on-screen text: contrast, the bottom 20 percent, no flashing

A checklist for text that everyone can read, including people watching muted, on a small screen, in sunlight, or with photosensitivity. Eight checks, each with the parameter to test against.

Category: captions · difficulty: beginner · time: 10 min · works with: manual, capcut, ffmpeg · verified: False
Source: https://superduperai.co/library/caption-accessibility-checklist/

## Prompt / recipe

```
ACCESSIBLE TEXT, the checklist

1. Contrast: white text with a dark outline or a dark band passes on almost any background. Measured contrast between text and what is directly behind it at least 4.5:1 (the WCAG text threshold, used here as a parameter; check with any contrast picker on a frame grab from the busiest moment).
2. No text in the bottom 20 percent of a vertical frame and the bottom 10 percent of a horizontal one: the player's own controls and captions sit there.
3. No text in the top 10 percent: status bar, account name, the feed tabs.
4. Size: a parameter to check, not a number to trust. Read the video on a phone at arm's length with the smallest text; if you squint, it is too small.
5. Hold time: words divided by 2.5 seconds, minimum 1.2 s per overlay; subtitles 1-6 s per cue.
6. No flashing: nothing that changes luminance more than 3 times in any second, no full-frame strobes, no rapid cuts between a dark and a bright frame for more than a second (the photosensitivity threshold, used as a parameter; when in doubt, slow it down).
7. Captions carry the meaning, not only the words: a sound that matters is written ([door slams], [laughs]) and the speaker is named when more than one talks off camera.
8. The text is also in the caption or description: a viewer with a screen reader does not see burned text. Put the number, the name and the URL in the post text too.

Check on a phone, muted, with the screen brightness at half, outdoors if you can.
```

## Steps

- Grab three frames: the busiest background, the brightest, the darkest. Check contrast on all three, not on the frame you designed for.
- Walk the checklist on the exported file, not the timeline; the export has the real letterboxing and the real encoding softness.
- Fix in this order: position, size, contrast, hold. Position fixes are free; contrast fixes may need a band under the text.

## Tips

- An outline plus a soft shadow passes almost everywhere; a box passes everywhere but hides the picture. Use the box only on white backgrounds.
- Test the darkest frames with the screen at full brightness in a dark room; that is where a flash hurts and where a thin outline disappears.

## Related

- burned-subtitles-9-16-parameters
- reading-speed-on-screen-text-parameters
