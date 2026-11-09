# Fewer warped hands and faces: what to change in the prompt

The prompt-side fixes for the classic generation failures (melting hands, drifting faces, extra limbs), ordered by how often each one works.

Category: generation · difficulty: beginner · time: 5 min · works with: veo, kling, sora, runway · verified: False
Source: https://superduperai.co/library/fix-warped-hands-and-faces/

## Prompt / recipe

```
Apply in this order until the artefact is gone:
1. Remove the second action. One beat per clip.
2. Hide the hands: 'hands in pockets', 'holding {object} with both hands', 'hands out of frame'.
3. Change the shot size one step wider (close-up → medium) or one step tighter (medium → close-up); the in-between sizes fail most.
4. Make the camera static.
5. Add at the end: 'anatomically correct, five fingers, single person, no extra limbs, no duplicate faces'.
6. Shorten to 4-5 seconds.
7. Switch to image-to-video from a clean still of the same shot.
```

## Tips

- Step 1 fixes more clips than steps 2-6 together.
- A negative prompt is the last resort, not the first: on most current models it changes little, and on some it degrades the shot.

## Related

- image-to-video-first-frame-method
- camera-movement-vocabulary
