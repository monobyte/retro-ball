import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { tokenMarker } from './PuzzleToken';
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PressurePlatePiece } from '../LevelData';
import type { LevelInstance } from '../../content/LevelDocument';
import type { RuntimeComponent, LogicalValue, VisualFrame } from '../../runtime/Component';
import type { SignalPort, SignalValue } from '../../signals/SignalTypes';
import type { Physics } from '../../physics/Physics';
import { PressureAction } from '../../signals/PuzzleLogic';
import { disposeObjects } from '../../runtime/disposeObjects';

export class PressurePlate implements RuntimeComponent {
  readonly id: string;
  readonly resetGroup: string;
  readonly group = new THREE.Group();
  readonly body: RAPIER.RigidBody;
  readonly action: PressureAction;
  private readonly face: THREE.Mesh;
  private readonly marks = new THREE.Group();
  private readonly lamp = new THREE.MeshBasicMaterial({color:0xffcc63});
  private disposed = false;
  constructor(readonly def: PressurePlatePiece, instance: LevelInstance, private readonly physics: Physics) {
    this.id=instance.id;this.resetGroup=instance.resetGroup;
    this.action=new PressureAction(def.mode,def.duration);
    const points: THREE.Vector3[]=[];
    for(const x of [-1,1])for(const z of [-1,1]){points.push(new THREE.Vector3(x*def.w/2,-.035,z*def.d/2),new THREE.Vector3(x*(def.w/2-.55),.035,z*(def.d/2-.55)))}
    this.body=physics.createKinematicHull(new THREE.Vector3(def.x,def.y+.035,def.z),points);
    this.body.collider(0).setRestitution(0);
    this.group.position.set(def.x,def.y,def.z);
    this.face=new THREE.Mesh(new ConvexGeometry(points),new THREE.MeshBasicMaterial({color:0x3b304f}));
    this.face.position.y=.035;this.group.add(this.face);
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(this.face.geometry),new THREE.LineBasicMaterial({color:0xffcc63}));
    outline.position.y=.04;this.group.add(outline);
    // Four inward teeth distinguish a contact plate from an interact switch.
    for (const side of [-1,1]) {
      const x=new THREE.Mesh(new THREE.BoxGeometry(.35,.025,.12),this.lamp);x.position.set(side*def.w*.32,.09,0);this.marks.add(x);
      const z=new THREE.Mesh(new THREE.BoxGeometry(.12,.025,.35),this.lamp);z.position.set(0,.09,side*def.d*.32);this.marks.add(z);
    }
    if(def.match && def.match!=='any'){const marker=tokenMarker(def.match,.35);marker.position.y=.085;this.marks.add(marker)}
    const icon=new THREE.Mesh(new THREE.TorusGeometry(.3,.05,6,def.mode==='toggle'?4:24),this.lamp);
    icon.rotation.x=-Math.PI/2;icon.position.y=.09;if(!def.match || def.match==='any')this.marks.add(icon);else{icon.geometry.dispose()}this.group.add(this.marks);
  }
  fixedUpdate(_time: number, dt: number): void {
    const d=this.def;
    const held=this.physics.contactBodies(this.body.collider(0)).some(body=>{
      if(d.match && d.match!=='any' && this.physics.token(body)!==d.match)return false;
      const p=body.translation();
      return p.y>d.y+.07 && Math.abs(p.x-d.x)<d.w/2 && Math.abs(p.z-d.z)<d.d/2;
    });
    this.action.update(held,dt);
  }
  stateOutputs(): { active: boolean } { return {active:this.action.active}; }
  takePulses(): SignalPort[] { return this.action.takeActivated()?['activated']:[]; }
  receiveSignal(port: SignalPort, _value: SignalValue): void {
    // Reset the latch without fabricating a new contact edge under existing weight.
    if (port==='reset') { const held=this.action.held;this.action.reset({held}); }
  }
  visualUpdate(_frame: VisualFrame): void {
    this.lamp.color.setHex(this.action.active?0x75ffe0:0xffcc63);
    this.marks.scale.set(this.action.held?.8:1,1,this.action.held?.8:1);
    if(this.def.mode==='timed' && this.action.active) this.marks.rotation.y=(1-this.action.remaining/this.def.duration)*Math.PI*2;
    else this.marks.rotation.y=0;
  }
  capture(): LogicalValue { return this.action.capture(); }
  reset(state: LogicalValue): void { this.action.reset(state && typeof state==='object' && !Array.isArray(state)?state:undefined); }
  dispose(): void { if(this.disposed)return;this.disposed=true;disposeObjects(this.group);this.physics.removeBody(this.body); }
}
