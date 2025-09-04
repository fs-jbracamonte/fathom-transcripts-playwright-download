PRE-BUNDLING BROWSERS (Option B)
================================

To pre-bundle Playwright browsers with your application:

1. First, ensure browsers are downloaded:
   npm run prepare-build

2. The browsers will be bundled from one of these locations:
   - Windows: %LOCALAPPDATA%\ms-playwright
   - macOS: ~/Library/Caches/ms-playwright
   - Linux: ~/.cache/ms-playwright

3. If browsers are not found during build, you may need to:
   - Manually copy the chromium-* folder to the build directory
   - Or modify package.json extraResources to point to the correct location

4. The bundled app will be ~300-400MB larger but won't require download on first run.

Note: For cross-platform builds, you may need to bundle browsers separately for each platform.
