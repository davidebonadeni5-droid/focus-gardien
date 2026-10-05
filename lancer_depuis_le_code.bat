@echo off
REM Lance Focus Gardien depuis le code (sans .exe). Il faut Python.
pip install -q -r "%~dp0requirements.txt"
start "" pythonw "%~dp0main.py"
