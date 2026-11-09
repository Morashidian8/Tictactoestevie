# Hook for a generated video: what must be in frame 1 when a model draws it

The first-frame rules for Veo, Kling and Runway: start mid-action, name the motion already happening, keep text out of the generation, and generate the hook shot as its own 4-second prompt first.

Category: hooks · difficulty: intermediate · time: 15 min · works with: veo, kling, runway, image-gen, any-llm · verified: False
Source: https://superduperai.co/library/generated-video-first-frame-hook/

## Prompt / recipe

```
Write the hook shot for a generated short video about {topic}, as a standalone 4-second generation prompt. The viewer decides on frame 1 (about 0.1 to 0.5 s for younger audiences, 1 to 2 s for older ones, per the creator-growth skill), so the hook shot is generated separately, judged at thumbnail size, and only then is the rest of the video made.

Frame 1 rules for a model:
- The subject is already in frame at full size and already mid-action: 'a hand already lifting the lid', not 'a hand reaches for the lid'. Models ramp motion from a still; write the action as in progress.
- One strong motion that reads at thumbnail size: steam, pouring, a door opening, a page turning, a cursor moving. Name it; do not ask for 'dynamic'.
- Close-up or medium close-up. Wide shots have nothing to look at in 0.5 s.
- Light from one named side so there is a bright and a dark half; flat light reads as a render.
- No on-screen text, no logos, no subtitles in the generation; the hook text is added in the editor in the platform font, so it stays sharp and editable.
- 4 seconds, 9:16, the camera static or a slow push in. No orbit, no whip pan on the hook shot.

Write the hook shot in this shape: subject already {mid-action}, {setting}, {medium close-up / close-up}, {static / slow push in}, {light from one side}, {style}, {ambient sound}, 4 seconds, 9:16, no on-screen text, no logos.

Then: the hook TEXT line to add in the editor (max 7 words, upper third), and a 2-line note on what to check at thumbnail size before generating the other shots (is the motion visible, is the subject identifiable, does the bright half hold the subject).

Topic: {topic}
What the first second must show: {the subject and the motion}
```

## Example

```
Topic: a weeknight cooking channel, a 4-minute smash burger. First second: the ball of meat hitting the pan.

Hook shot: A ball of ground beef already hitting a hot cast-iron pan, fat already spitting, a steel spatula entering from the right. A home kitchen hob, close-up, camera static at pan level. Hard light from a window on the left, the right half of the pan in shadow. Clean handheld-phone look, true-to-life colour, light steam. Loud sizzle, no music. 4 seconds, 9:16. No on-screen text, no logos.

Editor text: '4 MIN. ONE PAN.' in the upper third, from frame 1.

Thumbnail check: the spatter must be visible at 150 px wide (if not, move the camera closer); the patty must be in the bright left half; if the model opens on an empty pan, add 'already' before every verb and shorten to 3 seconds.

Second hook variant, for A/B: A pair of hands already pressing a spatula flat onto a patty, the edge crisping, same pan, same light, extreme close-up. Editor text: 'DON'T TOUCH IT FOR 2 MIN.'
```

## Tips

- Generate the hook shot first and alone. If it fails at thumbnail size, the other seven shots were wasted money.
- 'Already' is the word that moves a model off the still frame: 'already pouring', 'already rising', 'already open'.
- Use the first-frame method from the generation category when the hook needs an exact composition: make the still, approve it at thumbnail size, then animate it.

## Related

- visual-hook-first-frame-rules
- image-to-video-first-frame-method
- camera-movement-vocabulary
