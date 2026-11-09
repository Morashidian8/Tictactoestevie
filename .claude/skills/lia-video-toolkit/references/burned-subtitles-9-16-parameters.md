# Burned subtitles for 9:16: position, lines, characters, colour, as parameters

Settings for subtitles burned into vertical video for muted feeds: above the platform UI, two lines, about 32 characters each, white with a dark outline. Starting values, checked on a phone.

Category: captions · difficulty: beginner · time: 10 min · works with: ffmpeg, capcut, manual · verified: False
Source: https://superduperai.co/library/burned-subtitles-9-16-parameters/

## Prompt / recipe

```
BURNED SUBTITLES 9:16, the parameters

Position: bottom edge of the text block no lower than 20 percent up from the bottom of the frame (384 px on a 1920 px high frame); the platform's caption, buttons and progress bar live below that. Centre of the text block around 25-30 percent from the bottom. Never in the top 10 percent (status bar, account name).
Lines: max 2. A third line hides the picture.
Line length: about 32 characters per line including spaces; break at a phrase boundary, not mid-phrase.
Size: a parameter; start at a font size around 4-5 percent of the frame height (80-96 px on a 1920 px frame in a 1080x1920 ASS script) and adjust on a phone.
Colour: white text, black or near-black outline 2-3 px at 1080 width, no box unless the background is white; a soft shadow is optional.
Timing: a cue is on screen 1-6 s, and its in point lands within 2 frames of the first word.
Font: a heavy sans, the platform's native caption look; never a thin or serif face.
Case: sentence case; all caps only for a one-word hit.

Check: export 10 seconds, open it on the phone in the platform's own preview (not the gallery), muted, and look for text under the UI, a third line, a line that wraps on its own.
```

## Steps

- Clean the SRT first (names, merged short cues, line length capped); burning does not fix a bad transcript, it makes it permanent.
- Burn with ffmpeg (see the burn-in command entry) or the editor's caption tool, using these parameters as the starting values.
- Watch the first 10 s in the platform preview on a phone. Adjust the vertical margin first, font size second, line length third. Save the numbers in the project; they are the same for the next video.

## Tips

- Burned subtitles are for feeds with muted autoplay. On YouTube, upload an .srt track per language instead; a long video has a track picker and burned text cannot be turned off.
- The blurred-background 9:16 recipe in `/video-edit` centres the picture at 34 percent of the height for the same reason: the platform covers the bottom.

## Related

- ffmpeg-burn-in-subtitles-command
- srt-cleanup-glossary-merge-cues-prompt
- caption-accessibility-checklist

## skill

video-edit
