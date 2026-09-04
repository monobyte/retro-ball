import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const session=process.env.BROWSER_SESSION ?? 'retro-check';
const output=process.env.EVIDENCE_DIR ?? '/tmp/retro-ball-checks';
mkdirSync(output,{recursive:true});
function run(args,input) {
  const result=spawnSync('agent-browser',['--session',session,...args],{input,encoding:'utf8',timeout:180_000});
  if(result.error || result.status!==0) throw new Error(result.error?.message ?? result.stderr+result.stdout);
  return result.stdout;
}
run(['open',process.env.GAME_URL ?? 'http://127.0.0.1:5173/retro-ball/']);
run(['wait','--fn','!!window.__retro']);
run(['eval','--stdin'],"window.__retro.app.loadLevel('legacy')");
for(const ratio of ['1','2']) {
  run(['set','viewport','1511','862',ratio]);
  run(['reload']); run(['wait','--fn','!!window.__retro']);
  run(['eval','--stdin'],"window.__retro.app.loadLevel('legacy')");
  const result=run(['eval','--stdin'],readFileSync('tests/performance.browser.js','utf8'));
  writeFileSync(`${output}/performance-dpr${ratio}.json`,result);
  console.log(`Recorded DPR ${ratio}: ${output}/performance-dpr${ratio}.json`);
}
