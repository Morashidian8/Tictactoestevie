# Cut any script to 55 words: the 20-second rewrite prompt

A rewrite prompt that compresses a script to 55 words (about 20 seconds at 165 wpm) without losing the number, the name or the ask, and reports what it removed so you can argue.

Category: scripts · difficulty: beginner · time: 3 min · works with: claude-code, claude, chatgpt, any-llm · verified: False
Source: https://superduperai.co/library/rewrite-script-to-55-words-20-seconds/

## Prompt / recipe

```
Rewrite the script below to 55 words or fewer, to be spoken in 20 seconds at about 165 words per minute (a parameter; change the word count if you speak slower).

Keep, in this order of priority: the one number, the product name, the call to action, the hook. Everything else is negotiable.

Rules:
- Sentences of 12 words or fewer. One idea per sentence.
- No adjectives that do not change the meaning. 'Fast' stays only if a number cannot replace it.
- No intro, no 'in this video', no 'so'.
- Spoken numbers written as words.
- The last sentence is the ask.

Output: the rewritten script, then the word count, then a list of what was removed and why, one line each.

Script:
{paste script}
```

## Steps

- Run it, read the removed list. If something load-bearing is in it, put it back and remove something else by hand.
- Read the result aloud with a stopwatch. 55 words at a natural pace is 18-22 seconds; if you hit 25, you are pausing, not talking.

## Example

```
Input (96 words): a paragraph about an app that 'seamlessly and intelligently' finds the best moments in your videos, with three sentences on how hard editing is.
Output (52 words):
Your phone has hours of video nobody will watch.
This app watches it for you.
It scores every frame and finds where the scenes change.
Then it cuts a film to the length you want.
On the Mac. Nothing uploaded.
Search for Life two Film Studio.
Removed: 'seamlessly', 'intelligently' (no meaning), two of three sentences about editing being hard (one is enough), the feature list (not the one job).
```

## Tips

- 165 words per minute is a parameter, not a law. Measure yourself once: read any 100 words and time it.
- The removed list is the real output. It shows which sentences were scaffolding, and the next script you write will have fewer of them.

## Related

- talking-head-avatar-script-prompt
- reading-speed-on-screen-text-parameters
