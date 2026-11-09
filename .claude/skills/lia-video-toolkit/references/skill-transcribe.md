# Transcribe audio and video locally with word timings (/transcribe)

Transcribe audio or video to text locally — on the Apple GPU with mlx-whisper large-v3, or faster-whisper on CPU/CUDA — with the language decided per stretch of speech, .srt subtitles, word…

Category: skills · difficulty: beginner · time: 5 min · works with: claude-code · verified: False
Source: https://superduperai.co/library/skill-transcribe/

## Prompt / recipe

```
/transcribe {file-or-folder}

Transcribe locally with word timings. Keep a glossary of names so the model stops turning them into celebrities: {Name1, Name2}. Output .srt beside each file, plus one day.txt with every sentence numbered by clip and order, which I will read as a script.
```

## Steps

- Install the skill into Claude Code with the line above (or all of solo-factory: npx skills add fortunto2/solo-factory --all).
- Run it when: You need the speech of a recording as text with timestamps, on your machine.
- The skill asks for what it needs and writes its output into the project; read the summary it prints before trusting the files.

## Example

```
Any ffmpeg-decodable file becomes `<name>.txt` (`[MM:SS] (lang) text`), `<name>.srt`, and on request `<name>.words.json` with per-word timings, the input a video edit needs. Audio never leaves the machine; the only network step is a one-time model download.
```

## Tips

- Source and the full instructions: github.com/fortunto2/solo-factory/tree/main/skills/transcribe (v1.0.1).
- Skills are prompts, not programs: read SKILL.md once, then you know exactly what the agent will do.

## install

npx skills add fortunto2/solo-factory/transcribe

## skill

transcribe

## source

https://github.com/fortunto2/solo-factory/tree/main/skills/transcribe

## source_label

solo-factory/skills/transcribe (MIT)
