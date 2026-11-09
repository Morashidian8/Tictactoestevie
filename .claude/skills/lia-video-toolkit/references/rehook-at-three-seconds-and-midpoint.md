# Re-hook at 3 s and at the midpoint: two lines that carry a viewer past the drop

Retention is lost twice, after the hook pays off and halfway through; this prompt writes the second promise for 3 s and the third for the midpoint, each as a line the viewer can check before the end.

Category: hooks · difficulty: intermediate · time: 10 min · works with: claude-code, claude, chatgpt, any-llm · verified: False
Source: https://superduperai.co/library/rehook-at-three-seconds-and-midpoint/

## Prompt / recipe

```
Here is a {length}-second script for a short video about {topic}:

{script}

The hook at 0-3 s buys three seconds. Two more promises are needed: a RE-HOOK at 3 s, right after the opener, and a MID-HOOK at the midpoint ({length} divided by 2). Each is one spoken line, max 10 words, that names a specific thing still to come and roughly when.

Rules:
- The re-hook at 3 s is a specific promise about the end: 'the third one is the one you do', 'the number at the end is under two dollars'. Not 'stick around'.
- The mid-hook is a turn: a complication, a result that is not what the first half implied, or the countdown reaching the best item. It must change the direction of the video, not restate the hook.
- Both are on screen as text in the same words, 2 s each.
- Neither is a CTA. No 'follow for part 2'. The download ask, if the video has one, stays where it was.
- Check that both promises are kept: quote the line in the script that pays each one off, with its second. If a promise has no payoff, rewrite the promise, not the script.

Return: the re-hook with its second and its payoff line, the mid-hook with its second and its payoff line, then the script with the two lines inserted and marked [RE-HOOK] and [MID-HOOK].
```

## Example

```
Script: the 40-second '3 product-photo mistakes' video (hook: 'Three product-photo mistakes, and the third one is why your listing looks cheap').

RE-HOOK at 3 s: 'Number three takes one tap to fix.' Payoff: 32-37 s, 'Cut it out and put it on white; the app does that in one tap.'

MID-HOOK at 20 s: 'You can't fix this one in an editor.' Payoff: 21-25 s, 'Step closer, crop later.' (the zoom mistake cannot be undone after the shot).

Script with inserts:
0-3 s: Three product-photo mistakes, and the third one is why your listing looks cheap.
3-5 s: [RE-HOOK] Number three takes one tap to fix.
5-14 s: One. Shooting under the kitchen light...
14-20 s: Two. Zooming in. The phone throws away pixels; the edge goes soft.
20-22 s: [MID-HOOK] You can't fix this one in an editor.
22-25 s: Step closer, crop later.
25-37 s: Three. The background...
37-40 s: Save this for your next listing.

Third example, for a 60-second storytime: RE-HOOK at 3 s 'I baked it to throw it away.' MID-HOOK at 30 s 'Then I got the phone call.' Both paid off at 40-48 s.
```

## Tips

- Read the retention graph on the last three videos before writing these: the drop after 3 s and the drop near the middle tell you where the promises go. The graph is in the platform's analytics for every video.
- A re-hook that is kept builds trust for the next video; a re-hook that is not kept is the last video that viewer watches. Quote the payoff line before you record.

## Related

- hook-archetype-curiosity-gap
- three-mistakes-format
- storytime-with-a-twist-format
