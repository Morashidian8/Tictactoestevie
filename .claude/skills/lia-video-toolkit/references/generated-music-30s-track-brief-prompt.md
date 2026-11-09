# Prompt for a music generator: a 30-second instrumental for a short

A brief in the shape music generation tools read: structure by seconds, BPM, three instruments, no vocals, a drop that lands on your hook cut, and an ending that stops instead of fading.

Category: music · difficulty: beginner · time: 10 min · works with: any-llm, claude, chatgpt, manual · verified: False
Source: https://superduperai.co/library/generated-music-30s-track-brief-prompt/

## Prompt / recipe

```
Instrumental, 30 seconds, {BPM} BPM, {key} {major or minor}. No vocals, no lyrics, no vocal chops, no spoken words.
Genre: {genre}. Instruments: {instrument 1}, {instrument 2}, {instrument 3}. One texture only: {e.g. 'tape hiss' / 'vinyl crackle' / 'clean'}.
Structure, by seconds:
0-2 s: a single hit or a held chord, no drums (the first frame of the video needs air).
2-{drop} s: build, sparse, no kick; a rising element that stops exactly at {drop} s.
{drop} s: the drop, full drums and bass, first downbeat exactly here.
{drop}-{break start} s: full groove, one chord change every 2 bars.
{break start}-{break end} s: breakdown, drums out, chords only.
{break end}-28 s: the groove returns, same chords as the first groove.
28-30 s: a final hit that rings out and stops dead by 30 s. No fade-out.
Mood as harmony: {e.g. 'major sevenths, warm' / 'minor with an added sixth, tense'}. Even dynamics; no risers, no cinematic hits, no reverse cymbals.
Loop point: the audio at 30 s must match the audio at 2 s so the video can loop.
Master to -16 LUFS integrated, true peak -1.5 dBTP, stereo, 48 kHz WAV.
```

## Steps

- Set {drop} to the exact second of the cut right after your hook; read it from the timeline, not from memory.
- Generate 3-4 takes; pick by whether the first downbeat lands within one frame of your cut. Nudge the track in the editor by a few frames rather than regenerating.
- If the tool added something you did not ask for (a vocal, a riser), regenerate with the 'no' lines moved to the top of the prompt.

## Tips

- Tools follow the structure by seconds loosely. Leave a one-beat hold on the shot at the drop so a small miss is absorbed.
- Ask for the drums as a separate stem if the tool offers it: the edit can mute them under speech and keep the chords.
- Where the video has live sound, the generated track gets a hole there, not a duck.

## Related

- music-brief-prompt-for-picking-a-track
- beat-sync-cut-not-every-beat
- score-hole-where-live-sound-plays
