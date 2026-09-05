(async()=>{
 const r=window.__retro,{PostFX}=await import(new URL('src/render/PostFX.ts',location.href).href),checks=[],clues=[];
 for(const id of ['two-factor','ordered-garden']){
  await r.app.loadLevel(id);const g=r.game;r.debug.fixedDt=0;g.audio=null;g.restart();for(let i=0;i<360;i++)g.update(1/120);
  const renderer=g.renderer;renderer.viewHeight=21;renderer.updateFrustum();
  const parts=g.dynamics.components.filter(c=>['pressure','door','logic','sequence'].includes(c.def?.kind));
  for(const antialias of [false,true])for(const bloom of [false,true]){
   const post=new PostFX(renderer,{antialias,bloom});
   try{
    const buffer=post.composer.readBuffer,pixels=new Uint16Array(buffer.width*buffer.height*4);
    for(const part of parts){
     const states=part.def.kind==='pressure'?[{active:false,held:false,remaining:0},{active:true,held:true,remaining:4}]:part.def.kind==='door'?[{open:false,amount:0},{open:true,amount:.5},{open:true,amount:1}]:part.def.kind==='logic'?[{a:false,b:false},{a:true,b:false},{a:true,b:true}]:[0,1,2,3].map(progress=>({progress,remaining:progress===0||progress===3?0:10}));
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
  // An always-finite frame can still hide every clue behind scene depth.
  // Compare the centre of each actual clue with and without its rendered label.
  const sprites=[];g.dynamics.group.traverse(o=>{if(o.isSprite)sprites.push(o)});
  const post=new PostFX(renderer,{antialias:true,bloom:true});
  try{
   const buffer=post.composer.readBuffer,a=new Uint16Array(buffer.width*buffer.height*4),b=new Uint16Array(a.length);
   for(const sprite of sprites){
    renderer.lookAt(sprite.getWorldPosition(g.ballPosition.clone()));
    const draw=out=>{post.render(3,{beat:0,glitch:0,bloomBoost:0});renderer.renderer.readRenderTargetPixels(post.composer.readBuffer,0,0,buffer.width,buffer.height,out)};
    draw(a);sprite.visible=false;draw(b);sprite.visible=true;
    const hw=Math.max(2,Math.floor(sprite.scale.x*buffer.height/renderer.viewHeight/4)),hh=Math.max(2,Math.floor(sprite.scale.y*buffer.height/renderer.viewHeight/4));
    let changed=0,total=0;
    for(let y=Math.floor(buffer.height/2)-hh;y<buffer.height/2+hh;y++)for(let x=Math.floor(buffer.width/2)-hw;x<buffer.width/2+hw;x++){
     const i=(y*buffer.width+x)*4;total++;if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>100)changed++;
    }
    const ratio=changed/total;if(ratio<.5)throw Error(`${id}: clue obscured by scene depth (${ratio})`);
    clues.push({id,position:sprite.position.toArray(),visiblePixelRatio:ratio});
   }
  }finally{post.dispose()}
  await r.app.returnToHub();
 }
 return {passed:checks.length,viewport:[innerWidth,innerHeight],devicePixelRatio,checks,clues};
})()
