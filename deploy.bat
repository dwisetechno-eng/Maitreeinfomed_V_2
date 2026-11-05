@echo off
setlocal enabledelayedexpansion

echo ==========================================
echo  MAITREE INFOMED - BUILD & DEPLOY PIPELINE
echo ==========================================
echo.

:: Step 1: Run Next.js Production Build to check for errors
echo [1/4] Running Next.js build check...
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Build failed! Please fix the TypeScript/Lint errors above before pushing.
    pause
    exit /b %errorlevel%
)
echo [SUCCESS] Build passed cleanly!
echo.

:: Step 2: Stage all changes
echo [2/4] Staging local changes (git add .)...
git add .
echo.

:: Step 3: Commit changes with dynamic or default message
set /p commit_msg="Enter git commit message (Press Enter for default 'App update and bug fixes'): "
if "!commit_msg!"=="" set commit_msg=App update and bug fixes

echo Committing with message: "!commit_msg!"
git commit -m "!commit_msg!"
echo.

:: Step 4: Push to GitHub (triggers Vercel deployment)
echo [4/4] Pushing to GitHub (origin main)...
git push origin main
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Push failed. Check your remote connection or branch name.
    pause
    exit /b %errorlevel%
)

echo.
echo ==========================================
echo  DEPLOYMENT TRIGGERED SUCCESSFULLY! 🚀
echo  Vercel will build and deploy your changes.
echo ==========================================
pause