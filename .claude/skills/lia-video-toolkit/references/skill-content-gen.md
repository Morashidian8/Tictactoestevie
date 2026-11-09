# Turn an article or PRD into a social media pack (/content-gen)

Use when "create content", "write LinkedIn post", "social media pack", "marketing copy", "promotion content", "posts from this article", "repurpose this post", "посты из статьи", or need soc

Category: skills · difficulty: beginner · time: 10 min · works with: claude-code · verified: False
Source: https://superduperai.co/library/skill-content-gen/

## Prompt / recipe

```
/content-gen {path-to-article-or-prd}

Make a social pack from this: 3 LinkedIn posts (different angles), 5 short captions for Reels/TikTok with hooks in the first line, and one thread. No hashtag walls, no emoji in LinkedIn posts, a number in every hook where one exists in the source. Mark which claims come from the source and which are mine.
```

## Steps

- Install the skill into Claude Code with the line above (or all of solo-factory: npx skills add fortunto2/solo-factory --all).
- Run it when: A published write-up should become posts, captions and threads.
- The skill asks for what it needs and writes its output into the project; read the summary it prints before trusting the files.

## Example

```
Generate a promotion content pack from a project's PRD or README. Produces 3 ready-to-use content pieces: LinkedIn post, Reddit answer draft, and Twitter/X thread. For video scripts, use `/video-promo`.
```

## Tips

- Source and the full instructions: github.com/fortunto2/solo-factory/tree/main/skills/content-gen (v1.3.0).
- Skills are prompts, not programs: read SKILL.md once, then you know exactly what the agent will do.

## install

npx skills add fortunto2/solo-factory/content-gen

## skill

content-gen

## source

https://github.com/fortunto2/solo-factory/tree/main/skills/content-gen

## source_label

solo-factory/skills/content-gen (MIT)
