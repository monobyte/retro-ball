import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const session = process.env.BROWSER_SESSION ?? 'retro-check';
const url = process.env.GAME_URL ?? 'http://127.0.0.1:5173/retro-ball/';
const output = process.env.EVIDENCE_DIR ?? '/tmp/retro-ball-checks';
mkdirSync(output, { recursive: true });
function browser(args, input) {
  const result = spawnSync('agent-browser', ['--session', session, ...args], {
    input, encoding: 'utf8', timeout: 180_000,
  });
  if (result.error || result.status !== 0) throw new Error(result.error?.message ?? result.stderr + result.stdout);
  return result.stdout;
}
function evaluate(script) { return browser(['eval', '--stdin'], script); }
function check(name) {
  const result = evaluate(readFileSync(`tests/${name}.browser.js`, 'utf8'));
  writeFileSync(`${output}/${name}.json`, result);
  console.log(`${name}: ${result}`);
}
console.log(browser(['open', url]));
browser(['wait', '--fn', '!!window.__retro']);
evaluate("window.__retro.app.loadLevel('legacy')");
browser(['press', 'Space']);
for (const [name, ratio] of [['normal', '1'], ['retina', '2']]) {
  browser(['set', 'viewport', '1511', '862', ratio]);
  browser(['reload']); browser(['wait', '--fn', '!!window.__retro']);
  evaluate("window.__retro.app.loadLevel('legacy')"); browser(['press', 'Space']);
  check('rendering');
  writeFileSync(`${output}/rendering-${name}.json`, readFileSync(`${output}/rendering.json`));
}
check('voids');
check('audio');
// Verify persisted choices are reapplied on a real navigation before audio unlock.
evaluate(`document.querySelector('[aria-label="MUSIC OFF"]').click(); document.querySelector('[aria-label="SOUND FX ON"]').click();`);
browser(['reload']); browser(['wait', '--fn', '!!window.__retro']);
evaluate("window.__retro.app.loadLevel('legacy')");
evaluate(`(() => { const a=window.__retro.game.audio; if (a.musicEnabled !== false || a.soundFxEnabled !== true) throw new Error('Reload lost audio preferences'); return 'Reload passed'; })()`);
check('course');
browser(['wait', '--fn', 'window.__retro.autopilot.done']);
const completion = evaluate(`(() => { const r=window.__retro, s=r.autopilot.status(); if(s.failed || r.game.state !== 'win') throw new Error(JSON.stringify(s)); r.debug.fixedDt=0; return s; })()`);
writeFileSync(`${output}/completion.json`, completion);
console.log(completion);
browser(['set', 'viewport', '1280', '800', '1']);
evaluate('window.__retro.game.renderer.setPixelRatioCap(1)');
browser(['screenshot', `${output}/completed-course.png`]);
browser(['press', 'Space']);
check('lifecycle');
check('movement');
check('camera-contacts');
browser(['screenshot', `${output}/relay-menu.png`]);
console.log(`Evidence: ${output}`);
