"""Score generation using music21 (MIT).

Converts quantized MIDI into MusicXML with correct key signature,
time signature, and clef assignment.
"""

import logging
import time
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)


class ScoreGenerationError(Exception):
    """Base exception for score generation errors."""


class EmptyMIDIError(ScoreGenerationError):
    """Raised when the input MIDI file contains no notes."""


@dataclass(frozen=True)
class ScoreConfig:
    """Configuration for score generation.

    Attributes:
        title: Title for the score. Default: None (use filename).
        composer: Composer name. Default: None.
        detect_key: Whether to auto-detect key signature. Default: True.
        detect_time_signature: Whether to auto-detect time signature. Default: True.
        default_time_signature: Fallback time signature if detection fails. Default: "4/4".
        auto_clef: Whether to auto-assign clef based on pitch range. Default: True.
        remove_empty_measures: Whether to remove trailing empty measures. Default: True.
    """

    title: str | None = None
    composer: str | None = None
    detect_key: bool = True
    detect_time_signature: bool = True
    default_time_signature: str = "4/4"
    auto_clef: bool = True
    remove_empty_measures: bool = True


DEFAULT_CONFIG = ScoreConfig()


@dataclass(frozen=True)
class ScoreResult:
    """Result of score generation.

    Attributes:
        output_path: Path to the MusicXML file.
        key_signature: Detected or assigned key signature string.
        time_signature: Detected or assigned time signature string.
        clef: Assigned clef name.
        measure_count: Number of measures in the score.
        note_count: Number of notes in the score.
        processing_time_seconds: Wall-clock time for generation.
        config: Configuration used.
    """

    output_path: Path
    key_signature: str
    time_signature: str
    clef: str
    measure_count: int
    note_count: int
    processing_time_seconds: float
    config: ScoreConfig


def _detect_clef(score_part) -> str:
    """Determine the best clef for a part based on average pitch.

    Returns the clef name string.
    """
    from music21 import clef as m21_clef

    pitches = []
    for note_obj in score_part.recurse().notes:
        if hasattr(note_obj, "pitch"):
            pitches.append(note_obj.pitch.midi)
        elif hasattr(note_obj, "pitches"):
            for p in note_obj.pitches:
                pitches.append(p.midi)

    if not pitches:
        return "treble"

    avg_pitch = sum(pitches) / len(pitches)

    # Bass clef for low pitches (below G3, MIDI 55)
    if avg_pitch < 55:
        return "bass"
    return "treble"


def _detect_key_signature(score) -> str:
    """Detect the key signature using music21's analysis."""
    try:
        key_result = score.analyze("key")
        return str(key_result)
    except Exception:
        logger.warning("Key detection failed, defaulting to C major")
        return "C major"


def _detect_time_signature(score, default: str) -> str:
    """Extract the time signature from the score."""
    from music21 import meter

    for ts in score.recurse().getElementsByClass(meter.TimeSignature):
        return ts.ratioString

    return default


def _count_notes(score) -> int:
    """Count total notes (including chord members) in the score."""
    count = 0
    for el in score.recurse().notes:
        if hasattr(el, "pitches"):
            count += len(el.pitches)
        else:
            count += 1
    return count


def _count_measures(score) -> int:
    """Count measures in the score."""
    measures = list(score.recurse().getElementsByClass("Measure"))
    return len(measures)


def _build_grand_staff_score(score, title: str | None = None):
    """Rearrange a single-part score into treble + bass grand staff (for piano).

    Notes with MIDI pitch >= 60 (middle C and above) go to the treble part;
    notes below 60 go to the bass part.
    """
    from music21 import stream, clef as m21_clef, instrument as m21_instrument

    treble_part = stream.Part()
    treble_part.partName = "Piano (Treble)"
    treble_part.insert(0, m21_clef.TrebleClef())
    treble_part.insert(0, m21_instrument.Piano())

    bass_part = stream.Part()
    bass_part.partName = "Piano (Bass)"
    bass_part.insert(0, m21_clef.BassClef())
    bass_part.insert(0, m21_instrument.Piano())

    from music21 import note as m21_note, chord as m21_chord

    for element in score.flat.notesAndRests:
        if isinstance(element, m21_note.Note):
            target = treble_part if element.pitch.midi >= 60 else bass_part
            target.insert(element.offset, element)
        elif isinstance(element, m21_chord.Chord):
            # Split chord: high notes to treble, low notes to bass
            treble_pitches = [p for p in element.pitches if p.midi >= 60]
            bass_pitches = [p for p in element.pitches if p.midi < 60]
            if treble_pitches:
                c = m21_chord.Chord(treble_pitches, quarterLength=element.quarterLength)
                c.volume = element.volume
                treble_part.insert(element.offset, c)
            if bass_pitches:
                c = m21_chord.Chord(bass_pitches, quarterLength=element.quarterLength)
                c.volume = element.volume
                bass_part.insert(element.offset, c)
        else:
            # Rest — add to both
            treble_part.insert(element.offset, element)

    grand_score = stream.Score()
    if title:
        from music21 import metadata
        grand_score.metadata = metadata.Metadata()
        grand_score.metadata.title = title
    grand_score.append(treble_part)
    grand_score.append(bass_part)
    return grand_score


def generate_score(
    input_path: Path,
    output_path: Path,
    config: ScoreConfig | None = None,
    stem_name: str | None = None,
) -> ScoreResult:
    """Generate MusicXML from a quantized MIDI file.

    Args:
        input_path: Path to the quantized MIDI file.
        output_path: Path to write the MusicXML file (.musicxml or .xml).
        config: Score generation configuration. Uses DEFAULT_CONFIG if None.

    Returns:
        ScoreResult with output path and metadata.

    Raises:
        FileNotFoundError: If the input file does not exist.
        EmptyMIDIError: If the MIDI file contains no notes.
        ScoreGenerationError: For other processing errors.
    """
    from music21 import converter, key, clef as m21_clef, metadata

    if not input_path.exists():
        raise FileNotFoundError(f"Input MIDI file not found: {input_path}")

    if config is None:
        config = DEFAULT_CONFIG

    logger.info("Starting score generation: file='%s'", input_path.name)
    start_time = time.monotonic()

    # Load MIDI with music21
    try:
        score = converter.parse(str(input_path))
    except Exception as exc:
        raise ScoreGenerationError(
            f"Failed to parse MIDI file '{input_path}': {exc}"
        ) from exc

    # Check for empty MIDI
    note_count = _count_notes(score)
    if note_count == 0:
        raise EmptyMIDIError(f"MIDI file '{input_path.name}' contains no notes")

    # Set metadata
    if score.metadata is None:
        score.metadata = metadata.Metadata()
    if config.title:
        score.metadata.title = config.title
    elif not score.metadata.title:
        score.metadata.title = input_path.stem
    if config.composer:
        score.metadata.composer = config.composer

    # Detect key signature
    key_sig_str = "C major"
    if config.detect_key:
        key_sig_str = _detect_key_signature(score)
        try:
            parts = key_sig_str.split()
            tonic = parts[0] if parts else "C"
            mode = parts[1] if len(parts) > 1 else "major"
            detected_key = key.Key(tonic, mode)
            for part in score.parts:
                first_measure = part.getElementsByClass("Measure")
                if first_measure:
                    first_measure[0].insert(0, detected_key)
        except Exception:
            logger.warning("Failed to insert detected key '%s'", key_sig_str)

    # Detect time signature
    time_sig_str = config.default_time_signature
    if config.detect_time_signature:
        time_sig_str = _detect_time_signature(score, config.default_time_signature)

    # Auto-assign clef
    clef_name = "treble"
    if config.auto_clef:
        for part in score.parts:
            clef_name = _detect_clef(part)

            # Remove existing clefs and insert the detected one
            for existing_clef in list(part.recurse().getElementsByClass(m21_clef.Clef)):
                part.remove(existing_clef, recurse=True)

            new_clef = m21_clef.BassClef() if clef_name == "bass" else m21_clef.TrebleClef()

            first_measure = part.getElementsByClass("Measure")
            if first_measure:
                first_measure[0].insert(0, new_clef)

            clef_name = new_clef.name
            logger.info(
                "Assigned clef '%s' to part '%s'",
                clef_name,
                part.partName or "unnamed",
            )

    # Remove trailing empty measures
    if config.remove_empty_measures:
        for part in score.parts:
            measures = list(part.getElementsByClass("Measure"))
            for m in reversed(measures):
                if len(m.notes) == 0:
                    part.remove(m)
                else:
                    break

    measure_count = _count_measures(score)

    # For piano stems: reformat as grand staff (treble + bass)
    if stem_name == "piano":
        try:
            score = _build_grand_staff_score(score, title=config.title if config else None)
            logger.info("Piano score converted to grand staff layout")
        except Exception as exc:
            logger.warning("Grand staff conversion failed, using single staff: %s", exc)

    # Write MusicXML
    output_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        score.write("musicxml", fp=str(output_path))
    except Exception as exc:
        raise ScoreGenerationError(
            f"Failed to write MusicXML to '{output_path}': {exc}"
        ) from exc

    processing_time = time.monotonic() - start_time
    logger.info(
        "Score generation complete: key=%s, time=%s, clef=%s, "
        "measures=%d, notes=%d, processing=%.2fs",
        key_sig_str,
        time_sig_str,
        clef_name,
        measure_count,
        note_count,
        processing_time,
    )

    return ScoreResult(
        output_path=output_path,
        key_signature=key_sig_str,
        time_signature=time_sig_str,
        clef=clef_name,
        measure_count=measure_count,
        note_count=note_count,
        processing_time_seconds=processing_time,
        config=config,
    )


def generate_pdf_from_musicxml(musicxml_path: Path, pdf_path: Path) -> Path:
    """Render a MusicXML file to a multi-page PDF using verovio + cairosvg.

    Args:
        musicxml_path: Path to the source MusicXML file.
        pdf_path: Destination path for the generated PDF.

    Returns:
        pdf_path on success.

    Raises:
        ScoreGenerationError: If rendering or conversion fails.
    """
    try:
        import io
        import cairosvg
        import verovio
        from pypdf import PdfWriter, PdfReader
    except ImportError as exc:
        raise ScoreGenerationError(
            "PDF dependencies missing — install verovio, cairosvg, pypdf"
        ) from exc

    try:
        tk = verovio.toolkit()
        tk.setOptions({
            "pageWidth": 2100,        # A4 width  (tenths: 210 mm × 10)
            "pageHeight": 2970,       # A4 height (tenths: 297 mm × 10)
            "scale": 40,              # 40 % scale gives comfortable line spacing
            "adjustPageWidth": True,  # let verovio fit content width
            "adjustPageHeight": False,
            "mmOutput": True,
        })
        tk.loadFile(str(musicxml_path))
        page_count = tk.getPageCount()
        logger.info("Rendering %d page(s) to PDF: %s", page_count, pdf_path.name)

        if page_count == 0:
            raise ScoreGenerationError("verovio reported 0 pages — invalid MusicXML?")

        pdf_path.parent.mkdir(parents=True, exist_ok=True)

        if page_count == 1:
            svg = tk.renderToSVG(1)
            pdf_path.write_bytes(cairosvg.svg2pdf(bytestring=svg.encode("utf-8")))
        else:
            writer = PdfWriter()
            for page_no in range(1, page_count + 1):
                svg = tk.renderToSVG(page_no)
                page_pdf = cairosvg.svg2pdf(bytestring=svg.encode("utf-8"))
                reader = PdfReader(io.BytesIO(page_pdf))
                writer.add_page(reader.pages[0])
            with open(pdf_path, "wb") as fh:
                writer.write(fh)

        logger.info("PDF written: %s (%.1f KB)", pdf_path.name, pdf_path.stat().st_size / 1024)
        return pdf_path

    except ScoreGenerationError:
        raise
    except Exception as exc:
        raise ScoreGenerationError(f"PDF rendering failed: {exc}") from exc


def render_score_to_png(musicxml_path: Path, png_path: Path, page: int = 1) -> bool:
    """Render a single page of a MusicXML score to PNG using verovio + cairosvg.

    Reuses the same verovio toolkit and options as generate_pdf_from_musicxml.
    Only page 1 is rendered by default — sufficient for OMR note-head detection.

    Args:
        musicxml_path: Path to the source MusicXML file.
        png_path: Destination path for the output PNG.
        page: 1-indexed page number to render (default: 1).

    Returns:
        True on success, False if rendering fails (caller decides whether to skip OMR).
    """
    try:
        import cairosvg
        import verovio

        tk = verovio.toolkit()
        tk.setOptions({
            "pageWidth": 2100,
            "pageHeight": 2970,
            "scale": 40,
            "adjustPageWidth": True,
            "adjustPageHeight": False,
            "mmOutput": True,
        })
        tk.loadFile(str(musicxml_path))

        if tk.getPageCount() < page:
            logger.warning(
                "render_score_to_png: requested page %d but score only has %d page(s)",
                page, tk.getPageCount(),
            )
            return False

        svg = tk.renderToSVG(page)
        png_path.parent.mkdir(parents=True, exist_ok=True)
        cairosvg.svg2png(bytestring=svg.encode("utf-8"), write_to=str(png_path))
        logger.info("PNG rendered: %s (%.1f KB)", png_path.name, png_path.stat().st_size / 1024)
        return True

    except Exception as exc:
        logger.warning("PNG rendering failed for '%s': %s", musicxml_path.name, exc)
        return False


def generate_scores(
    midi_files: dict[str, Path],
    output_dir: Path,
    config: ScoreConfig | None = None,
) -> dict[str, ScoreResult]:
    """Generate MusicXML scores for multiple MIDI files.

    Args:
        midi_files: Dictionary mapping stem name to MIDI file path.
        output_dir: Directory to write output MusicXML files.
        config: Score configuration. Uses DEFAULT_CONFIG if None.

    Returns:
        Dictionary mapping stem name to ScoreResult.
    """
    results: dict[str, ScoreResult] = {}
    output_dir.mkdir(parents=True, exist_ok=True)

    for stem_name, midi_path in midi_files.items():
        output_path = output_dir / f"{stem_name}.musicxml"
        stem_config = config
        if stem_config is None:
            stem_config = ScoreConfig(title=f"{stem_name.capitalize()} Part")

        logger.info("Generating score for stem: %s", stem_name)
        try:
            results[stem_name] = generate_score(midi_path, output_path, config=stem_config)
        except EmptyMIDIError:
            logger.warning("Skipping stem '%s': no notes in MIDI", stem_name)
        except ScoreGenerationError as exc:
            logger.error("Failed to generate score for '%s': %s", stem_name, exc)

    return results
