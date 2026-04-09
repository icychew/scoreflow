"""Generate a short test WAV file (C major scale) for pipeline testing.

Uses only Python built-ins — no extra packages needed.
Output: test_input.wav (~4 seconds, 44100 Hz, mono, 16-bit PCM)
"""

import math
import struct
import wave
from pathlib import Path

SAMPLE_RATE = 44100
DURATION = 0.5  # seconds per note
NOTES = [261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25]  # C4 to C5

output_path = Path(__file__).parent / "test_input.wav"

with wave.open(str(output_path), "w") as wf:
    wf.setnchannels(1)
    wf.setsampwidth(2)
    wf.setframerate(SAMPLE_RATE)
    for freq in NOTES:
        n_frames = int(SAMPLE_RATE * DURATION)
        for i in range(n_frames):
            t = i / SAMPLE_RATE
            # Sine wave with simple amplitude envelope (avoid click at start/end)
            envelope = min(1.0, min(t / 0.01, (DURATION - t) / 0.01))
            sample = int(32767 * 0.5 * envelope * math.sin(2 * math.pi * freq * t))
            wf.writeframes(struct.pack("<h", sample))

print(f"Created: {output_path}")
print(f"Duration: {len(NOTES) * DURATION:.1f}s, {SAMPLE_RATE}Hz, mono, 16-bit PCM")
