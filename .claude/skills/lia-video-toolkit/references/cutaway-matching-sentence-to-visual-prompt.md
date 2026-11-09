# Cutaway matching: sentence to a literal visual, same place and time

A prompt that reads each sentence of a transcript and names the one picture that shows it, with the place and time it must come from, so the shot list is a list of things, not moods.

Category: broll · difficulty: intermediate · time: 15 min · works with: claude-code, claude, chatgpt, any-llm · verified: False
Source: https://superduperai.co/library/cutaway-matching-sentence-to-visual-prompt/

## Prompt / recipe

```
For each sentence below, write the ONE cutaway that shows it literally. Output a table: # | Sentence | Visual (the object, place or action named in the sentence, as a shot: size + what is in frame) | Must come from (the place and the time window: same location, within {15} minutes of when the sentence was said) | On camera? (yes if the speaker's lips are visible in the source for this sentence; then the answer is 'no cutaway').

Rules:
- Literal, not associated. 'The bakery was closed' is a shot of the closed bakery door, not a street.
- If the sentence names nothing visible (an opinion, a feeling), write 'none' unless the previous or next sentence names something; then the cutaway spans both.
- Never propose a shot from a place the story has not reached or has left.
- One visual per sentence; if two things are named, pick the one the sentence is about.
- Mark sentences where the thing named is shown nowhere in the footage list as MISSING, so it can be filmed or generated.

Footage available (clip, place, time, one-line description):
{paste shot list}

Sentences (clip, time, text; 'lips visible' flag if known):
{paste sentences}
```

## Steps

- Produce the footage list from the analysis sidecars or by scrubbing: clip, place, shooting time, one line of what is visible. Without it the agent proposes shots you do not have.
- Run the prompt, then build the contact sheet of every chosen cutaway with its sentence under it and read it. Measured on one film: 12 of 54 automatic cutaways were off topic.
- For the MISSING rows decide: film it next time, or generate a faceless clip (see the generated-vs-real rule).

## Tips

- The 'must come from' column is what separates a cutaway from stock footage. If you cannot fill it, the shot does not belong in a film about a day.
- Place cutaways in silent windows only. The 'on camera?' column exists so lips are never covered.

## Related

- cutaway-rule-same-place-same-time
- cutaway-contact-sheet-with-lines
- broll-shot-list-from-transcript-table

## skill

video-edit
