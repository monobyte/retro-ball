(async()=>{
 const r=window.__retro,{PostFX}=await import(new URL('src/render/PostFX.ts',location.href).href),checks=[];
 for(const id of ['symbol-yard','impulse-vault']){
  await r.app.loadLevel(id);const g=r.game;r.debug.fixedDt=0;g.audio=null;g.restart();for(let i=0;i<240;i++)g.update(1/120);
  const renderer=g.renderer;renderer.viewHeight=22;renderer.updateFrustum();
  const parts=g.dynamics.components.filter(c=>['pushable','pressure','momentum'].includes(c.def?.kind));
  for(const antialias of [false,true])for(const bloom of [false,true]){
   const post=new PostFX(renderer,{antialias,bloom});
   try{
    const buffer=post.composer.readBuffer,pixels=new Uint16Array(buffer.width*buffer.height*4);
    for(const part of parts){
     const base=part.capture(),states=part.def.kind==='pushable'?[{...base,phase:'live',remaining:0},{...base,phase:'recovering',remaining:1}]:part.def.kind==='pressure'?[{active:false,held:false,remaining:0},{active:true,held:true,remaining:0}]:[{active:false,momentum:0},{active:false,momentum:part.def.threshold*.6},{active:true,momentum:part.def.threshold*1.5}];
     for(const state of states){
      part.reset(state);g.dynamics.update(g.physics.simulationTime,0,0,g.ballPosition,3);
      renderer.lookAt(g.ballPosition.clone().set(part.def.x,part.def.y+.5,part.def.z));post.render(3,{beat:0,glitch:0,bloomBoost:0});
      renderer.renderer.readRenderTargetPixels(post.composer.readBuffer,0,0,buffer.width,buffer.height,pixels);
      if(pixels.some(value=>(value&0x7c00)===0x7c00))throw Error(`${id}/${part.id}: non-finite HDR ${JSON.stringify(state)}`);
      if(renderer.renderer.getContext().getError())throw Error(`${id}: WebGL error`);
      checks.push({id,part:part.id,state,antialias,bloom});
     }
    }
   }finally{post.dispose()}
  }
  await r.app.returnToHub();
 }
 return {passed:checks.length,viewport:[innerWidth,innerHeight],devicePixelRatio,checks};
})()
