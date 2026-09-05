import type { SignalPort, SignalValue } from '../../signals/SignalTypes';
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { DIR_VEC, type ReactivePlatePiece } from '../LevelData';
import { gridBoxGeometry } from '../Level';
import { GridMaterial, TONES } from '../../render/GridMaterial';
import type { LevelInstance } from '../../content/LevelDocument';
import type { RuntimeComponent, LogicalValue, VisualFrame } from '../../runtime/Component';
import type { Physics, BallHandles } from '../../physics/Physics';
import { disposeObjects } from '../../runtime/disposeObjects';
import { FloorCycle, type FloorPhase } from './FloorCycle.ts';

/** Weight-responsive seesaws and floors with reversible, checkpoint-owned state. */
export class ReactivePlate implements RuntimeComponent {
  readonly id: string;
  readonly resetGroup: string;
  readonly group = new THREE.Group();
  readonly deck = new THREE.Group();
  readonly body: RAPIER.RigidBody;
  readonly material = new GridMaterial(TONES.pink, .95);
  readonly cycle: FloorCycle | null;
  private angle = 0;
  private angularVelocity = 0;
  private load = 0;
  private readonly origin: THREE.Vector3;
  private readonly orientation = new THREE.Quaternion();
  private readonly next = new THREE.Vector3();
  private readonly stripes: THREE.Mesh[] = [];
  private readonly markerMaterial = new THREE.MeshBasicMaterial({ color: 0xffd064, transparent: true, opacity: .9 });
  private readonly outline: THREE.LineSegments;
  private disposed = false;

  constructor(readonly def: ReactivePlatePiece, instance: LevelInstance, private readonly physics: Physics) {
    this.id = instance.id; this.resetGroup = instance.resetGroup;
    this.origin = new THREE.Vector3(def.x, def.y - .2, def.z);
    this.body = physics.createKinematicBox(this.origin, new THREE.Vector3(def.w, .4, def.d), true);
    this.body.collider(0).setFriction(2); this.body.collider(0).setRestitution(.05);
    this.cycle = def.kind === 'fragile' ? new FloorCycle(def.warning, def.recovery) : null;
    const geometry = gridBoxGeometry(new THREE.Vector3(def.w, .4, def.d));
    this.deck.add(new THREE.Mesh(geometry, this.material));
    this.group.add(this.deck);
    const points = [new THREE.Vector3(-def.w/2, .025, -def.d/2), new THREE.Vector3(def.w/2, .025, -def.d/2), new THREE.Vector3(def.w/2, .025, def.d/2), new THREE.Vector3(-def.w/2, .025, def.d/2)];
    const segments = points.flatMap((p,i)=>[...p.toArray(), ...points[(i+1)%4]!.toArray()]);
    this.outline = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(segments,3)), new THREE.LineBasicMaterial({color:0xffd064}));
    this.outline.position.set(def.x,def.y,def.z); this.group.add(this.outline);
    if (def.kind === 'seesaw') {
      const hinge = new THREE.Mesh(new THREE.BoxGeometry(def.axis === 'x' ? def.w : .18, .04, def.axis === 'z' ? def.d : .18), this.markerMaterial);
      hinge.position.y = .23; this.deck.add(hinge);
      // Two balanced load marks make the pivot legible without colour alone.
      for (const side of [-1,1]) {
        const mark = new THREE.Mesh(new THREE.BoxGeometry(.7,.025,.7),this.markerMaterial);
        mark.position.set(def.axis==='z'?side*def.w*.3:0,.23,def.axis==='x'?side*def.d*.3:0); this.deck.add(mark);
      }
    } else {
      // Four broad bars drain in sequence during the warning window.
      for (let i=0;i<4;i++) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(def.w*.65,.03,Math.min(.25,def.d/12)),this.markerMaterial);
        stripe.position.set(0,.23,(i-1.5)*def.d/5);this.stripes.push(stripe);this.deck.add(stripe);
      }
    }
    this.sync(true);
  }
  contact(ball: BallHandles, ground: RAPIER.Collider | null): void {
    if (ground?.handle !== this.body.collider(0).handle) return;
    if (this.cycle) this.cycle.touch();
    else if (this.def.kind === 'seesaw') {
      const p = ball.body.translation();
      this.load = THREE.MathUtils.clamp((this.def.axis === 'z' ? -(p.x-this.def.x)/this.def.w : (p.z-this.def.z)/this.def.d)*2,-1,1);
    }
  }
  private clearForReturn(): boolean {
    const d=this.def;
    return !this.physics.dynamicOverlap(new THREE.Vector3(d.x,d.y-.2,d.z),new THREE.Vector3(d.w+.1,.6,d.d+.1));
  }

  fixedUpdate(_time: number, dt: number): void {
    for(const body of this.physics.contactBodies(this.body.collider(0))) {
      if(!this.physics.token(body))continue;
      const p=body.translation();if(p.y<this.body.translation().y)continue;
      if(this.cycle)this.cycle.touch();
      else if(this.def.kind==='seesaw')this.load+=(this.def.axis==='z'?-(p.x-this.def.x)/this.def.w:(p.z-this.def.z)/this.def.d)*2*body.mass();
    }
    this.load=THREE.MathUtils.clamp(this.load,-1,1);
    if (this.def.kind==='seesaw') {
      const target=this.load*this.def.maxTilt*Math.PI/180;
      this.angularVelocity += ((target-this.angle)*this.def.response*this.def.response - 2*this.def.response*this.angularVelocity)*dt;
      this.angularVelocity=THREE.MathUtils.clamp(this.angularVelocity,-.6,.6);
      this.angle=THREE.MathUtils.clamp(this.angle+this.angularVelocity*dt,-this.def.maxTilt*Math.PI/180,this.def.maxTilt*Math.PI/180);
      this.load=0;
    } else this.cycle!.tick(dt,this.clearForReturn());
    this.sync(false);
  }
  private sync(immediate: boolean): void {
    this.next.copy(this.origin);this.orientation.identity();
    if (this.def.kind==='seesaw') this.orientation.setFromAxisAngle(new THREE.Vector3(this.def.axis==='x'?1:0,0,this.def.axis==='z'?1:0),this.angle);
    else {
      const state=this.cycle!.state;
      const withdrawn=state.phase==='absent'?Math.min(1,state.elapsed/.5):state.phase==='returning'?Math.max(0,1-state.elapsed/.6):0;
      if (this.def.mode==='drop') this.next.y-=withdrawn*3;
      else { const [x,z]=DIR_VEC[this.def.dir];this.next.addScaledVector(new THREE.Vector3(x,0,z),withdrawn*((x?this.def.w:this.def.d)+1.5)); }
      this.body.collider(0).setEnabled(state.phase==='solid'||state.phase==='warning');
    }
    if(immediate){this.body.setTranslation(this.next,true);this.body.setRotation(this.orientation,true)}
    this.body.setNextKinematicTranslation(this.next);this.body.setNextKinematicRotation(this.orientation);
  }
  visualUpdate(frame: VisualFrame): void {
    const p=this.body.translation(),q=this.body.rotation();this.deck.position.set(p.x,p.y,p.z);this.deck.quaternion.set(q.x,q.y,q.z,q.w);
    this.material.setFrame(frame.presentationTime,frame.beat,frame.marblePosition);
    if(this.def.kind==='fragile'){
      const s=this.cycle!.state,solid=s.phase==='solid'||s.phase==='warning';
      // Once withdrawn, retain only the original rim. A visible lower deck
      // would imply that it can still catch a falling marble.
      this.deck.visible = s.phase !== 'absent' || s.elapsed < .5;
      this.material.depthWrite = solid;
      this.material.uniforms['uOpacity']!.value = solid ? .95 : s.phase === 'absent' ? .95 * Math.max(0, 1-s.elapsed/.5) : .18;
      this.markerMaterial.color.setHex(s.phase==='warning'?0xff6a5e:s.phase==='returning'?0x73ffe0:0xffd064);
      const remaining=s.phase==='warning'?1-s.elapsed/this.def.warning:1;
      this.stripes.forEach((stripe,i)=>{stripe.visible=!solid||i<Math.ceil(remaining*4)});
      this.markerMaterial.opacity = solid ? .9 : .35;
    }
  }
  receiveSignal(port: SignalPort, _value: SignalValue): void {
    if(port!=='reset')return;
    if(this.cycle && !this.body.collider(0).isEnabled() && !this.clearForReturn()){this.cycle.reset({phase:'returning',elapsed:.6});this.sync(false)}
    else this.reset(null);
  }
  capture(): LogicalValue { return this.cycle ? {phase:this.cycle.state.phase,elapsed:this.cycle.state.elapsed} : {angle:this.angle,angularVelocity:this.angularVelocity}; }
  reset(state: LogicalValue): void {
    const s=state&&typeof state==='object'&&!Array.isArray(state)?state:{};
    const value=(key:string)=>typeof s[key]==='number'&&Number.isFinite(s[key])?s[key] as number:0;
    this.load=0;
    if(this.cycle)this.cycle.reset({phase:['solid','warning','absent','returning'].includes(String(s['phase']))?s['phase'] as FloorPhase:'solid',elapsed:Math.max(0,value('elapsed'))});
    else if(this.def.kind==='seesaw'){this.angle=THREE.MathUtils.clamp(value('angle'),-this.def.maxTilt*Math.PI/180,this.def.maxTilt*Math.PI/180);this.angularVelocity=THREE.MathUtils.clamp(value('angularVelocity'),-.6,.6)}
    this.sync(true);
  }
  dispose(): void {if(this.disposed)return;this.disposed=true;disposeObjects(this.group);this.physics.removeBody(this.body)}
}
