# Write the cut as a script, not a timeline: the JSON storyboard prompt

An agent prompt that writes the edit of real footage as a small JSON file: which sentences, which cover shots, what the cold open is. A complaint becomes a one-line edit, and the render repeats.

Category: scripts · difficulty: advanced · time: 30 min · works with: claude-code, claude · verified: False
Source: https://superduperai.co/library/script-to-storyboard-json-cut/

## Prompt / recipe

```
You are the editor. Below is the day's speech as numbered sentences (clip id, sentence number, start, end, text). Write the cut as a script, not a timeline: a JSON object that a render script will read. Do not output timecodes for the whole film; output decisions.

Shape:
{
  "title": "",
  "cold_open": [ {"clip": "", "in": "mm:ss.s", "out": "mm:ss.s", "why": ""} ],
  "hook": {"clip": "", "sentence": 0, "line": ""},
  "scenes": [
    {
      "name": "",
      "clip": "",
      "sentences": [0],
      "cover": [ {"from_clip": "", "in": "", "out": "", "over_sentence": 0, "shows": ""} ],
      "live_sound": false
    }
  ],
  "silent_walks": [ {"clip": "", "in": "", "out": "", "keep_own_sound": true} ],
  "cut_clips": [ {"clip": "", "reason": ""} ]
}

Rules:
- cold_open: 8-10 seconds total, from the best frames, no speech.
- hook: one sentence with a twist, said right after the cold open.
- scenes: whole conversations (lead-in, the talk, the reaction), never a best phrase alone.
- cover: only over sentences where the speaker's lips are not on camera; the cover shot comes from the same place within minutes of the line and shows what the line says.
- Every clip appears somewhere, or in cut_clips with a reason.
- Do not stretch to a target length.

Sentences:
{paste numbered sentences}
```

## Steps

- Produce the numbered sentences first: transcribe every clip with word timings, then number them in shooting order (see 'The day as one text file').
- Save the agent's JSON as cut.json beside the clips. Render from it with your script or editor; never hand-edit the timeline.
- When someone says 'the bread is mentioned and never shown', add one cover entry and re-render. That is the whole point.

## Tips

- The JSON forces the agent to decide; a timeline lets it hide the decisions inside timecodes.
- In Claude Code `/video-edit` works this way end to end: sidecar analysis, the day as text, the cut as JSON, render, masters per platform.

## Related

- day-as-one-text-file-story-and-cut-prompt
- cutaway-rule-same-place-same-time
- cold-open-then-hook-contact-sheet

## skill

video-edit
