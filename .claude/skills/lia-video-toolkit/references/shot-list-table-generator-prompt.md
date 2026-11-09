# Shot list generator: a table with shot, duration, visual, audio and overlay

An agent prompt that turns any script into a numbered shot table a camera operator or a video model can follow: one visual, one audio line and one text overlay per row, durations that add up.

Category: scripts · difficulty: beginner · time: 5 min · works with: claude-code, claude, chatgpt, any-llm · verified: False
Source: https://superduperai.co/library/shot-list-table-generator-prompt/

## Prompt / recipe

```
Turn the script below into a shot list. Output a markdown table with these columns, in this order: Shot | Duration (s) | Visual | Audio | Text overlay.

Rules:
- One row per shot. A shot is one camera position or one screen state; a new screen or a new angle is a new row.
- Duration is a whole number of seconds. The column must sum to {total length in seconds}.
- Visual: shot size (wide / medium / close-up / screen recording of {app}) plus one action, in under 15 words.
- Audio: the exact words spoken over this shot, or 'music only', or 'natural sound'. Every sentence of the script must appear in exactly one row.
- Text overlay: max 6 words, or 'none'. Never repeat the audio word for word; the overlay carries the number or the name, the audio carries the sentence.
- Mark the hook row and the CTA row in the Shot column (H and CTA).

After the table, list what needs to be recorded or generated, one line per asset, with the shot numbers it serves.

Script:
{paste script}
```

## Steps

- Paste the script with its timings. Without a total length the durations drift upward.
- Check that the duration column sums to the target before recording anything; agents round up.
- Save the table beside the clips as shots.md; it is the edit decision list when you assemble.

## Example

```
| Shot | Duration (s) | Visual | Audio | Text overlay |
|---|---|---|---|---|
| H | 3 | Close-up, phone screen scrolling a camera roll fast | "Hours of video. Zero films." | none |
| 2 | 7 | Screen recording: dragging a folder in, a progress bar | "You shot it. Then it sat there." | 1,400 clips |
| 3 | 5 | Screen recording: the scene list appears, thumbnails fill in | "It finds the thirty seconds worth watching." | On device |
```

## Tips

- Ask for the overlay column even when you plan no text. It forces one idea per shot, which is what makes a cut feel fast.
- For generated video, feed each Visual cell into the 7-part prompt structure; the table is already one beat per shot.

## Related

- promo-script-30-45-seconds-template
- video-prompt-structure-seven-parts

## skill

video-promo
