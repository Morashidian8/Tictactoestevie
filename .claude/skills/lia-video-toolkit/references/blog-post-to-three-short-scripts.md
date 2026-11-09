# Turn a blog post into three short scripts: one claim per video

A prompt that reads a post and returns three 30-45 second scripts, each built on a different claim from the text, with the hook, the proof, the ask and the source sentence for each.

Category: scripts · difficulty: beginner · time: 10 min · works with: claude-code, claude, chatgpt, any-llm · verified: False
Source: https://superduperai.co/library/blog-post-to-three-short-scripts/

## Prompt / recipe

```
Read the post below. Find the three strongest claims that each stand alone without the rest of the post: a number, a contrarian take, a step-by-step. Write one 30-45 second vertical script per claim, 75-100 words each.

For each script:
CLAIM: the sentence from the post it is built on, quoted.
HOOK (0-3 s): the claim as a question or a bold line, max 12 words.
PROOF (3-25 s): the evidence or the steps from the post, in spoken sentences of max 14 words. Nothing that is not in the post.
ASK (25-30 s): one next step: read the post, try the thing, answer a question in the comments.
ON SCREEN: three text overlays, max 5 words each, one per block.
B-ROLL: three things to show that are literally in the text (a screen, an object, a place).

Rules: three different hook types across the three scripts; no script reuses a sentence from another; keep the author's words where they are better than yours. If the post holds fewer than three standalone claims, return fewer scripts and say why.

Post:
{paste post}
```

## Steps

- Paste the whole post, not a summary; the agent needs the author's sentences to keep.
- Post the three on different days. The claim that gets replies is the next post's topic.
- Keep the CLAIM line in your notes with the video's URL: it is the attribution and the way back to the source.

## Tips

- One claim per video. A script that covers the whole post is a summary, and summaries do not get watched to the end.
- The B-ROLL line is the shot list; if the post names nothing visible, the video is a talking head with three overlays, and that is fine.

## Related

- promo-script-30-45-seconds-template
- hook-text-on-screen-plan-prompt
