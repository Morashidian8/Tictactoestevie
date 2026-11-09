# Forced reasoning before scripting: goal, hook type, demo moments, emotion arc

Four questions an agent must answer in writing before it writes a line of script. Skips the generic promo every model produces when asked for one directly.

Category: scripts · difficulty: beginner · time: 5 min · works with: claude-code, claude, chatgpt, any-llm · verified: False
Source: https://superduperai.co/library/forced-reasoning-before-scripting/

## Prompt / recipe

```
Before writing any script for {product}, answer these four questions in writing. Do not write the script in this reply.

1. GOAL: What should the viewer DO after watching? One verb and one place (download from the App Store, sign up at {url}, reply with a comment). If you list two, pick one.
2. HOOK TYPE: Which of these opens the video, and why for {audience}: a question, a surprising number the reader can check, a pain point in the user's words, a bold claim. Write the hook line for the chosen type, max 12 words.
3. DEMO MOMENTS: The three product moments to show on screen, each as one sentence of what is visible and what the viewer understands from it. Mark which one is the wow moment.
4. EMOTION ARC: Frustration, then discovery, then relief. For each stage, which shot carries it and which line of narration.

Then list what you are NOT showing and why. Stop and wait for my corrections.
```

## Steps

- Run this as its own message. Correct the answers (the goal is usually wrong on the first pass), then ask for the script in the next message.
- Keep the four answers at the top of the script file. When a cut feels off, the arc is where the error usually is.

## Example

```
GOAL: install from the App Store.
HOOK TYPE: pain point. "Four hundred clips from Lisbon. You have watched none of them."
DEMO MOMENTS: (1) a folder dropped in, the scene list fills itself; (2) the best frame of each scene appears as a cover; (3) WOW: the 40-second film plays, cut to the music, and the originals are untouched.
EMOTION ARC: frustration = the camera roll scrolling forever; discovery = the scene list; relief = the film playing on the phone.
NOT SHOWING: settings, export options, the long-form mode. One job per promo.
```

## Tips

- The wow moment is the shot you would post on its own with no sound. If none of the three qualifies, go back to the product, not the script.
- `/video-promo` in Claude Code runs this step before scripting; the answers end up in docs/video-promo.md.

## Related

- promo-script-30-45-seconds-template
- shot-list-table-generator-prompt

## skill

video-promo
