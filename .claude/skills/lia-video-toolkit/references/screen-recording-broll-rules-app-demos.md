# Screen-recording b-roll for app demos: what to record, size, cursor

Rules for screen captures used as cutaways in a product video: real-looking data, output-size or 2x resolution, a slow cursor, one action per clip, and what makes a recording unusable.

Category: broll · difficulty: beginner · time: 15 min · works with: manual, capcut, ffmpeg · verified: False
Source: https://superduperai.co/library/screen-recording-broll-rules-app-demos/

## Prompt / recipe

```
SCREEN-RECORDING B-ROLL, the checklist

Before recording
1. Sample data that looks real: names, dates, amounts; no 'test test 123', no lorem ipsum, no empty states unless the empty state is the point.
2. Notifications off, other windows closed, a clean desktop, the browser with no extensions and no bookmarks bar, the app in light or dark mode matching the film.
3. Window size equals the final frame or an integer multiple (1920x1080 or 3840x2160 for 16:9; a phone recorded on the device for 9:16). Non-integer scaling blurs UI text.
4. Frame rate 60 fps if the app animates (scroll, transitions); 30 is enough for static screens.

While recording
5. One action per clip, named by the action (import-tap.mov, export-done.mov). Start 1 s before the action, hold 2 s after the result appears.
6. Cursor: slow, straight lines, a pause of about 0.5 s before each click, no circling. Hide the cursor when the clip is about the result, not the action.
7. Type at a steady pace or paste; real typing with corrections reads as nervous.
8. Never scroll fast. A scroll is a camera move: slow, one direction, stop on the thing.

After
9. Crop to the region that matters (the window, not the desktop) and scale once, to the output size.
10. Check a frame at 100 percent: readable text, no moire from scaling, no private data in a tab title, menu or notification.

Unusable: a cursor that hunts, personal data on screen, a recording smaller than the output frame.
```

## Steps

- Write the action list from the demo script (one action per row), then record each action as its own clip, in order.
- Trim to one second before and two seconds after with a stream copy (`ffmpeg -ss <start> -t <len> -i in.mov -c copy clip.mp4` cuts at keyframes; re-encode only if the cut must be frame-exact).
- Lay the clips over the narration as cutaways in silent windows; the result shot gets the longest hold.

## Tips

- On macOS a screen recording often has no audio track; `ffprobe` the file before assuming the system sound is there.
- A phone demo recorded on the phone and left native 9:16 is the one cutaway that needs no reframing; do not crop a desktop recording to vertical.

## Related

- screen-recording-demo-script-app
- mentioned-object-must-be-seen-checklist
