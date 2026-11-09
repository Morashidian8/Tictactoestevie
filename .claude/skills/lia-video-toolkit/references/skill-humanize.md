# Strip AI patterns from a script or caption so it reads like a person (/humanize)

Use when "humanize this", "make it sound human", "strip AI patterns", "clean up the copy", or text reads like AI-generated output with em dashes and stock phrases.

Category: skills · difficulty: beginner · time: 5 min · works with: claude-code · verified: False
Source: https://superduperai.co/library/skill-humanize/

## Prompt / recipe

```
/humanize {path-to-script-or-captions}

Strip AI patterns from this script: em dashes, triplets, 'unlock' and 'elevate', the hedging sandwich, filler openers. Keep every number, name and caveat. It must read like the founder said it on camera in one take.
```

## Steps

- Install the skill into Claude Code with the line above (or all of solo-factory: npx skills add fortunto2/solo-factory --all).
- Run it when: A generated script or caption sounds like a model wrote it.
- The skill asks for what it needs and writes its output into the project; read the summary it prints before trusting the files.

## Example

```
Strip AI writing patterns from user-facing text. Takes a file or pasted text and rewrites it to read like a human wrote it, without losing meaning or structure.
```

## Tips

- Source and the full instructions: github.com/fortunto2/solo-factory/tree/main/skills/humanize (v1.1.0).
- Skills are prompts, not programs: read SKILL.md once, then you know exactly what the agent will do.

## install

npx skills add fortunto2/solo-factory/humanize

## skill

humanize

## source

https://github.com/fortunto2/solo-factory/tree/main/skills/humanize

## source_label

solo-factory/skills/humanize (MIT)
