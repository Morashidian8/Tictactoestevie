# Read the film as text before rendering: the last check that costs nothing

The cut, printed as its lines in order, read by someone who never saw the raw footage. Catches the question whose answer was cut, the name said before the person, the 'this' that points at nothing.

Category: editing · difficulty: beginner · time: 10 min · works with: claude-code, claude, manual · verified: False
Source: https://superduperai.co/library/read-the-film-as-text-before-rendering/

## Prompt / recipe

```
Below is the final cut of a film as text: every spoken line in order, with [CUTAWAY: what is shown] and [SILENT: what is shown] markers between them, and on-screen text as [TEXT: words]. You have not seen the footage. Read it as a first viewer.

Answer, with line numbers:
1. Which lines refer to something that has not appeared yet (a name, a place, 'this', 'it', 'the one I mentioned')?
2. Which lines answer a question that is not in the text?
3. Where does the same information appear twice?
4. Where does a scene end without a reaction or a result?
5. Which cutaway markers do not show what the line next to them says?
6. Does the hook line promise something that the film then delivers? Quote both.
7. Three lines you would cut, and one place that needs one more line from the raw material (describe what it should say).

Do not praise anything. Output only the numbered findings.

Cut as text:
{paste the cut as text}
```

## Steps

- Export the cut as text from cut.json or by hand: lines in order, cutaway markers between them. Ten minutes for a day film.
- Give it to a fresh session or a person. The point is a reader with no memory of the footage; your own reread fills every gap from memory.
- Fix in the cut script, not the timeline. Re-render, re-export the text, read once more. Then render the masters.

## Tips

- Don't render before reading the cut as text. A render is minutes; the read is free, and most of the notes it finds would otherwise come from the first viewer in public.
- Finding 1 (refers to something not shown yet) is the one the cutaway sheet does not catch, because the cutaway matches the line and the line is still unexplained.

## Related

- critic-pass-two-passes
- scenes-not-best-phrases

## skill

video-edit
