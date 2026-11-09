# Cadence: 1-2 posts a day, one vertical cut to TikTok, Reels and Shorts

The minimum posting rhythm for Phase 1 and the production habit that makes it possible: one 9:16 master per idea, three uploads, no per-platform re-edit. With the ffmpeg line for burned captions.

Category: growth · difficulty: beginner · time: 10 min · works with: manual, ffmpeg, capcut, claude-code · verified: False
Source: https://superduperai.co/library/posting-cadence-one-vertical-cut-three-feeds/

## Prompt / recipe

```
Daily production rule for {app name}:
- 1-2 posts a day, minimum. A day with zero posts is a day the accounts go cold.
- One vertical cut per idea. The same file goes to TikTok, Reels and Shorts; the caption and the on-screen hook text may change, the cut does not.
- Shoot vertical. If the source is horizontal, use a face-following 9:16 window with burned-in captions; never a blind centre crop.
- Captions burned in for feeds (nobody turns on a track in the feed): 1-2 word lines, centred, big.
- Hook text on screen for the whole of the first 3 seconds.
- Batch: shoot 7 in one session, post one a day, keep 2 in reserve for the day nothing gets shot.

ffmpeg, captions burned into a native vertical phone clip (this re-encodes the video, so run it once, from the master):
ffmpeg -i master.mp4 -vf "subtitles=captions.srt:force_style='Alignment=2,MarginV=160,FontSize=28,Outline=2'" -c:a copy master.feed.mp4
```

## Steps

- Export one archival master per idea; every upload comes from it.
- Upload to all three platforms the same day. Cross-posting a week later splits the signal you are trying to read.
- Log each post in a sheet: date, format, account, platform, campaign link. The weekly review reads this sheet.

## Tips

- Don't crop horizontal footage blindly to 9:16: if the camera pans inside the clip, a fixed crop misses. Scale the full frame to width or follow the face.
- Same content cloned across several accounts gets suppressed. One cut goes to three platforms, not to three accounts on one platform.
- In Claude Code, `/video-edit` renders the per-platform masters from one archival file; its references/delivery.md has the recipes.

## Related

- founder-led-phase-one-four-formats
- niche-accounts-one-archetype-each

## skill

creator-growth
