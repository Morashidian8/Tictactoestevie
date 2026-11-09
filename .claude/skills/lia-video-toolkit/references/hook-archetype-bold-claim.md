# Bold claim hook: say the thing you can prove in the next 20 seconds

Template and rules for the claim hook: one declarative sentence that the viewer expects you to fail to back up, plus the rule that the proof must be in the video, not in the caption.

Category: hooks · difficulty: beginner · time: 5 min · works with: claude, chatgpt, claude-code, any-llm · verified: False
Source: https://superduperai.co/library/hook-archetype-bold-claim/

## Prompt / recipe

```
Write 5 bold-claim hooks for a short video about {topic}. A claim hook works because the viewer stays to see you fail; it fails when the claim is an opinion or a superlative. Every claim must be checkable on camera within 20 seconds.

Templates to fill:
- '{Thing} takes {small number} {unit}. I'll show you.'
- 'You do not need {expensive thing} to {outcome}.'
- '{Common practice} is making your {result} worse.'
- 'I {did specific thing} with {constraint}. Here is the result.'
- 'Everything you need for {outcome} is already {in your pocket / in your kitchen / on your phone}.'

Rules: max 12 words, present tense, a number where there is one, no 'best', 'ultimate', 'secret', 'hack'. For each hook write the PROOF SHOT: what is on screen at 20 s that makes the claim true. If the proof shot is a caption or a testimonial, cut the hook.

Return: 5 hooks with their proof shot, ranked by how much the viewer doubts the claim.
```

## Example

```
Topic: a 10-minute-a-day language habit.

1. 'Ten minutes a day. Thirty days. I ordered dinner in Lisbon.' Proof shot: the clip of the order, waiter answering in Portuguese.
2. 'You do not need an hour a day to learn a language.' Proof shot: the app's calendar, 30 ticks of 10 minutes, next to a notebook page from day 30.
3. 'Studying at night is why you forget it by morning.' Proof shot: two evening test scores on sticky notes, a midnight day and a morning day.
4. 'Two hundred words is enough to eat anywhere.' Proof shot: the 200-word list on one page, held to camera.
5. 'Everything you need to start is already on your phone.' Proof shot: the home screen, the app, the timer set to 10:00.
```

## Tips

- Numbers make a claim checkable: 'ten minutes' can be caught in a lie, 'quickly' cannot, so 'ten minutes' is believed.
- A claim you cannot prove on camera belongs in a storytime, not a hook.

## Related

- hook-archetype-result-first
- generate-20-hooks-ranked-by-rubric
