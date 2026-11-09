# UGC-style generated ad: make it look like a phone, not a studio

Prompt rules that push a video model toward the handheld, imperfect look of user-generated content, which still outperforms polished ads in most feeds.

Category: generation · difficulty: intermediate · time: 15 min · works with: veo, kling, sora, runway · verified: False
Source: https://superduperai.co/library/ugc-style-generated-ad-prompt/

## Prompt / recipe

```
{Person: age, look, outfit} holding {product} at arm's length, talking to the camera, in {a real place: car interior, kitchen, bathroom mirror, café table}. Shot on a phone front camera, handheld, slight shake, selfie framing with the face in the upper third. Natural daylight from a window, slightly overexposed, no studio light. Mild phone-camera sharpening, true-to-life colour. The person gestures with the product once. Background has normal clutter. No on-screen text, no logos, no filters. 6 seconds, 9:16.
```

## Steps

- Swap the place and the gesture between takes, keep the person block identical (see character consistency).
- Add the hook text and captions in the editor, in the platform's native font, not in generation.
- Mark it as AI-generated where the platform requires it.

## Tips

- 'Slightly overexposed window light' is the single phrase that most reliably kills the studio look.
- If the model keeps producing a studio, add 'amateur footage, not an advertisement' at the end.

## Related

- character-consistency-reference-sheet
- talking-head-avatar-script-prompt
