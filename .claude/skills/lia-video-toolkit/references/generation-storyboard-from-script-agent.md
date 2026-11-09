# Ask an agent to turn a script into a numbered generation shot list

A prompt for Claude or ChatGPT that converts a 30-second script into 6-8 shot prompts in the 7-part structure, ready to paste into a video model one by one.

Category: generation · difficulty: intermediate · time: 10 min · works with: claude-code, claude, chatgpt, any-llm · verified: False
Source: https://superduperai.co/library/generation-storyboard-from-script-agent/

## Prompt / recipe

```
You are a storyboard artist for AI-generated video. Turn the script below into a shot list for a video generation model (Veo / Kling / Runway).

Rules:
- 6 to 8 shots, each 4-8 seconds, total under {30} seconds.
- Each shot is ONE paragraph of prose with: subject, one action, setting, shot size + one camera move, lens feel + light, style, ambient sound, duration. End with 'No on-screen text, no logos.'
- Reuse this STYLE LOCK verbatim at the end of every shot: {style lock paragraph}
- Reuse this CHARACTER BLOCK verbatim wherever the person appears: {character block}
- Vary shot sizes: never two consecutive shots of the same size.
- Shot 1 must work as a hook with the sound off.
- After the list, add a table: shot number, duration, the line of script it covers, what the editor adds on top (text, cut point).

Script:
{paste script}
```

## Steps

- Paste the output shots one by one into the model; keep the shot number in the clip filename.
- Generate two takes of shot 1 and the last shot first: if the hook and the ending do not work, the middle will not save it.
- Bring the clips, the table and the script into your editor or Life2Film; the table is your edit decision list.

## Tips

- In Claude Code this is one message with the script file attached; ask it to write shots to `shots/NN.txt` so each prompt is a file you can regenerate from.
- Keep total shot count low. Eight good clips cut better than twenty mediocre ones.

## Related

- video-prompt-structure-seven-parts
- style-lock-block

## skill

video-promo
