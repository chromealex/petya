"""Command-line entry point for the installer shipped with Petya."""
import pathlib
import runpy
runpy.run_path(str(pathlib.Path(__file__).resolve().parent.parent / "src/setup-images.py"), run_name="__main__")
