# Question hook: the opener the viewer answers in their head before you do

Template and rules for the question hook, with the test that separates a question that holds (the viewer has an answer and wants it checked) from one that is skipped (nobody cares either way).

Category: hooks · difficulty: beginner · time: 5 min · works with: claude, chatgpt, claude-code, any-llm · verified: False
Source: https://superduperai.co/library/hook-archetype-question/

## Prompt / recipe

```
Write 5 question hooks for a short video about {topic} aimed at {audience}. A question hook works only when the viewer already has a guess and wants to see if they are right, so each question must pass three tests: (1) the viewer can answer it in their head in one second, (2) the answer is not obvious, (3) the video will answer it within 15 seconds.

Templates to fill:
- 'Why does {thing the audience does} {unexpected result}?'
- 'What happens if you {action} for {time period}?'
- 'Do you {habit}? {Consequence in 3 words}.'
- 'Which of these {N} {things} is {adjective}?'
- 'Have you ever {specific moment}? Here is why.'

Rules: max 12 words, no 'ever wondered', no 'what if I told you'. Spoken and on screen as the same words. For each hook add the one-line answer the video gives at 15 s; if you cannot write the answer, the hook is a tease and gets cut.

Return: 5 hooks, each with its 15-second answer, ranked by how strongly the audience will have a guess.
```

## Example

```
Topic: photographing handmade products with a phone. Audience: people selling on marketplaces.

1. 'Why do your product photos look yellow indoors?' Answer at 15 s: the kitchen bulb is warm; shoot by a window, lamp off.
2. 'Which of these two mugs was shot on a phone?' Answer: both; the difference is the light, not the camera.
3. 'What happens if you zoom instead of stepping closer?' Answer: the edge goes soft because the phone throws away pixels.
4. 'Do you shoot on the kitchen counter? That is why nobody clicks.' Answer: the clutter is read before the product; cut it out.
5. 'Have you ever re-shot a whole shop in one weekend?' Answer: back up the originals somewhere that is not the phone.
```

## Tips

- Say the question and put it on screen in the same words; a viewer with sound off reads it, a viewer with sound on hears it, and both answer it.
- Rank by how sure the viewer is of their own answer. The hook with the most confident wrong guesses holds longest.

## Related

- generate-20-hooks-ranked-by-rubric
- hook-rewrite-five-stronger-versions
