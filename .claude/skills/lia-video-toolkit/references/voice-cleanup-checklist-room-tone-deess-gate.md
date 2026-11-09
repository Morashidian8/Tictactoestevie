# Voice cleanup checklist: room tone, de-ess, noise gate, in that order

Six passes that turn a phone or lav recording into a usable voice track, each with the ffmpeg filter and a starting parameter to adjust by ear, in the order that keeps the gate off word endings.

Category: music · difficulty: intermediate · time: 15 min · works with: ffmpeg, capcut, manual · verified: False
Source: https://superduperai.co/library/voice-cleanup-checklist-room-tone-deess-gate/

## Prompt / recipe

```
Run in this order on the voice track only, never on the mix:
1. ROOM TONE. Record 10 s of silence in the room at the start of every session. Use it to fill gaps under cuts instead of digital silence, and as the noise profile for step 3.
2. HIGH-PASS. Cut the rumble below the voice: highpass=f=80 (f=100 for a high voice, f=60 for a deep one).
3. NOISE REDUCTION, gentle. afftdn=nf=-25:nr=12 (nf = the noise floor in dB; nr = how many dB to remove; above about 15 the voice starts to warble).
4. DE-ESS. deesser=i=0.5:f=0.5 (i = intensity 0-1; raise until the s sounds soften, stop before a lisp).
5. GATE, last and light. agate=threshold=0.02:ratio=2:attack=20:release=250 (threshold in linear amplitude; ratio 2 is a soft gate, not a hard cut; release 250 ms keeps word endings).
6. LEVEL. loudnorm=I=-16:TP=-1.5:LRA=11.

ffmpeg, all passes in one chain:
ffmpeg -i voice.wav -af "highpass=f=80,afftdn=nf=-25:nr=12,deesser=i=0.5:f=0.5,agate=threshold=0.02:ratio=2:attack=20:release=250,loudnorm=I=-16:TP=-1.5:LRA=11" voice.clean.wav
```

## Steps

- Listen to the raw track once with headphones and write down what is wrong (hum, room, s sounds, breaths). Apply only the passes for what you heard.
- Run the chain, then A/B a 10-second stretch with a quiet word ending against the original. If the ending is clipped, raise the gate's release or lower its ratio before touching anything else.
- Keep the raw file. Every pass is destructive; the chain is cheap to re-run.

## Tips

- The gate goes last because the noise reduction and the high-pass already lowered the floor; a gate set on the raw floor cuts breaths and tails you wanted.
- Two gentle noise-reduction passes beat one hard one; a voice under heavy afftdn sounds underwater.
- Shot on a phone with the radio on? The music is not noise and no filter above removes it: separate stems first (the Demucs entry) and clean the vocals stem.

## Related

- loudness-normalize-minus-16-lufs-ffmpeg
- strip-other-peoples-music-demucs
