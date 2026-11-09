# Visual hook rules: first frame, text on screen, sound off, and how long you have

The checklist for what the viewer sees before any word is heard: first frame, text, the sound-off case, and the attention windows the creator-growth skill states (about 0.1 s, 0.5 s, 1-2 s by age).

Category: hooks · difficulty: beginner · time: 5 min · works with: manual, claude, chatgpt, any-llm · verified: False
Source: https://superduperai.co/library/visual-hook-first-frame-rules/

## Prompt / recipe

```
Check the first 3 seconds of this video against the rules below and return a pass/fail per rule with the fix.

How long you have, from the creator-growth skill: younger audiences decide in about 0.1 s, millennials in about 0.5 s, older viewers in 1 to 2 s. So the frame that is on screen before anyone has heard a word is the hook; the sentence is the second hook.

FRAME 1
- The subject (result, object, face mid-action) is already in frame at full size. No fade in, no logo, no title card, no walking into frame.
- Something is already moving or about to: a hand, steam, a cursor. A still frame that lasts 1 s reads as a photo.
- Framing survives the platform's overlays: subject in the centre 60 percent, nothing important in the bottom 20 percent or the right edge.

TEXT ON SCREEN
- The hook line is on screen from frame 1, in the same words as spoken, max 9 words, big enough to read at phone size (48-60 px at 1080 wide).
- One line, not a paragraph. If the hook needs two lines it is two hooks.
- Text sits in the upper third or the centre, never over the subject's face or hands.

SOUND OFF
- With the audio muted, frame 1 plus the text still tells the viewer what the video is and why to stay. Test: screenshot frame 1, show it to someone for one second, ask what the video is about.
- If the opening depends on a sound (a sizzle, a voice), the text carries the same promise.

SOUND ON
- The first word is spoken within 0.5 s. No breath, no 'so', no 'hey guys'.
- If there is music, it starts on frame 1, not after.

Video to check: {describe frame 1, the on-screen text, the first spoken words, and the audience age}
```

## Steps

- Export frame 1 as an image and look at it at thumbnail size on a phone. That is what decides in the first 0.1 to 0.5 s.
- Mute the video and watch the first 3 s. If you cannot say what it is about, rewrite the text, not the voice.
- Trim everything before the first frame that passes: fade-ins, logo stings and the half-second of someone sitting down are the most common cuts.

## Example

```
Checked: a 30-second tutorial for a photo app, audience 25-40.

Frame 1: a face looking at the phone, then the product photo appears at 1.2 s. FAIL: the result must be frame 1; move the finished photo to 0 s, face at 2 s.
Motion in frame 1: none until 1.2 s. FAIL: start on the thumb already mid-tap.
Overlays: text in the bottom 15 percent. FAIL: move to the upper third.
Text: 'How I make my product photos look professional in seconds with this app' (13 words). FAIL: 'Listing photo. Two taps.' (4 words).
Sound off: with the audio muted the first 3 s show a face and a long caption. FAIL: with the result as frame 1 and the 4-word line it passes.
First spoken word: 'So, hey, today...' at 0.9 s. FAIL: cut to 'Two taps.' at 0.2 s.

After fixes: frame 1 is the finished mug on white with '2 TAPS' in the upper third, the thumb enters at 0.4 s, the voice says 'Two taps' at 0.2 s.
```

## Tips

- The attention numbers come from the creator-growth skill and are the reason frame 1 matters more than the sentence: a 25-year-old has decided before the first word is finished.
- Camera basics decide weak against strong in that skill's list: depth in the background, light, energy, audio. Frame 1 is where all four are visible at once.
- In Claude Code, `/creator-growth` applies these rules when it plans the formats; use this prompt to audit a cut you already have.

## Related

- hook-archetype-result-first
- generated-video-first-frame-hook
- silent-text-on-screen-story-format

## skill

creator-growth
