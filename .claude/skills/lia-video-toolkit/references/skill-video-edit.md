# Edit real footage into a film with the agent as the editor (/video-edit)

Edit real footage into a film with the agent as the editor — read the day's speech as text, write the cut as a script, lay cutaways that match the words, score it, strip other people's music, and…

Category: skills · difficulty: advanced · time: 1-3 h per film · works with: claude-code · verified: False
Source: https://superduperai.co/library/skill-video-edit/

## Prompt / recipe

```
/video-edit ./clips

Cut a {2-minute} trailer of this day. Read all speech as one text first and propose the story before touching a timeline. Cold open from the best 8-10 s, then one hook line. Every clip must appear at least once; list the ones you cut and why. Voice as one continuous track, cutaways only in silent windows. Render masters for YouTube and 9:16, then show me the contact sheet of cutaways with the line under each.
```

## Steps

- Install the skill into Claude Code with the line above (or all of solo-factory: npx skills add fortunto2/solo-factory --all).
- Run it when: A folder of clips should become a trailer, an episode or a trip film.
- The skill asks for what it needs and writes its output into the project; read the summary it prints before trusting the files.

## Example

```
A folder of clips becomes a trailer, a longer episode, or a film of a whole trip. The tools do the boring part (shots, quality, beats, speech); the agent picks the story; the person judges. Every rule below was paid for by a cut someone called boring or broken. If the project has its own editing skill, that one holds the commands; this one holds the rules.
```

## Tips

- Source and the full instructions: github.com/fortunto2/solo-factory/tree/main/skills/video-edit (v1.0.5).
- Skills are prompts, not programs: read SKILL.md once, then you know exactly what the agent will do.

## install

npx skills add fortunto2/solo-factory/video-edit

## skill

video-edit

## source

https://github.com/fortunto2/solo-factory/tree/main/skills/video-edit

## source_label

solo-factory/skills/video-edit (MIT)
