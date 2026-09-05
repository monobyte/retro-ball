import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { DoorPiece } from '../LevelData';
import type { LevelInstance } from '../../content/LevelDocument';
import type { RuntimeComponent, LogicalValue, VisualFrame } from '../../runtime/Component';
import type { SignalPort, SignalValue } from '../../signals/SignalTypes';
import type { Physics } from '../../physics/Physics';
import { disposeObjects } from '../../runtime/disposeObjects';

/** A lifting barrier that holds still while any dynamic body occupies its travel. */
export class SignalDoor implements RuntimeComponent {
  readonly id: string;
  readonly resetGroup: string;
  readonly group = new THREE.Group();
  readonly panel = new THREE.Group();
  readonly body: RAPIER.RigidBody;
  private open = false;
  private amount = 0;
  private blocked = false;
  private readonly lamp = new THREE.MeshBasicMaterial({color:0xffcc63});
  private disposed = false;
  constructor(readonly def: DoorPiece, instance: LevelInstance, private readonly physics: Physics) {
    this.id=instance.id;this.resetGroup=instance.resetGroup;
    this.body=physics.createKinematicBox(new THREE.Vector3(def.x,def.y+def.h/2,def.z),new THREE.Vector3(def.w,def.h,def.d));
    this.body.collider(0).setFriction(.2);this.body.collider(0).setRestitution(0);
    const geometry=new THREE.BoxGeometry(def.w,def.h,def.d);
    this.panel.add(new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:0x252b48,transparent:true,opacity:.8})));
    this.panel.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry),new THREE.LineBasicMaterial({color:0x75ffe0})));
    for(let i=-1;i<=1;i++) {
      const bar=new THREE.Mesh(new THREE.BoxGeometry(def.w*.14,def.h*.8,def.d+.035),this.lamp);
      bar.position.x=i*def.w*.28;bar.rotation.z=-.25;this.panel.add(bar);
    }
    this.group.add(this.panel);
    const threshold=new THREE.Mesh(new THREE.BoxGeometry(def.w,.025,def.d+.3),new THREE.MeshBasicMaterial({color:0x79674e}));
    threshold.position.set(def.x,def.y+.015,def.z);this.group.add(threshold);
    this.reset(null);
  }
  fixedUpdate(_time: number, dt: number): void {
    const next=THREE.MathUtils.clamp(this.amount+(this.open?1:-1)*dt/this.def.travelTime,0,1);
    this.blocked=false;
    if(next!==this.amount) {
      const d=this.def, a=this.amount*1.4,b=next*1.4;
      // Only the leading edge can trap a body. Side contact must not prevent an
      // opening request while the player is pushing against the closed barrier.
      const edgeY=d.y+(a+b)/2+(this.open?d.h:0);
      this.blocked=this.physics.dynamicOverlap(new THREE.Vector3(d.x,edgeY,d.z),new THREE.Vector3(d.w+.16,Math.abs(b-a)+.16,d.d+.16));
      if(!this.blocked)this.amount=next;
    }
    this.sync(false);
  }
  private sync(immediate: boolean): void {
    const d=this.def,p={x:d.x,y:d.y+d.h/2+this.amount*1.4,z:d.z};
    if(immediate)this.body.setTranslation(p,true);
    this.body.setNextKinematicTranslation(p);this.panel.position.set(p.x,p.y,p.z);
  }
  receiveSignal(port: SignalPort, value: SignalValue): void {
    if(port==='enable' && typeof value==='boolean')this.open=value;
    // Signal reset is a safe close/open request; checkpoint restore below can teleport
    // because authored spawns are validated outside the full doorway.
    if(port==='reset')this.open=this.def.initial==='open';
  }
  visualUpdate(_frame: VisualFrame): void { this.lamp.color.setHex(this.blocked?0xffecb2:this.open?0x75ffe0:0xffcc63);this.sync(false); }
  capture(): LogicalValue { return {open:this.open,amount:this.amount}; }
  reset(state: LogicalValue): void {
    const s=state && typeof state==='object' && !Array.isArray(state)?state:{};
    this.open=typeof s['open']==='boolean'?s['open']:this.def.initial==='open';
    this.amount=typeof s['amount']==='number' && Number.isFinite(s['amount'])?THREE.MathUtils.clamp(s['amount'],0,1):this.open?1:0;
    this.blocked=false;this.sync(true);
  }
  dispose(): void { if(this.disposed)return;this.disposed=true;disposeObjects(this.group);this.physics.removeBody(this.body); }
}
