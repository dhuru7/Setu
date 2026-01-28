@echo off
echo Stopping any existing Python instances...
taskkill /F /IM python.exe >nul 2>&1

echo Starting Setu AI Server...
echo API Key: sk_41b4repc_2IRSgt6yVmBW0cdQV4yPKyyc
echo.
echo Please keep this window OPEN.
echo.
python app.py
pause
