# Cold open, then hook: 8-10 s of best frames, hand-picked from a contact sheet

The opening that holds a viewer on real footage: 8-10 s of the strongest frames with no speech, then one line with a twist. What to look for on the sheet, and why the automatic pick is wrong.

Category: editing · difficulty: intermediate · time: 20 min · works with: claude-code, life2film, capcut, manual · verified: False
Source: https://superduperai.co/library/cold-open-then-hook-contact-sheet/

## Prompt / recipe

```
COLD OPEN + HOOK, the checklist

1. Make a contact sheet of candidate frames: one frame per shot, ranked by sharpness and exposure, laid out in a grid with the clip name and time under each (ffmpeg tile, or Life2Film's frame scores on the device).
2. Pick the cold open BY EYE: 8-10 seconds total from 3-5 shots. The ranking puts sharp and colourful first: an empty path through trees, a clean sky. That is what people scroll past.
3. Look for, in this order: fire, water, neon, night, motion toward the camera, a face with an expression, the film's object (the thing the day is about).
4. No speech in the cold open. Natural sound or the score only.
5. The hook is ONE line that follows the cold open, taken from the transcript, with a twist: it promises something the cold open did not show, or contradicts it.
6. The hook line is said on camera or over the last cold-open shot; never over the moving lips of another sentence.
7. Check on a phone, muted: would you stop scrolling at second 2?
```

## Steps

- Build the contact sheet before you watch any footage. Watching first anchors you on the story; the sheet shows you the frames.
- Mark the 3-5 frames on the sheet (a circle in any image editor is enough), then pull those shots at their best 2-3 seconds each.
- Search the transcript for the hook: a line with 'but', 'never', 'turns out', a number, or a question. Read five candidates aloud over the cold open.
- Render the first 15 seconds alone and watch on a phone before cutting the rest.

## Example

```
Cold open (9 s): the kettle on the gas ring (fire, 2 s), the ferry wake at night (water, neon, 3 s), she walks toward the lens laughing (motion, face, 4 s).
Hook: "We had tickets for the 7 am ferry. We were on the midnight one."
```

## Tips

- Life2Film scores every frame and finds the scene changes on your device; use that to shorten the sheet to the top frames per shot, then choose with your eyes. Nothing automatic chooses the hook.
- Don't trust an automatic hook or cover frame without looking at it. The rule in `/video-edit` exists because the ranked pick was an empty path through trees.

## Related

- cutaway-contact-sheet-with-lines
- script-to-storyboard-json-cut
- hook-text-on-screen-plan-prompt

## skill

video-edit
