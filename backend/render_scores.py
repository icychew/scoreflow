"""Render MusicXML scores to PNG images using music21 + matplotlib.

No external tools (MuseScore, LilyPond) required.
Produces one PNG per score in results/images/.
"""

import pathlib
import music21
from music21 import converter, graph

SCORES_DIR = pathlib.Path("results/scores")
OUT_DIR = pathlib.Path("results/images")
OUT_DIR.mkdir(parents=True, exist_ok=True)

for xml_file in sorted(SCORES_DIR.glob("*.musicxml")):
    print(f"\nRendering {xml_file.name}...")
    score = converter.parse(str(xml_file))

    # Piano roll: pitch vs time
    piano_roll_path = OUT_DIR / f"{xml_file.stem}_piano_roll.png"
    p = graph.plot.HorizontalBarPitchSpaceOffset(score)
    p.doneAction = None  # don't open a window
    p.run()
    p.figure.savefig(str(piano_roll_path), dpi=150, bbox_inches="tight")
    p.figure.clf()
    print(f"  Piano roll -> {piano_roll_path}")

    # Pitch histogram
    hist_path = OUT_DIR / f"{xml_file.stem}_pitch_hist.png"
    h = graph.plot.HistogramPitchSpace(score)
    h.doneAction = None
    h.run()
    h.figure.savefig(str(hist_path), dpi=150, bbox_inches="tight")
    h.figure.clf()
    print(f"  Pitch histogram -> {hist_path}")

print("\nDone. Images saved to:", OUT_DIR.resolve())
