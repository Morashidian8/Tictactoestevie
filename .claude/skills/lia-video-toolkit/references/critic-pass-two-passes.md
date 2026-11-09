# The critic pass: repeats and sagging scenes first, mid-word joins second

A two-pass review prompt for a subagent or a second session: pass one on structure (repeats, sagging scenes), pass two on joins (mid-word cuts, audio seams). One read finds one kind of problem.

Category: editing · difficulty: intermediate · time: 20 min · works with: claude-code, claude · verified: False
Source: https://superduperai.co/library/critic-pass-two-passes/

## Prompt / recipe

```
You are the critic for a film cut from real footage. Review it in two separate passes and do not mix them.

PASS 1, STRUCTURE (read the cut as text plus the storyboard grid of one frame per shot):
- Repeats: the same face, the same place, the same point, more than twice in a row or more than {4} times in the film. Line numbers and frames.
- Sagging: any run of more than {40} seconds where nothing new is said, shown or decided. Give the start and end and the one thing that would fix it (cut, or move a scene).
- Order: any scene that would land better earlier or later, with why.

PASS 2, JOINS (read the word-timed transcript at every cut point):
- Lines cut mid-word at a join: the first or last word of a kept sentence shorter than {120} ms. List timecode, the word, and whether the in or out point moves.
- Audio seams: a cut where the room tone changes audibly inside a sentence.
- Cutaways over moving lips: any cutaway whose window overlaps a word spoken on camera.

Output: two numbered lists, PASS 1 and PASS 2, each item with a timecode or line number and a one-line fix. No summary, no praise. If a pass finds nothing, say so for that pass only.
```

## Steps

- Give the critic the cut as text, the storyboard grid (one frame per shot: an ffmpeg tile, or Life2Film's scene list exported as frames) and the word-timed transcript. Without word timings pass 2 is guessing.
- Fix pass 1 notes first; they move scenes and invalidate pass 2 timecodes. Re-render, then run pass 2.
- Run the critic in a fresh session or as a subagent. The session that made the cut defends it.

## Tips

- Two passes minimum. A single 'review this' returns three structure notes and misses every mid-word cut, because reading and listening are different jobs.
- The storyboard grid catches 'the same face ten times' that every metric passed; include it, not only the text.

## Related

- read-the-film-as-text-before-rendering
- cutaway-contact-sheet-with-lines

## skill

video-edit
