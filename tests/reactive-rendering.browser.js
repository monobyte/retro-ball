(async()=>{
  const r=window.__retro;
  const {PostFX}=await import(new URL('src/render/PostFX.ts',location.href).href);
  const checks=[];
  for(const id of ['spring-yard','balance-act','borrowed-time']){
    await r.app.loadLevel(id);const g=r.game;r.debug.fixedDt=0;g.audio=null;g.restart();
    for(let i=0;i<360;i++)g.update(1/120);
    const renderer=g.renderer;renderer.viewHeight=23;renderer.updateFrustum();
    const objects=[...g.dynamics.bumpers,...g.dynamics.reactivePlates];
    for(const antialias of [false,true])for(const bloom of [false,true]){
      const post=new PostFX(renderer,{antialias,bloom});
      try{
        const buffer=post.composer.readBuffer,pixels=new Uint16Array(buffer.width*buffer.height*4);
        for(const obstacle of objects){
          const states=obstacle.def.kind==='bumper'?[{phase:'idle',remaining:0},{phase:'charging',remaining:.06},{phase:'cooldown',remaining:.5}]
            :obstacle.def.kind==='seesaw'?[{angle:-.1,angularVelocity:0},{angle:.1,angularVelocity:0}]
            :[{phase:'solid',elapsed:0},{phase:'warning',elapsed:.6},{phase:'absent',elapsed:.6},{phase:'returning',elapsed:.4}];
          for(const state of states){
            obstacle.reset(state);g.dynamics.update(g.physics.simulationTime,0,0,g.ballPosition,3);
            renderer.lookAt(g.ballPosition.clone().set(obstacle.def.x,obstacle.def.y+.5,obstacle.def.z));
            post.render(3,{beat:0,glitch:0,bloomBoost:0});
            renderer.renderer.readRenderTargetPixels(post.composer.readBuffer,0,0,buffer.width,buffer.height,pixels);
            if(pixels.some(value=>(value&0x7c00)===0x7c00))throw Error(`${id}/${obstacle.id}: non-finite HDR state ${JSON.stringify(state)}`);
            if(renderer.renderer.getContext().getError())throw Error(`${id}: WebGL error`);
            checks.push({id,part:obstacle.id,state,antialias,bloom});
          }
        }
      }finally{post.dispose()}
    }
    await r.app.returnToHub();
  }
  return {passed:checks.length,viewport:[innerWidth,innerHeight],devicePixelRatio,checks};
})()
