# 'Stitch this' opinion: 5 seconds of their claim, 25 seconds of your answer

The stitch format in which a short borrowed clip sets up a claim and you answer with one argument and one demonstration. The prompt picks the 5 seconds to keep and bans the straw man.

Category: formats · difficulty: intermediate · time: 15 min · works with: claude-code, claude, chatgpt, any-llm · verified: False
Source: https://superduperai.co/library/stitch-this-opinion-format/

## Prompt / recipe

```
Write a stitch script replying to a clip that claims {the claim} about {topic}. The format works because the borrowed clip is the hook (the claim is stated by someone the viewer may already have seen) and the viewer stays for the answer. Rules: quote the clip fairly (the 5 seconds where the claim is clearest, not the weakest moment), answer with ONE argument, and show the argument rather than assert it.

Structure (30 s, 9:16):
- 0-5 s THE CLIP: the 5 seconds of the source where the claim is said. On-screen over it: nothing; let it play.
- 5-8 s THE TURN: me, face to camera, my position in one sentence. On-screen: the position in 4 words.
- 8-22 s THE ARGUMENT: one reason, with a demonstration (a screen, an object, two photos, a number I measured). Three spoken lines max, 12 words each.
- 22-27 s THE CONCESSION: the case where the original claim is right, one sentence. This is what makes the reply shareable rather than argued with.
- 27-30 s CLOSE: 'Stitch this if you disagree.' No download ask; if my demonstration used a product it was on screen.

Word budget: 60-70 words at 165 wpm for my part. On-screen: the position at 5-8 s, one label during the demonstration, nothing over the source clip.

Return: which 5 seconds of the source to keep (timestamps and the words), then a table (time, what is on screen, spoken line, on-screen text), then the argument in one line for the caption.

Source transcript with timestamps: {transcript}
My position: {position}
What I can show: {the demonstration I have}
```

## Example

```
Claim: 'You need a DSLR to sell anything handmade online.' Position: a phone by a window is enough for a listing. Demonstration: the same mug shot both ways.

Keep: 0:04-0:09 of the source, 'if you're shooting on a phone, nobody is taking your shop seriously.'

| Time | On screen | Spoken line | On-screen text |
|---|---|---|---|
| 0-5 s | Source clip | (source audio) | |
| 5-8 s | Me, kitchen, phone in hand | A phone by a window is enough for a listing photo. | PHONE IS ENOUGH |
| 8-13 s | Same mug, two photos side by side | Left is a camera with a lens that costs more than the mug. Right is my phone. | SAME MUG · SAME WINDOW |
| 13-18 s | Zoom into both | At listing size you can't tell. At phone size, nobody can. | LISTING SIZE |
| 18-22 s | Thumb cuts the background out, white | Background off, white on. That took longer to say than to do. | |
| 22-27 s | Me | If you're printing a catalogue or shooting glass with reflections, yes, get the camera. | WHEN THE CAMERA WINS |
| 27-30 s | Me | Stitch this if you disagree. | |

Caption: At listing size a phone by a window and a camera with a lens show the same mug. The camera wins for print and for glass.
```

## Tips

- Keep the strongest 5 seconds of the source, not the silliest. A reply to a straw man gets replied to.
- The concession at 22-27 s is not politeness; it is what makes the viewer believe the first 22 seconds.

## Related

- reaction-duet-style-format
