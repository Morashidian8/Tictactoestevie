# B-roll shot list from a transcript: the table to film or generate from

An agent prompt that reads a transcript and returns a shot table (timestamp, line, shot, source: have / film / generate) for a camera or a video model, grouped so each location is filmed once.

Category: broll · difficulty: beginner · time: 10 min · works with: claude-code, claude, chatgpt, any-llm · verified: False
Source: https://superduperai.co/library/broll-shot-list-from-transcript-table/

## Prompt / recipe

```
Read the transcript below and produce the b-roll shot list.

Table: Timestamp | Line (quoted, trimmed to the relevant clause) | Shot (size + exactly what is in frame + one action or none) | Duration (s) | Source (HAVE: clip name from the footage list / FILM: where and what / GENERATE: faceless, no logos) | Priority (1 = the line makes no sense without it, 2 = helps, 3 = nice).

Rules:
- One row per line that names something visible; skip opinions and transitions.
- Shot durations 2-5 s; a row is never longer than the line it covers.
- Literal pictures only: what the line names, not a mood for it.
- Source HAVE only when a clip in the footage list shows the thing; otherwise FILM if it is a real place or person, GENERATE only if faceless and generic.
- After the table, group the FILM rows by location into a shooting plan: location, the shots to get there, total minutes to film.
- Then list the GENERATE rows as generation prompts, one paragraph each: subject, action, setting, shot size, one camera move, light, 'no on-screen text, no faces', 5 s, {9:16 or 16:9}.

Footage list (optional):
{paste clip list with descriptions}
Transcript:
{paste transcript with timestamps}
```

## Steps

- Transcribe with timestamps first; a shot list without timestamps cannot be placed.
- Film the FILM groups in one trip per location; the plan tells you how long. Name files by the timestamp of the line they serve (0m42s.mp4).
- Generate the GENERATE rows last and only if a priority-1 line still has no picture; most priority-3 rows should be dropped, not generated.

## Tips

- Priority 1 rows are the 'mentioned object must be seen' list. If you film nothing else, film those.
- A transcript from a planned script (before filming) gives you the shot list before the shoot; from recorded footage it gives you the gaps.

## Related

- cutaway-matching-sentence-to-visual-prompt
- b-roll-pack-generation-prompt
- shot-list-table-generator-prompt

## skill

video-edit
