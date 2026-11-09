# Hooks for a product with nothing to show: text and voice carry the first 3 s

For an API, a CLI, a service, a habit, anything without a screen worth filming: five hook shapes built on a typed line, a number and a voice, and what goes on screen instead of the product.

Category: hooks · difficulty: intermediate · time: 10 min · works with: claude-code, claude, chatgpt, any-llm · verified: False
Source: https://superduperai.co/library/hooks-for-product-with-no-visuals/

## Prompt / recipe

```
Write 5 hooks for a short video about {product or idea}, which has no visual to show (no interface, no physical object, or an interface that is a wall of text). The hook has to be carried by on-screen text and a voice, so every hook is written twice: the TEXT line (max 7 words, on screen from frame 1) and the VOICE line (max 14 words, said over it). They are not the same words; the text is the claim, the voice is the detail.

What is on screen instead of the product, pick one per hook and name it: a face talking (closest to the phone, eye level); a terminal or a plain text editor with the line being typed live; a number counting on a plain background; an object that stands for the problem (a stopwatch, a stack of paper, a receipt); a hand writing the text line on paper.

Shapes to fill:
- Number-first: TEXT '{number} {unit}', VOICE the sentence that explains the number.
- Pain moment: TEXT the moment in 5 words, VOICE the second person scene.
- Typed claim: TEXT typed live, letter by letter, VOICE silent until the last word, then one line.
- Before/after in words: TEXT 'before: {state}' then 'after: {state}' as two cards, VOICE the time between them.
- Question: TEXT the question, VOICE the answer's first half only.

Return: 5 hooks, each with TEXT, VOICE, WHAT IS ON SCREEN, and the second at which the first concrete detail of the product is spoken (it must be before 8 s).
```

## Example

```
Product: a command-line tool that renames and sorts a folder of phone videos by shooting date.

1. Number-first. TEXT: '1,400 clips, 0 names'. VOICE: 'Every clip on my phone is called IMG and a number. Fourteen hundred of them.' On screen: a plain Finder list scrolling, all IMG_. Product detail at 6 s: 'one command reads the shooting date and renames them all.'
2. Pain moment. TEXT: 'which one is the wedding'. VOICE: 'You know the one. Four hundred clips from one weekend, and the toast is in there somewhere.' On screen: a hand scrolling a grid of identical thumbnails. Detail at 7 s.
3. Typed claim. TEXT typed live: 'sort 1,400 videos: one line'. VOICE at the last word: 'This is the line.' On screen: a terminal, the command appears, Enter. Detail at 3 s.
4. Before/after in words. TEXT card 1: 'before: IMG_4471.MOV'. Card 2: 'after: 2026-06-14 wedding 031.mov'. VOICE: 'Eleven seconds between those two.' On screen: the two cards on black. Detail at 5 s.
5. Question. TEXT: 'where did June go?'. VOICE: 'Every June clip is in one folder now, and I did not open an editor.' On screen: a face, then a cut to a folder called 2026-06. Detail at 4 s.
```

## Tips

- Typing the text live on screen is the cheapest motion there is, and motion in frame 1 is what stops the frame reading as a photo.
- The first concrete detail of the product is spoken by 8 s or the video is about a feeling. A detail is a number, a filename, a command, a before and after.

## Related

- visual-hook-first-frame-rules
- silent-text-on-screen-story-format
