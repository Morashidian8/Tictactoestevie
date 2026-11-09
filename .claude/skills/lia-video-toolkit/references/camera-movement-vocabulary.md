# Camera movement vocabulary that video models understand

The 14 camera moves that generation models respond to reliably, with the phrasing that works and the phrasing that produces a wobbling mess.

Category: generation · difficulty: beginner · time: 2 min · works with: veo, sora, kling, runway · verified: False
Source: https://superduperai.co/library/camera-movement-vocabulary/

## Prompt / recipe

```
Use ONE of these per shot, written exactly like this:

static shot, locked-off camera
slow dolly in toward {subject}
slow dolly out revealing {setting}
slow push in on {detail}
tracking shot following {subject} from behind
tracking shot alongside {subject}, same speed
handheld follow, slight natural shake
slow pan left to right across {scene}
tilt up from {ground detail} to {face / sky}
slow orbit around {subject}, 90 degrees
crane shot rising above {scene}
drone shot, high altitude, slow forward
rack focus from {foreground} to {background}
whip pan to {new subject}

Avoid: 'dynamic camera', 'epic movement', 'cinematic camera work', combined moves ('dolly in while orbiting and tilting').
```

## Steps

- Pick one move per clip. Combined moves are the single most common cause of warped geometry.
- Prefix with 'slow' unless you want speed; models default to too fast.
- Say where the move ends ('toward her face', 'revealing the harbour'): a move with a destination is drawn more steadily.

## Tips

- A static locked-off shot plus subject motion is the most reliable output of every current model. Use it for anything that must look clean.
- For image-to-video, camera moves that reveal what was outside the frame (dolly out, pan) force the model to invent pixels; dolly in and rack focus keep it inside what it has.
