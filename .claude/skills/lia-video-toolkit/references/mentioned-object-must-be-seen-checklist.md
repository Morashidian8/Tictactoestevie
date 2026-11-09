# A mentioned object must be seen, ideally just before the line about it

The rule that turns 'X is mentioned, never shown' from a viewer complaint into a check you run on the transcript: every named thing gets a shot, placed just before or on the line.

Category: broll · difficulty: beginner · time: 10 min · works with: claude-code, manual, capcut · verified: False
Source: https://superduperai.co/library/mentioned-object-must-be-seen-checklist/

## Prompt / recipe

```
MENTIONED OBJECT, the checklist

1. Read the cut as text and underline every concrete noun a viewer could expect to see: an object, a place, a food, a tool, a person named, a screen.
2. For each, answer: is it on screen within 3 seconds before the line, or during it? Write the shot and its time, or NOT SHOWN.
3. NOT SHOWN with footage available: add the shot just before the line. The viewer sees the bread, then hears about the bread; the reverse plays as a caption.
4. NOT SHOWN with no footage: cut the line, use another take if one exists, or generate a faceless clip of the object; never leave the line pointing at nothing.
5. Shown, but from another time or place: that is a miss too (see the cutaway rule); find the same-place shot or treat as NOT SHOWN.
6. Names: the first time a person is named, their face is on screen or has just been. Introduce before you refer.
7. Screens and documents: shown close enough to read the one word that matters, for at least 2 seconds.
8. Re-run the list after every re-cut; moving a scene moves the first mention.
```

## Steps

- Run the check from the text export of the cut, before rendering. Ten nouns per minute of talk is normal.
- Fix in the cut script: one cover entry per NOT SHOWN noun. Render once.
- Keep the noun list; it is the shot list for the next day you film in that place.

## Tips

- 'Just before' is the editor's tense. Object, then the line about it, reads as the speaker pointing at it; line, then object, reads as an illustration added later.
- This check is also the fastest way to find the gaps in a shoot: the nouns with no footage are what to film tomorrow.

## Related

- cutaway-rule-same-place-same-time
- cutaway-matching-sentence-to-visual-prompt

## skill

video-edit
