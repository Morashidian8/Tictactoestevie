# Three caption variants plus hashtags, with per-platform length limits

An agent prompt that writes three captions (short, story, question) and a hashtag set per platform, counting characters and hashtags against limits you paste in from today's upload form.

Category: captions · difficulty: beginner · time: 5 min · works with: claude-code, claude, chatgpt, any-llm · verified: False
Source: https://superduperai.co/library/caption-variants-hashtags-per-platform-prompt/

## Prompt / recipe

```
Write captions for the video described below, for these platforms: {TikTok, Reels, Shorts, LinkedIn}.

Limits to respect (parameters; I checked them against the upload forms today): {TikTok: caption max 4000 characters, 3-5 hashtags; Reels: caption max 2200 characters, 30 hashtags max, use 3-5; Shorts: title max 100 characters, description max 5000, 2-3 hashtags; LinkedIn: post max 3000 characters, 3-5 hashtags, first 2 lines visible before 'see more'}.

For each platform, three variants:
A. SHORT: one line, max 80 characters, the hook of the video in text form.
B. STORY: 2-4 short lines, what happened and the one takeaway; for LinkedIn, the first line must stand alone before the fold.
C. QUESTION: one line that asks the viewer something they can answer in a comment, max 100 characters.

Then hashtags per platform: the stated count, mixed as 1 broad, 2 topic, 1-2 niche; no hashtag that is a brand I do not own; lowercase; no spaces.

Output per platform: the three variants with their character counts, the hashtag line with its count, and a one-line note if any limit was close.

Rules: no emoji unless the platform list says so; no 'link in bio' unless I give a link; numbers and names exactly as in the video; nothing claimed that the video does not show.

Video:
{one-paragraph description, the hook line, the CTA}
```

## Steps

- Open each platform's upload form and check the current caption and hashtag limits; paste them into the limits line. They change, and the agent's memory of them is stale.
- Pick one variant per platform; a different variant per platform costs nothing and tells you which kind of caption your audience answers.
- Keep the chosen caption and hashtags in a text file beside the video with the posting date.

## Tips

- The question variant is the one that gets replies; the short variant is the one that gets saves. Which you want depends on the video.
- On LinkedIn the first line is the whole caption for most readers. Put the number there.

## Related

- hook-text-on-screen-plan-prompt
- blog-post-to-three-short-scripts
