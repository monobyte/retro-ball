import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PushObjectPiece } from '../LevelData';
import type { LevelInstance, Vec3 } from '../../content/LevelDocument';
import type { RuntimeComponent, LogicalValue, VisualFrame } from '../../runtime/Component';
import type { SignalPort, SignalValue } from '../../signals/SignalTypes';
import type { Physics } from '../../physics/Physics';
import { tokenMarker, TOKEN_COLORS } from './PuzzleToken';
import { disposeObjects } from '../../runtime/disposeObjects';

/** A true dynamic body, with a clear home beacon and a safe, repeatable recall. */
export class PushObject implements RuntimeComponent {
  readonly id: string;
  readonly resetGroup: string;
  readonly group = new THREE.Group();
  readonly object = new THREE.Group();
  readonly home: THREE.Vector3;
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  private readonly ghost: THREE.LineSegments;
  private phase: 'live'|'recovering' = 'live';
  private remaining = 0;
  private disposed = false;
  constructor(readonly def: PushObjectPiece, instance: LevelInstance, private readonly physics: Physics, private readonly fallY: number) {
    this.id=instance.id;this.resetGroup=instance.resetGroup;
    this.home=new THREE.Vector3(def.x,def.y+def.size/2+.12,def.z);
    const handles=physics.createPushable(this.home,def.size,def.mass,def.shape,def.token);
    this.body=handles.body;this.collider=handles.collider;
    const geometry=def.shape==='cube'?new THREE.BoxGeometry(def.size,def.size,def.size):new THREE.SphereGeometry(def.size/2,24,16);
    this.object.add(new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:TOKEN_COLORS[def.token],transparent:true,opacity:.6})));
    this.object.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry),new THREE.LineBasicMaterial({color:TOKEN_COLORS[def.token]})));
    // Identical glyphs on every cube face remain legible after a tumble.
    for(const direction of [new THREE.Vector3(0,1,0),new THREE.Vector3(0,-1,0),new THREE.Vector3(1,0,0),new THREE.Vector3(-1,0,0),new THREE.Vector3(0,0,1),new THREE.Vector3(0,0,-1)]) {
      const marker=tokenMarker(def.token,def.size*.22);
      marker.position.copy(direction).multiplyScalar(def.size/2+.015);
      marker.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction);this.object.add(marker);
    }
    this.group.add(this.object);
    this.ghost=new THREE.LineSegments(new THREE.EdgesGeometry(geometry),new THREE.LineBasicMaterial({color:TOKEN_COLORS[def.token],transparent:true,opacity:.5}));
    this.ghost.position.copy(this.home);this.group.add(this.ghost);
    const beacon=tokenMarker(def.token,def.size*.65);beacon.position.set(def.x,def.y+.035,def.z);this.group.add(beacon);
    this.sync();
  }
  canRecall(): boolean { const p=this.body.translation();return this.phase==='live' && Math.hypot(p.x-this.home.x,p.y-this.home.y,p.z-this.home.z)>.4; }
  requestRecovery(): void {
    if(this.phase==='recovering')return;
    this.phase='recovering';this.remaining=this.def.recoveryDelay;this.body.setEnabled(false);this.sync();
  }
  /** A saved object must never occupy the marble's checkpoint respawn volume. */
  protectSpawn(spawn: Vec3): void {
    const p=this.body.translation(),extent=this.def.shape==='orb'?this.def.size/2:this.def.size*Math.sqrt(3)/2;
    if(this.phase==='live' && Math.hypot(p.x-spawn.x,p.y-spawn.y,p.z-spawn.z)<extent+.6)this.requestRecovery();
  }
  fixedUpdate(_time: number, dt: number): void {
    if(this.phase==='live') {
      const p=this.body.translation();
      if(p.y<this.fallY || !Number.isFinite(p.x+p.y+p.z))this.requestRecovery();
      // CCD handles contacts; the cap prevents unbounded solver energy in mixed rooms.
      const v=this.body.linvel(),speed=Math.hypot(v.x,v.y,v.z);
      if(speed>28)this.body.setLinvel({x:v.x*28/speed,y:v.y*28/speed,z:v.z*28/speed},true);
    } else {
      this.remaining=Math.max(0,this.remaining-dt);
      const size=this.def.size+.12;
      if(this.remaining===0 && !this.physics.occupied(this.home,new THREE.Vector3(size,size,size),false,this.body)) {
        this.physics.resetBall(this,this.home);this.body.setGravityScale(1,true);this.body.setEnabled(true);this.phase='live';
      }
    }
  }
  private sync(): void {
    const p=this.body.translation(),q=this.body.rotation();this.object.position.set(p.x,p.y,p.z);this.object.quaternion.set(q.x,q.y,q.z,q.w);
    this.object.visible=this.phase==='live';this.ghost.visible=this.phase==='recovering';
    this.ghost.rotation.y=this.phase==='recovering'?this.remaining*Math.PI:0;
  }
  visualUpdate(_frame: VisualFrame): void { this.sync(); }
  receiveSignal(port: SignalPort, _value: SignalValue): void { if(port==='reset')this.requestRecovery(); }
  capture(): LogicalValue {
    return {phase:this.phase,remaining:this.remaining,position:{...this.body.translation()},rotation:{...this.body.rotation()},velocity:{...this.body.linvel()},angularVelocity:{...this.body.angvel()}};
  }
  reset(state: LogicalValue): void {
    const s=state && typeof state==='object' && !Array.isArray(state)?state:{};
    const vector=(key:string,fallback:Vec3):Vec3=>{
      const v=s[key];if(!v || typeof v!=='object' || Array.isArray(v))return fallback;
      return ['x','y','z'].every(k=>typeof v[k]==='number'&&Number.isFinite(v[k]))?v as unknown as Vec3:fallback;
    };
    const p=vector('position',this.home),v=vector('velocity',{x:0,y:0,z:0}),av=vector('angularVelocity',{x:0,y:0,z:0});
    const q=s['rotation'];let rotation=new THREE.Quaternion();
    if(q && typeof q==='object' && !Array.isArray(q) && ['x','y','z','w'].every(k=>typeof q[k]==='number'&&Number.isFinite(q[k])))rotation.set(q['x'] as number,q['y'] as number,q['z'] as number,q['w'] as number).normalize();
    this.phase=s['phase']==='recovering'?'recovering':'live';
    this.remaining=typeof s['remaining']==='number' && Number.isFinite(s['remaining'])?THREE.MathUtils.clamp(s['remaining'],0,this.def.recoveryDelay):0;
    this.body.setTranslation(p,true);this.body.setRotation(rotation,true);this.body.setLinvel(v,true);this.body.setAngvel(av,true);this.body.setGravityScale(1,true);this.body.setEnabled(this.phase==='live');this.sync();
  }
  dispose(): void { if(this.disposed)return;this.disposed=true;disposeObjects(this.group);this.physics.removeBody(this.body); }
}
