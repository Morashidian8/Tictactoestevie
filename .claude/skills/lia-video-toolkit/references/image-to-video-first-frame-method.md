# Image-to-video: generate the first frame, then animate it

Make a still with an image model first, fix the composition there, and only then ask the video model to animate it. Cheaper iterations and the look you chose, not the one the video model guessed.

Category: generation · difficulty: intermediate · time: 15 min · works with: image-gen, veo, kling, runway, any-llm · verified: False
Source: https://superduperai.co/library/image-to-video-first-frame-method/

## Prompt / recipe

```
STEP 1 — the still (image model):
{subject with concrete details}, {setting}, {shot size and angle}, {lens feel}, {light}, {style and palette}, {aspect ratio 9:16 or 16:9}, sharp focus on {subject}, no text, no watermark.

STEP 2 — the motion (video model, with the still as the first frame):
Animate this frame. {subject} {one small action}. Camera: {one move from the vocabulary, or static}. Keep the composition, colours and lighting of the reference frame. Natural motion speed. {ambient sound}. 5 seconds.
```

## Steps

- Generate 4-8 stills, pick one, fix it there (regenerate, inpaint, upscale). Stills cost cents and seconds; video costs dollars and minutes.
- Upload the still as the first frame (Veo, Kling, Runway and Luma all accept one). Describe only the motion, not the picture: the picture is already decided.
- If the model drifts away from the frame, shorten the clip and reduce the action to one beat.

## Example

```
Still: a ceramic mug on a wooden desk, steam rising, morning light from a window on the left, 85mm look, shallow depth of field, warm film palette, 9:16, no text.
Motion: Animate this frame. Steam rises and curls slowly; a hand enters from the right and lifts the mug. Camera static. Keep the composition and lighting of the reference frame. Soft room tone. 5 seconds.
```

## Tips

- For product shots and talking-object formats this is the only workflow that gives repeatable results across a series.
- Keep a folder of your chosen stills: they are your style guide for the next clips (see consistency entries).

## Related

- character-consistency-reference-sheet
- camera-movement-vocabulary
