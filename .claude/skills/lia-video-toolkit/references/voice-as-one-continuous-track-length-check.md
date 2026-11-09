# Voice as one continuous track, pictures on top, and the one-frame length check

The assembly rule for talking films: cut the audio from the same pieces as the picture, snapped to frames, then verify film length equals voice length. Drift over one frame is a bug, not a quirk.

Category: editing · difficulty: advanced · time: 15 min · works with: claude-code, ffmpeg, capcut · verified: False
Source: https://superduperai.co/library/voice-as-one-continuous-track-length-check/

## Prompt / recipe

```
VOICE TRACK ASSEMBLY, the checklist

1. Build the voice track first: every kept sentence, in order, cut from the source audio at frame boundaries (quantise in and out points to the frame rate: multiples of 1/30 s at 30 fps).
2. Lay the picture on top of it: the speaker's own shot where lips are visible, cutaways in the silent windows. The picture never decides where a sentence starts.
3. Keep the join inside silence: cut points at the ends of lines, trimmed of filler; mid-line only when the gap is silent.
4. After the render, measure, do not watch: `ffprobe -v error -show_entries stream=codec_type,duration -of csv=p=0 film.mp4` and compare the video and audio stream durations to the planned length.
5. Drift larger than one frame (1/30 s at 30 fps, about 33 ms) anywhere is a bug. Find it: a clip with a different sample rate, a variable-frame-rate phone recording, a cut not on a frame boundary.
6. Check the delivered file itself, at the seams, on at least one real camera file, never only on synthetic test sources.
```

## Steps

- Resample everything to one sample rate (48 kHz) before assembly. A 96 kHz recording joined to a 48 kHz card drifted the audio clock 1.39 s at the seam and passed every synthetic test.
- Snap every cut to a frame: round in/out times to the frame rate before cutting the audio, so the audio piece and the picture piece are the same length.
- Compare planned length, video stream duration and audio stream duration after every render. Three numbers, one line, every time.

## Tips

- Cutting the audio from the picture pieces is what a timeline editor does for you; a script-driven render has to do it on purpose, and that is where the drift comes from.
- A film that is half a second shorter than its voice track plays as a cut-off last word on the platform, and nobody tells you.

## Related

- script-to-storyboard-json-cut
- read-the-film-as-text-before-rendering

## skill

video-edit
