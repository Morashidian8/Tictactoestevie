# Generated b-roll or real: the decision rule

When a generated cutaway is fine (faceless, no logos, no claim about a real place or time) and when only footage from the same day will do. Five questions, in order, before you open a video model.

Category: broll · difficulty: beginner · time: 5 min · works with: claude-code, veo, kling, runway, manual · verified: False
Source: https://superduperai.co/library/generated-vs-real-broll-decision-rule/

## Prompt / recipe

```
GENERATED OR REAL, answer in order; the first REAL wins

1. Is the line about something that happened to the speaker, here, today? REAL. A film about a day uses the day's pictures; a generated beach over 'we swam at dawn' is a lie the viewer can feel even when they cannot name it.
2. Does the shot need a face, a known person, or a recognisable real place? REAL. Generated faces drift between clips and generated landmarks are wrong in ways locals see at once.
3. Would the shot carry a logo, a product label, a screen with real text, or anything a viewer might read? REAL, or a screen recording. Models still garble text and invent brands.
4. Is the line general (how a thing works, what a category of object looks like, an abstract process) and would the shot be faceless with no logos? GENERATED is fine. Prompt it literally: 5 s, one action, 'no on-screen text, no people's faces', in the film's style lock.
5. Do you have the real thing but shot badly (shaky, dark, 2 seconds)? REAL, two seconds of it. Bad real footage of the right thing beats a clean generated clip of a similar thing, in a film about real events.

Label generated clips in the cut script ("generated": true) and in the description where the platform asks; keep the prompt and model in a sidecar next to the clip.
```

## Steps

- Walk the five questions for every MISSING row of your cutaway list; most of a personal film's gaps resolve at question 1 (film it next time, or cut the line).
- For the rows that reach question 4, write the generation prompt from the sentence itself: literal, faceless, in the style lock, and generate 2 takes.
- Put generated clips through the same contact-sheet check as real ones: does it show what the line says?

## Tips

- Explainers and product videos reach question 4 constantly; a vlog almost never does. Know which film you are cutting.
- Faceless is what makes generated b-roll safe: no character consistency problem, no likeness question, and it cuts next to real footage without a visible seam when the style lock matches the grade.

## Related

- b-roll-pack-generation-prompt
- style-lock-block
- ai-video-disclosure-and-rights-checklist
- cutaway-matching-sentence-to-visual-prompt
