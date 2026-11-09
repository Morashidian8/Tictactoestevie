# Talking-head clip: the script format AI avatar and lip-sync tools read best

How to write a 20-second spoken script so that a lip-sync or avatar model delivers it with natural pauses and no mispronounced numbers.

Category: generation · difficulty: beginner · time: 5 min · works with: any-llm, chatgpt, claude · verified: False
Source: https://superduperai.co/library/talking-head-avatar-script-prompt/

## Prompt / recipe

```
Rewrite the following script for a 20-second talking-head video delivered by an AI avatar or lip-sync model.
Rules:
- Short sentences, max 12 words each.
- Spell out numbers and symbols as they are spoken ('twenty three percent', 'dollars'), never digits.
- Write pauses as a new line, not as '...'.
- No parentheses, no emoji, no stage directions.
- Start with a one-line hook that works without context.
- End with one sentence of call to action.
- Target 55 words.

Script:
{paste rough script}
```

## Example

```
Input: 'Our app cut editing time by 73% for 1,200 users (!). Try it: life2film.com'
Output:
Your phone has hours of video nobody will ever watch.
This app watches it for you.
It finds the good thirty seconds and cuts a film.
On the phone. Nothing uploaded.
Search for Life two Film.
```

## Tips

- Fifty-five words is about 20 seconds at a natural 165 words per minute. Use the caption checker tool to confirm.
- Generate the voice first, listen, then render the face: a bad voice take costs seconds, a bad face take costs minutes.
