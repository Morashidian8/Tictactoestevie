# SRT cleanup: fix names from a glossary, merge short cues, cap line length

An agent prompt that takes a raw speech-to-text SRT and returns one you can publish: names fixed from your glossary, sub-second cues merged, lines wrapped at a character cap, timings untouched.

Category: captions · difficulty: beginner · time: 5 min · works with: claude-code, claude, chatgpt, any-llm · verified: False
Source: https://superduperai.co/library/srt-cleanup-glossary-merge-cues-prompt/

## Prompt / recipe

```
Clean the SRT below. Return a valid SRT only, no commentary, numbered from 1.

GLOSSARY (correct spellings; STT turned these into other words): {Name = what STT wrote, one per line}

Rules:
1. Replace every glossary miss with the correct form, including inside words and with the right case. Do not change any other proper noun.
2. Merge cues shorter than {1.0} s with the neighbour they belong to by sentence, keeping the earlier start and the later end. Never merge across a sentence end.
3. Split cues longer than {6} s at a sentence or clause boundary; divide the time proportionally by character count.
4. Wrap each cue to max 2 lines of max {32} characters, breaking at a phrase boundary (after a comma, before a conjunction), never leaving one word alone on a line.
5. Remove filler ('um', 'uh', repeated words at a restart) but not words that carry meaning. Keep the speaker's grammar.
6. Fix capitalisation and punctuation at sentence boundaries. Numbers stay as digits.
7. Timing values other than the merges and splits above stay exactly as given. No cue may overlap the next.

SRT:
{paste SRT}
```

## Steps

- Build the glossary first from a skim of the raw transcript: every person, place and product, with the wrong form STT produced. Unknown names become celebrities; one glossary per project fixes it once.
- Run the prompt, then validate: `ffmpeg -i clean.srt -f null -` reports parse errors, and a diff against the raw SRT shows that only text and the merged cues changed.
- Burn it or upload it as a track. Keep the cleaned SRT beside the video as the transcript of record.

## Tips

- Do the glossary pass before anything quotes the transcript, including the agent that proposes the story; a wrong name in the story brief propagates into the cut.
- 32 characters per line is a parameter for 9:16 at a readable size. For 16:9 on YouTube, 42 is common; the merge and split rules do not change.

## Related

- burned-subtitles-9-16-parameters
- ffmpeg-burn-in-subtitles-command
- transcript-to-youtube-chapters-prompt

## skill

transcribe
