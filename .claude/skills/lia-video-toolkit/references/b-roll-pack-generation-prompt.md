# Generate a 10-clip b-roll pack for a talking-head video

One agent prompt that reads your transcript and writes ten generation prompts for cutaways that show what is being said, each tagged with the sentence it covers.

Category: generation · difficulty: intermediate · time: 20 min · works with: claude-code, claude, chatgpt, any-llm · verified: False
Source: https://superduperai.co/library/b-roll-pack-generation-prompt/

## Prompt / recipe

```
Read the transcript below. Find the 10 sentences where a cutaway would help most (a concrete object, place or action is mentioned, and nobody's lips need to be seen).
For each, write a video generation prompt for a 5-second b-roll clip that literally shows what the sentence says: subject, action, setting, shot size and one camera move, light, the style lock below, ambient sound, 'No on-screen text, no people's faces.'
Output a table: sentence (quoted), timestamp, prompt, aspect ratio {9:16}.
STYLE LOCK: {style lock paragraph}

Transcript:
{paste transcript with timestamps}
```

## Steps

- Get the transcript with timestamps first (the transcribe skill or any STT tool).
- Generate the ten clips; name files by the timestamp (0m42s.mp4) so the editor finds the slot.
- Place each cutaway on its own sentence, never over a sentence where the speaker's lips are visible on camera.

## Tips

- Faceless b-roll avoids the character consistency problem entirely; keep people's faces out of generated cutaways.
- Measured on a real edit: 12 of 54 automatically chosen cutaways were off topic. Read every prompt against its sentence before generating.

## skill

video-edit
