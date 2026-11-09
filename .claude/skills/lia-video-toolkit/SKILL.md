---
name: lia-video-toolkit
description: Saved video-making techniques for "Lia", the user's Iranian AI influencer (Persian Instagram Reels, 45 s clips, image-to-video with Gemini/Veo, CapCut, voice-over). Use whenever the user mentions Lia/لیا, asks for a new clip, scenario, shot prompt, subtitles, captions, editing, or says to use "the saved techniques / the library / تکنیک‌های ذخیره‌شده".
---

# Lia video toolkit

Techniques the user picked from the free prompt library at superduperai.co
(entries marked "unverified" by the site — treat as starting points, not facts).
The site is blocked from this environment's network; when a technique below has
only a summary and the full text is needed, ask the user to paste it.

Always reply to the user in Persian. Always combine with `lia_guide.md` (fixed
face description, realism phrases, video prompt template, checklists).
Project constraints: user has only Claude + Gemini subscriptions, wants no extra
spend; the user is male so Lia's voice is a separate female voice-over; Veo clips
are ~8 s and the user's downloads have been 360x640 (remind them to get 720p+).
Every post carries Instagram's AI label — never help hide that Lia is AI.

Files here:
- `lia_guide.md` — the fixed Lia guide (Persian)
- `clip1_subtitles.srt` — subtitles for clip 1 (the "I'm not real" hook script)

---

## A. Full text saved

### A1. Camera movement vocabulary (Veo / Sora / Kling / Runway)
Use ONE move per shot, written exactly like this:
- static shot, locked-off camera
- slow dolly in toward {subject}
- slow dolly out revealing {setting}
- slow push in on {detail}
- tracking shot following {subject} from behind
- tracking shot alongside {subject}, same speed
- handheld follow, slight natural shake
- slow pan left to right across {scene}
- tilt up from {ground detail} to {face / sky}
- slow orbit around {subject}, 90 degrees
- crane shot rising above {scene}
- drone shot, high altitude, slow forward
- rack focus from {foreground} to {background}
- whip pan to {new subject}

Avoid: 'dynamic camera', 'epic movement', 'cinematic camera work', combined moves.
Rules: one move per clip (combined moves = #1 cause of warped geometry); prefix
"slow"; say where the move ends. Static locked-off + subject motion is the most
reliable output. For image-to-video, moves that reveal outside the frame (dolly
out, pan) force the model to invent pixels; dolly in and rack focus stay inside.
Lia's per-shot assignment is in `lia_guide.md` §4.

### A2. Burned subtitles for 9:16
- Position: bottom of text block ≥ 20% up from the bottom (384 px of 1920);
  block centre ~25–30% from bottom; never in top 10%.
- Max 2 lines; ~32 characters per line incl. spaces; break at phrase boundaries.
- Size ~4–5% of frame height (80–96 px at 1080x1920 ASS); tune on a phone.
- White text, black outline 2–3 px at 1080 width, no box unless background is white.
- Cue 1–6 s, in-point within 2 frames of the first word.
- Heavy sans (for Persian: Vazirmatn Bold), never thin/serif/Nastaliq.
- Check: export 10 s, view muted in the platform's own preview on a phone; adjust
  vertical margin first, then font size, then line length; record the numbers.
- Clean the SRT before burning. Burned subs are for muted feeds (Reels/TikTok).
- Optional skill: `npx skills add fortunto2/solo-factory/video-edit`.

---

## B. Summaries (ask user to paste full text if needed)

**Hooks** (first 1–3 s; pick one archetype per clip, say which one before writing)
- **Hook for a generated video: what must be in frame 1** — start mid-action, name
  the motion already happening, keep text out of the generation (add it in the
  editor), generate the hook shot as its own ~4 s clip. Apply to every Lia shot 1.
- **Pain-point hook** — open on the viewer's own bad moment, specific (a place, a
  time, an object), not the general problem. E.g. not "money is tight" but
  "the moment you check the dollar rate before buying groceries".
- **Question hook** — a question the viewer already has an answer to and wants
  checked; a question nobody can answer gets skipped.
- **Result-first hook** — frame 1 is the finished result, then say how long it took.
  For Lia: only real, provable results (never fake income screenshots).
- **'Stop doing X' hook** — name a habit and tell them to stop; the replacement must
  be in the same or the next sentence.
- **Bold claim hook** — one declarative sentence the viewer expects you to fail to
  back up; the proof must be inside the video within ~20 s, not "in the comments".
  ("I'm not real — AI made me" is this type; Lia herself is the proof.)
- **Contrarian hook** — reverse the standard advice; quote it fairly and name the
  case where it is still right (otherwise it is rage bait).
- **Curiosity-gap hook** — withhold one real fact and promise it by a stated second;
  deliver it exactly there.
- **Number hook** — a small countable number (3 mistakes, 5 tools); the last item is
  named up front as the reason to stay.
- **Generate 20 hooks and rank by a stated rubric** — 20 openers across the 8
  archetypes above, scored on four named criteria, top 5 shown with scores. Use
  this when starting any new Lia clip.

**Planning**
- **Phase 1: four formats and what each buys** — educational converts; POV and
  humor get reach; story builds trust; comparison works when something replaces an
  expensive alternative. Plan Lia's week as a mix of these.

**Video generation**
- **Script → numbered generation shot list** — converts a 30 s script into 6–8 shot
  prompts in a 7-part structure, pasted into the video model one by one.
- **Generated b-roll or real: the decision rule** — generated cutaways are fine when
  faceless, no logos, and making no claim about a real place or time; otherwise
  real footage is needed. Five questions in order before each cutaway.
- **Keep the same character across clips: reference sheet prompt** — a character
  description block reused verbatim in every prompt + a generated reference sheet
  (face, outfit, build). Most important for Lia: build her reference sheet
  (front, 3/4, profile, both outfits) and attach it to every generation.
- **Fewer warped hands and faces** — prompt-side fixes for melting hands, drifting
  faces, extra limbs, ordered by how often each works. Apply when a shot fails the
  checklist (hands out of frame or resting, fewer hand actions, re-attach reference).
- **Establishing shot** — wide opening shot that tells the viewer where they are,
  made to look filmed not rendered. Use for a new location (café, street).
- **Disclosure and rights checklist** — six checks before posting: AI label,
  likeness, music, logos, model terms, provenance.

**Scripts**
- **Forced reasoning before scripting** — before writing any script, answer in
  writing: goal, hook type, demo moments, emotion arc. Do this for every new Lia
  script (avoids generic promo).
- **Blog post → three short scripts** — one claim per 30–45 s video, each with
  hook, proof, ask, source sentence. Good for the "dollar income with AI" series.
- **Day in the life: 45 s cut with one through-line** — vlog format where the
  viewer waits for one promised payoff; turns a clip list into a timed script with
  text overlays. Strong fit for Lia's lifestyle episodes.

**Editing**
- **The cutaway rule** — cutaway shows what is said, same place and time, and is
  never laid over moving lips. (Lia: mouth closed in every Veo clip; trim before
  the mouth opens.)
- **Cutaway matching: sentence → literal visual** — each sentence of the
  transcript names the one picture that shows it, with place and time.
- **B-roll shot list from a transcript** — table: timestamp, line, shot, source
  (have / generate).
- **Contact sheet of every cutaway with its line under it** — one-page check that
  catches off-topic shots (site measured 12 of 54 automatic cutaways wrong).
  I can build this with ffmpeg from the user's clips.
- **Cold open, then hook** — 8–10 s of the best frames with no speech, then one
  line with a twist. Alternative opening to test against the "I'm not real" hook.
- **Beat-sync cutting** — cut on beats, not every beat; hold the best shot through
  the hook.
- **The critic pass** — two-pass review: (1) structure: repeats, sagging scenes;
  (2) joins: mid-word cuts, audio seams. Run on every finished cut.

**Captions & text**
- **Burn subtitles with ffmpeg** — one command burning an SRT into 9:16 with size,
  outline, margin (+ check the ffmpeg build has libass). I can run this here:
  `ffmpeg -i in.mp4 -vf "subtitles=subs.srt:force_style='FontName=Vazirmatn,Bold=1,FontSize=..,Outline=2.5,MarginV=..'" out.mp4`
  (needs the Vazirmatn font file available).
- **Accessible on-screen text** — contrast, keep out of bottom 20%, no flashing.
- **Three caption variants + hashtags** — short / story / question captions and a
  hashtag set, counted against platform limits.

**Music**
- **Prompt for a music generator: 30 s instrumental** — structure by seconds, BPM,
  three instruments, no vocals, a drop that lands on the hook cut, an ending that
  stops (not fades). Otherwise use Instagram's own music library.

**Growth**
- **The ask lives in the comments, not in every video** — a call to action in every
  video gets it scrolled; put links/answers in pinned comments and bio, write the
  replies in advance. (Lia: keep "follow for part 1" only on episode intros.)

## Not saved (not relevant to Lia now)
Anime, claymation, food close-up, fashion lookbook, architectural walkthrough,
sidecar files, day-as-one-text-file (real footage), build in public, founder
explainer, store campaign links, creator budget gate, A/B test hooks with app-store
campaign links (for app installs; for Lia compare hooks by Reels retention instead).
