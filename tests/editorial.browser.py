"""Compatibility entry for the self-contained editorial integration acceptance.

The former external-HTML fixture harness targeted retired accordion layouts.
Current acceptance creates isolated real tool state and synthetic media itself.
Run this file without arguments; requires Node, FFmpeg, Python Playwright and Chrome.
"""
from pathlib import Path
import runpy

if __name__ == '__main__':
    runpy.run_path(str(Path(__file__).with_name('storyboard-organization.browser.py')), run_name='__main__')
