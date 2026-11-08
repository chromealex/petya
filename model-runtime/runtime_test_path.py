"""Locate packaged production modules from CPU-only development tests."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src" / "model-runtime"))
