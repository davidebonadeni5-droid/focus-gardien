@echo off
REM Construit FocusGardien.exe sur ton PC (plan B si GitHub Actions ne marche pas).
REM Il faut Python 3.10+ installe (coche "Add Python to PATH").
cd /d "%~dp0"
echo.
echo  === Focus Gardien : construction du .exe ===
echo.
python --version || (echo Python n'est pas installe. Va sur python.org & pause & exit /b 1)
python -m pip install --upgrade pip
python -m pip install -r requirements.txt pyinstaller || (pause & exit /b 1)
python -m PyInstaller --noconfirm --onefile --windowed --name FocusGardien --icon icone.ico --add-data "ui;ui" --add-data "icone.png;." --hidden-import pystray._win32 main.py || (pause & exit /b 1)
echo.
echo  C'est pret ! Ton application est ici :
echo  %~dp0dist\FocusGardien.exe
echo.
explorer "%~dp0dist"
pause
