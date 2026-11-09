# Burn subtitles with ffmpeg: the command with size, outline and margin

One ffmpeg command that burns an SRT into a 9:16 video with white text, a dark outline and the block held above the platform UI, plus the check that your ffmpeg build can run it at all.

Category: captions · difficulty: intermediate · time: 10 min · works with: ffmpeg · verified: False
Source: https://superduperai.co/library/ffmpeg-burn-in-subtitles-command/

## Prompt / recipe

```
ffmpeg -i in.mp4 -vf "subtitles=subs.srt:force_style='FontName=Arial,FontSize=20,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Shadow=0,BorderStyle=1,Alignment=2,MarginV=60,MarginL=20,MarginR=20'" -c:v libx264 -crf 20 -pix_fmt yuv420p -c:a copy -movflags +faststart out.mp4

What each parameter does:
- FontSize=20, MarginV=60: ffmpeg gives an SRT a 384x288 script resolution, so these are in that scale. MarginV=60 puts the text bottom about 20 percent up the frame; FontSize=20 is roughly 7 percent of the height on 9:16. Adjust by eye on a phone.
- PrimaryColour / OutlineColour: ASS colours are &HAABBGGRR; &H00FFFFFF is opaque white, &H00000000 opaque black.
- Outline=2, Shadow=0, BorderStyle=1: an outline in script units, no drop shadow, no box.
- Alignment=2: bottom centre (numpad layout: 2 bottom, 5 middle, 8 top).
- MarginL / MarginR: keeps long lines off the edges on a narrow frame.
- -c:a copy: the audio is untouched; only the picture is re-encoded, which burning requires.

Preview 10 seconds before the full run:
ffmpeg -t 10 -i in.mp4 -vf "subtitles=subs.srt:force_style='FontSize=20,Outline=2,MarginV=60,Alignment=2'" -c:a copy preview.mp4
```

## Steps

- Check the build: `ffmpeg -filters | grep -w subtitles`. Homebrew's default ffmpeg on a Mac is built without libass and the filter is missing (checked 2026-10-25); `brew install ffmpeg-full` and use `/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg`.
- Clean the SRT first (glossary, merged cues, 2 lines of about 32 characters). The filter wraps long lines on its own and does it badly.
- Render the 10-second preview, open it on a phone in the platform preview, adjust MarginV then FontSize, then run the full file.
- If the SRT path has spaces or colons, rename the file; escaping them inside the filter string is where most 'file not found' errors come from.

## Tips

- This is the one re-encode you cannot avoid when the picture changes; a trim, an audio swap or an outro should be a stream copy, never a re-encode.
- Use a .ass file instead of .srt when you need per-cue position or two styles (a speaker and a label); the same filter reads it and force_style still applies as the default.

## Related

- burned-subtitles-9-16-parameters
- srt-cleanup-glossary-merge-cues-prompt

## skill

video-edit
