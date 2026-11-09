# Hook rewrite: a boring opener in, 5 stronger versions out, each with the reason

A prompt that diagnoses why an opener is weak (generic, unprovable, needs sound, buried number) and rewrites it five ways, each labelled with the archetype and the fault it fixed.

Category: hooks · difficulty: beginner · time: 5 min · works with: claude-code, claude, chatgpt, any-llm · verified: False
Source: https://superduperai.co/library/hook-rewrite-five-stronger-versions/

## Prompt / recipe

```
Here is the opening line of a short video about {topic}: "{boring opener}". The video then shows {what the video actually shows in the first 20 s}.

First, diagnose the opener in one line each against four faults: GENERIC (could open a video on any topic), UNPROVABLE (an opinion or a feeling instead of a thing the video shows), SOUND-DEPENDENT (does not work as text on a still), BURIED (the strongest fact is in the second sentence or not in the line at all). Name which faults apply.

Then write 5 stronger versions. Each one: max 12 words, present tense, uses a different archetype (pick from question, bold claim, pain point, curiosity gap, stop doing X, number, contrarian, result-first), keeps every fact from the original, adds no fact the video does not show. Under each, one line: the archetype, and which fault it fixed.

Banned in the rewrites: 'ever wondered', 'what if I told you', 'you won't believe', 'secret', 'hack', 'ultimate', 'game-changer', 'let me show you', 'in this video'.

Return: the diagnosis, then the 5 rewrites with their notes, then the one you would shoot and the frame 1 that goes with it.
```

## Example

```
Opener: "In this video I'm going to show you how I edit my product photos with this app and why I love it." Video shows: a mug on a cluttered counter becoming a mug on white in two taps, then three more photos done the same way in under a minute.

Diagnosis: GENERIC (yes, any app), UNPROVABLE ('why I love it'), SOUND-DEPENDENT (yes, nothing on the still), BURIED (two taps and under a minute are not in the line).

1. 'Listing photo. Two taps. On the phone.' Result-first; fixes BURIED and SOUND-DEPENDENT.
2. 'Stop editing product photos on a laptop.' Stop doing X; fixes GENERIC.
3. 'Four listing photos in under a minute, from the kitchen counter.' Number; fixes BURIED and UNPROVABLE.
4. 'Why do your product photos look like the kitchen?' Question; fixes GENERIC.
5. 'It's 11 pm, forty photos to list, and the laptop is at work.' Pain point; fixes GENERIC and SOUND-DEPENDENT.

Shoot: 1. Frame 1: the finished mug on white, full screen, '2 TAPS' in the upper third, thumb entering at 0.4 s.
```

## Tips

- Keep every fact and add none. A rewrite that adds a claim the video does not show is a stronger hook for a different video.
- Run the five through the rubric entry if you want a score; run the two best through the A/B entry if you want the truth.

## Related

- generate-20-hooks-ranked-by-rubric
- hook-ab-test-campaign-links

## skill

humanize
