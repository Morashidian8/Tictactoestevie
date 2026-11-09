# Level every chapter to -16 LUFS with ffmpeg loudnorm

One ffmpeg line that brings a file to -16 LUFS integrated and -1.5 dBTP true peak without touching the video, the two-pass version for exact results, and the timestamp trap on upload.

Category: music · difficulty: beginner · time: 5 min · works with: ffmpeg · verified: False
Source: https://superduperai.co/library/loudness-normalize-minus-16-lufs-ffmpeg/

## Prompt / recipe

```
# one pass, good enough for most chapters
ffmpeg -i chapter.mp4 -af loudnorm=I=-16:TP=-1.5:LRA=11 -c:v copy chapter.lv.mp4

# two passes, exact: measure first
ffmpeg -i chapter.mp4 -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null -

# then apply the measured values from the JSON
ffmpeg -i chapter.mp4 -af loudnorm=I=-16:TP=-1.5:LRA=11:measured_I={input_i}:measured_TP={input_tp}:measured_LRA={input_lra}:measured_thresh={input_thresh}:offset={target_offset}:linear=true,asetpts=N/SR/TB -c:v copy chapter.lv.mp4
```

## Steps

- Run the measure pass; copy input_i, input_tp, input_lra, input_thresh and target_offset from the JSON into the apply pass.
- Check with ffprobe that the output duration equals the input; a change here means the audio clock moved.
- Level each chapter of a long film separately, before joining them.

## Example

```
Unlevelled neighbouring chapters of one long film differed by 9 dB. After loudnorm at I=-16 the whole cut played at one level from start to end.
```

## Tips

- Put `asetpts=N/SR/TB` last in the audio chain when the file was cut with -ss and joined with concat: loudnorm can leave packet timestamps crammed together, and YouTube and Instagram place audio by timestamp and play seconds of silence where your player sounded fine.
- Verify on the copy the platform serves, not only on your file.

## Related

- voice-cleanup-checklist-room-tone-deess-gate
