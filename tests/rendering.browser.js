// Run against the Vite dev page with agent-browser eval --stdin < tests/rendering.browser.js.
// Read HDR pixels directly: WebGL reports no error for NaNs, and bloom can
// turn a handful of invalid beam pixels into a large rectangle on screen.
(async () => {
  const { PostFX } = await import(new URL('src/render/PostFX.ts', location.href).href);
  const { LEVEL } = await import(new URL('src/game/LevelData.ts', location.href).href);
  const retro = window.__retro;
  if (!retro) throw new Error('Open the Vite development build first.');
  const r = retro.game.renderer;
  const savedTarget = r.target.clone();
  const savedHeight = r.viewHeight;
  const savedRenderTarget = r.renderer.getRenderTarget();
  const positions = LEVEL.pieces.filter(p => ['checkpoint', 'elevator', 'goal'].includes(p.kind));
  const results = [];
  r.viewHeight = 23;
  r.updateFrustum();

  function assertFinite(target, pixels, label) {
    r.renderer.readRenderTargetPixels(target, 0, 0, target.width, target.height, pixels);
    let invalid = 0;
    // IEEE 754 half floats: an all-ones exponent means infinity or NaN.
    for (const value of pixels) if ((value & 0x7c00) === 0x7c00) invalid++;
    if (invalid) throw new Error(`${label}: ${invalid} non-finite HDR components`);
    const error = r.renderer.getContext().getError();
    if (error) throw new Error(`${label}: WebGL error ${error}`);
  }

  try {
    for (const antialias of [false, true]) {
      for (const bloom of [false, true]) {
        const post = new PostFX(r, { antialias, bloom });
        try {
          const buffer = post.composer.readBuffer;
          const pixels = new Uint16Array(buffer.width * buffer.height * 4);
          for (const p of positions) {
            const label = `${p.kind} ${p.id ?? ''} at ${p.x},${p.z}; AA=${antialias}, bloom=${bloom}`;
            r.lookAt(savedTarget.clone().set(p.x, (p.y ?? p.y0) + 0.6, p.z));
            const target = post.composer.readBuffer;
            r.renderer.setRenderTarget(target);
            r.renderer.render(r.scene, r.camera);
            r.renderer.setRenderTarget(null);
            assertFinite(target, pixels, `${label} scene`);
            post.render(30, { beat: 0, glitch: 0, bloomBoost: 0 });
            assertFinite(post.composer.readBuffer, pixels, `${label} post-processing`);
            results.push(label);
          }
        } finally {
          post.dispose();
        }
      }
    }
  } finally {
    r.viewHeight = savedHeight;
    r.updateFrustum();
    r.lookAt(savedTarget);
    r.renderer.setRenderTarget(savedRenderTarget);
  }
  return { passed: results.length, checks: results };
})()
