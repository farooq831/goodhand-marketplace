# Video source

These files build `../goodhand-walkthrough.mp4`. They were run from a short folder, `C:/Users/muham/gh-video`, because long Windows paths break `npm install`. Change `DIR` in the scripts if you use a different folder.

1. `npm i puppeteer-core ffmpeg-static`
2. `powershell -File tts.ps1` generates the narration WAVs from `scenes.json`, using the Windows voice. To use a real voice, record your own `audio/<scene-id>.wav` files instead.
3. Start the app locally with the demo seed, then run `node setup.mjs` to stage a booking with chat, a paid request and a dispute.
4. Run `node record.mjs` (or `node record.mjs s05 s09` for selected scenes) to drive Chrome and capture frames per scene.
5. Run `node assemble.mjs` to fit each scene to its narration, add the role badges and burn in the subtitles.
