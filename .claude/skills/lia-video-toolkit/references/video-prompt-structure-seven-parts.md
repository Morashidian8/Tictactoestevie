# The 7-part prompt structure for text-to-video

A fill-in template that gives any video model the seven things it needs: subject, action, setting, camera, light, style and sound. Fewer vague words, fewer wasted generations.

Category: generation · difficulty: beginner · time: 5 min · works with: veo, sora, kling, runway, any-llm · verified: False
Source: https://superduperai.co/library/video-prompt-structure-seven-parts/

## Prompt / recipe

```
SUBJECT: {who or what, with 2-3 concrete visual details}
ACTION: {one clear action, present tense, no more than one beat}
SETTING: {place, time of day, weather, era}
CAMERA: {shot size} · {angle} · {movement: static / slow dolly in / handheld follow / orbit}
LENS & LIGHT: {focal length feel, e.g. 35mm wide / 85mm portrait} · {light: golden hour / overcast soft / neon practicals / single window}
STYLE: {film stock or look: 16mm documentary / clean commercial / anime / claymation} · {color palette}
SOUND: {ambient sound} · {no music / music mood}
DURATION: {5-8 s}. No on-screen text, no logos, no subtitles.
```

## Steps

- Fill every line. A blank line is where the model improvises, and it improvises blandly.
- Keep ACTION to one beat. 'Walks to the window and looks out' is one shot; 'walks, sits, drinks coffee, laughs' is four.
- Paste the filled block as one paragraph into Veo, Sora, Kling or Runway. Most models read prose better than labels, so remove the labels once you are happy with the content.
- Generate 2-4 takes with the same prompt before changing anything; variance between takes tells you what the model is unsure about.

## Example

```
A woman in a yellow raincoat with wet hair holds a paper cup of coffee. She turns slowly toward the camera and smiles. A Lisbon tram stop at dawn, light rain, wet cobblestones reflecting shop signs. Medium close-up, eye level, slow dolly in. 50mm look, soft overcast light with warm practicals from a bakery window. 16mm documentary feel, muted teal and amber palette, light film grain. Ambient rain and distant tram bell, no music. 6 seconds. No on-screen text, no logos.
```

## Tips

- Negative instructions ('no text, no logos, no extra people') belong at the end; most models honour them better there.
- Name a shot size and a movement every time. 'Cinematic' alone gets you a random one.
- Google's Veo prompt guide lists the same elements (subject, context, action, style, camera motion, composition, ambiance); this template is ordered for the way people actually think about a shot.

## source

https://ai.google.dev/gemini-api/docs/video

## source_label

Google Veo prompt guide (element list)
