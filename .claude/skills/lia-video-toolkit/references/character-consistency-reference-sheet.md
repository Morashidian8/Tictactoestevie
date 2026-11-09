# Keep the same character across clips: the reference sheet prompt

A character description block you reuse verbatim in every prompt, plus a generated reference sheet, so a face, outfit and build stay the same from shot to shot.

Category: generation · difficulty: intermediate · time: 20 min · works with: image-gen, veo, kling, runway, any-llm · verified: False
Source: https://superduperai.co/library/character-consistency-reference-sheet/

## Prompt / recipe

```
CHARACTER BLOCK (paste unchanged in every prompt):
{Name}: {age range}, {ethnicity / skin tone}, {hair: colour, length, style}, {face: 2 distinctive features, e.g. 'strong jaw, small scar on left eyebrow'}, {build}, wearing {exact outfit: colours, fabric, one accessory}. Always the same outfit and hairstyle.

REFERENCE SHEET (image model, once):
Character reference sheet of {Name} — {paste CHARACTER BLOCK} — three views: front, three-quarter, profile; neutral expression; plain grey background; even studio light; full body and a close-up of the face; no text.

SHOT (video model, each clip):
{paste CHARACTER BLOCK}. {action}. {setting}. {camera}. {light}. {style}. Use the attached reference image for the face and outfit.
```

## Steps

- Write the character block once and never paraphrase it. Models key on exact repeated phrasing.
- Generate the reference sheet with your image model, pick the cleanest, and attach it as a reference / first frame where the video model supports it.
- Change only the action, setting and camera between clips. If you change the outfit, you have a new character.

## Tips

- Two distinctive features beat ten generic ones: 'red beanie, round glasses' survives generation; 'kind eyes, warm smile' does not.
- Side-by-side the first frame of every clip in a contact sheet before editing; drift is obvious at thumbnail size and invisible at full screen.
