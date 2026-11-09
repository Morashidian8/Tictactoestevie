# Beat-sync cutting: cut on the beat, not on every beat

A rule and an agent prompt for cutting to music from a list of beat timestamps: cuts land on beats, phrases get room to breathe, and the best shot is held through the hook.

Category: music · difficulty: intermediate · time: 15 min · works with: claude-code, claude, chatgpt, any-llm, capcut · verified: False
Source: https://superduperai.co/library/beat-sync-cut-not-every-beat/

## Prompt / recipe

```
You are the editor. Below are the beat timestamps of the track (seconds, one per line) and the list of shots with their durations. Build an edit decision list.

Rules:
- Every cut lands on a beat. Not every beat gets a cut.
- Default rhythm: one cut every {bars_per_cut} bars (a bar is {beats_per_bar} beats). Vary it: hold a strong shot for 2 bars, then cut twice in one bar, then hold again. Three cuts at the same interval in a row is the maximum.
- Let a phrase breathe: no cut inside the last beat before a downbeat that starts a new phrase; the cut lands on that downbeat.
- The hook of the track at {hook_start} seconds gets the best shot, held, with the cut landing exactly on its first downbeat.
- A shot shorter than one beat is only allowed in a run of 3-4 (a flash sequence), once in the video.
- A score written to this cut works the other way round: its chord changes land on the beat nearest a picture cut.

Output: a table with shot id, in point, out point, which beat index the cut lands on, and a one-word reason (hold / hit / breathe / flash). Then the total duration.

Beats:
{beat_timestamps}

Shots:
{shot_list}
```

## Steps

- Get beat timestamps first: `npm i life2film-engine` (WASM, on-device) returns beats, shots and frame scores; any beat tracker that writes seconds works.
- Paste beats and shots into the prompt; feed the table to your editor or to the render script as the cut list.
- Watch it once with the sound off: if the cuts still feel regular, the rhythm is too even. Merge two short shots into one hold.

## Tips

- A cut on every beat reads as a slideshow; the eye stops seeing the beat and starts seeing the clock.
- Snap to the downbeat, not to the nearest transient; hi-hats are beats too, and an agent will happily cut on them.
- In Claude Code, `/video-edit` writes the cut as a small JSON script and renders from it, so 'move that cut one beat later' is a one-line edit.

## Related

- score-hole-where-live-sound-plays
- generated-music-30s-track-brief-prompt

## skill

video-edit
