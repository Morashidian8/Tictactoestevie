# Music brief: describe the track you need before you search for it

A fill-in brief that names mood as harmony, a BPM range, genre, length and where the drop must land relative to your hook, so a library search or a composer returns something that fits the cut.

Category: music · difficulty: beginner · time: 10 min · works with: claude, chatgpt, any-llm, manual · verified: False
Source: https://superduperai.co/library/music-brief-prompt-for-picking-a-track/

## Prompt / recipe

```
MUSIC BRIEF for {video title}
LENGTH: {total seconds} s; the track may be longer, the edit will cut it.
MOOD, as harmony, not adjectives: {e.g. 'major sevenths and a minor sixth, solitary and warm' / 'triads with an added sixth, no minor chords, light'}
TEMPO: {low BPM}-{high BPM} BPM. The picture is cut at about one cut per {seconds per cut} s, so a bar should be close to that.
GENRE / INSTRUMENTS: {two or three instruments and one texture, e.g. 'felt piano, upright bass, brushed drums, tape hiss'}
STRUCTURE RELATIVE TO THE PICTURE:
- 0 to {hook end} s: under the hook, sparse, no drums; it must not compete with the first line.
- Drop, or the first full-band bar, at exactly {drop time} s: the cut right after the hook.
- A thinner section from {breakdown start} s to {breakdown end} s, where people talk.
- End: a last chord that rings out, not a fade.
VOCALS: none. No lyrics, no vocal chops.
AVOID: {what fights the footage, e.g. 'no risers, no trailer hits'}
SPACE FOR HOLES: the score will be silenced from {hole start} s to {hole end} s where live sound plays; write nothing that needs those bars.
DELIVERABLE: WAV, 48 kHz, plus a stem of the drums alone so the edit can mute them under speech.
```

## Steps

- Fill the brief from the finished cut, not before it: the drop time is a fact about your edit, not a wish.
- Paste it into a library's search as keywords (mood words, BPM, instruments) or send it as is to a composer or a music generation tool.
- Audition the candidate against the picture with the voice track on. A track that sounds right alone and wrong under speech is the usual outcome.

## Tips

- Mood is scale degrees, not tempo: a 'major' score came out sad at the right BPM because of its chords. Say the chords, not the feeling.
- Mix the score about 15 dB under the voice for talk films. A brief that asks for 'subtle' gets a quiet track that still fights the voice in the same range; ask for instruments that sit away from speech.
- If someone plays in the footage, the key and chords can be lifted from the recording with audio-to-MIDI and handed to the composer; the melody usually cannot.

## Related

- generated-music-30s-track-brief-prompt
- beat-sync-cut-not-every-beat
