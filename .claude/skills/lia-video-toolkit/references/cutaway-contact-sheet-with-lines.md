# A contact sheet of every cutaway with its line under it

The one-page check that catches off-topic cutaways before anyone watches: every cutaway frame in a grid, its sentence under it. Measured once: 12 of 54 automatic cutaways were off topic.

Category: editing · difficulty: intermediate · time: 15 min · works with: claude-code, ffmpeg, manual · verified: False
Source: https://superduperai.co/library/cutaway-contact-sheet-with-lines/

## Prompt / recipe

```
CUTAWAY SHEET, the checklist

1. From the cut script, list every cutaway: source clip, in point, the sentence it covers.
2. Extract one frame per cutaway at its midpoint: `ffmpeg -ss <mid> -i <clip> -frames:v 1 -vf scale=480:-2 cut_NN.jpg`.
3. Label each frame with its sentence: drawtext in ffmpeg, or any image tool. ffmpeg needs a build with freetype for drawtext, and Homebrew's default lacks it.
4. Tile them: `ffmpeg -pattern_type glob -i 'cut_*.jpg' -vf "tile=4x{rows}" sheet.jpg`.
5. Read the sheet, frame by frame, asking one question: does this picture show what the sentence says? Not 'is it related', not 'is it pretty'.
6. Mark every miss. Typical misses: a frame upside down, a car over a line about a garage, a shot from a place the story has not reached, a face when the line names an object.
7. Replace or remove each miss in the cut script. Re-tile. Only then render.
```

## Steps

- Build the sheet from the cut script, not from the rendered film; the script knows which sentence each cutaway belongs to.
- Read it on a screen big enough to see the whole grid; the misses are obvious side by side and invisible one at a time.
- Keep the sheet with the project. When the person who filmed it says 'that is not the bakery', the sheet shows which frame to swap.

## Tips

- 12 of 54 is the number that made this a rule. The matching used caption similarity, and similarity is not 'shows what is said'.
- The same sheet with one frame per shot instead of per cutaway is the storyboard grid that catches 'the same face ten times'.

## Related

- cutaway-rule-same-place-same-time
- critic-pass-two-passes

## skill

video-edit
