# The cutaway rule: what is said, same place and time, never over moving lips

Three constraints for every cutaway in a talking film, and the agent prompt that applies them to a transcript. Kills what viewers read as broken: a picture from elsewhere, a face out of sync.

Category: editing · difficulty: intermediate · time: 20 min · works with: claude-code, capcut, manual · verified: False
Source: https://superduperai.co/library/cutaway-rule-same-place-same-time/

## Prompt / recipe

```
You are placing cutaways in a film cut from real footage. Below are the numbered sentences of the transcript with the clip each comes from and its shooting time, and a list of silent shots with clip, time and a one-line description of what is visible.

For each sentence, decide: no cutaway, or one cutaway. A cutaway is allowed only if ALL three hold:
1. It shows what the sentence says: the object, place or action named in it, literally. 'The bread' means a shot with the bread in it.
2. It comes from the same place and within {15} minutes of the sentence's shooting time. Never from a scene the story has not reached yet, never from one it has left.
3. The speaker's lips are not visible on camera during the sentence. If they are, the sentence stays on the speaker. No exceptions for a nicer shot.

Output a table: Sentence | Text | Cutaway clip + in/out | What it shows | Which of the three rules you checked and how.
If no silent shot passes all three, write 'none' and, in a separate list, what shot would have been needed (so it can be filmed next time).

Sentences:
{paste numbered sentences}
Silent shots:
{paste shot list}
```

## Steps

- Produce the two inputs first: the numbered transcript (clip, time, text) and a shot list with a one-line description per silent shot, from the analysis sidecars or from watching.
- Run the prompt; then lay out the result as a contact sheet with the line under each cutaway and read it. Measured on one film: 12 of 54 automatic cutaways were off topic.
- Place cutaways only in silent windows: between sentences, over a breath, over the listener. If the window is shorter than the cutaway, shorten the cutaway, not the rule.

## Tips

- Rule 3 is the one editors break for a better shot. The viewer does not see a better shot; they see a face whose voice continued without it.
- Same place, same time is what makes a cut feel like you were there. A beach shot over a line said in the car is stock footage.
- Automatic matching by caption similarity picks a car for a line about a garage, and a frame upside down. Read every pair.

## Related

- cutaway-contact-sheet-with-lines
- cutaway-matching-sentence-to-visual-prompt
- mentioned-object-must-be-seen-checklist

## skill

video-edit
