# Curiosity-gap hook: withhold one fact, promise it by a stated second

Template for the hook that opens a gap and names when it closes, with the rule that keeps it from being clickbait: the withheld fact is real, single, and delivered where you said it would be.

Category: hooks · difficulty: intermediate · time: 5 min · works with: claude, chatgpt, claude-code, any-llm · verified: False
Source: https://superduperai.co/library/hook-archetype-curiosity-gap/

## Prompt / recipe

```
Write 5 curiosity-gap hooks for a short video about {topic}. The gap hook works because the viewer is told that one specific thing is missing and roughly when they will get it; it turns into clickbait when the missing thing is vague or never arrives. Each hook withholds exactly ONE fact and the video delivers it by the second you name.

Templates to fill:
- 'The {thing} that fixed {problem} was not {the expected thing}.'
- 'I changed one setting and {measurable result}. It is at the end.'
- 'Nobody told me this about {topic} until {event}.'
- 'There is a reason {surprising observation}, and it is not {the obvious reason}.'
- 'Watch the {object} at {second}.'

Rules: max 12 words, the withheld fact must be nameable in one sentence (write it under the hook as PAYOFF), the payoff lands before 60 percent of the video's length. No 'you won't believe', no 'wait for it' on its own.

Return: 5 hooks, each with PAYOFF (the fact) and WHEN (the second it is delivered), ranked by how far the payoff is from the obvious guess.
```

## Example

```
Topic: sourdough that finally rose.

1. 'The loaf that fixed six months of bricks was the one I forgot about.' PAYOFF: a 12-hour cold proof instead of 2 hours. WHEN: 40 s of 60.
2. 'I changed one thing and the crumb opened. It is at the end.' PAYOFF: proof overnight in the fridge. WHEN: 48 s of 60.
3. 'Nobody told me this about starters until loaf number thirty.' PAYOFF: the starter was never the problem, the proof time was. WHEN: 20 s of 45.
4. 'There is a reason your loaf is sour and flat, and it is not the flour.' PAYOFF: over-proofed in a warm kitchen. WHEN: 15 s of 30.
5. 'Watch the oven door at thirty seconds.' PAYOFF: the forgotten loaf rising with an ear. WHEN: 30 s.
```

## Tips

- Write the payoff under the hook before you write anything else. If it is not a single sentence, the hook is a tease.
- Naming the second ('at the end', 'at thirty seconds') is what keeps a gap hook honest, and it also tells the viewer the video is short.

## Related

- storytime-with-a-twist-format
- rehook-at-three-seconds-and-midpoint
