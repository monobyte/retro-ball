import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { MomentumPiece } from '../LevelData';
import type { LevelInstance } from '../../content/LevelDocument';
import type { RuntimeComponent, LogicalValue, VisualFrame } from '../../runtime/Component';
import type { SignalPort, SignalValue } from '../../signals/SignalTypes';
import type { Physics } from '../../physics/Physics';
import { tokenMarker } from './PuzzleToken';
import { disposeObjects } from '../../runtime/disposeObjects';

/** Only a new physical impact with sufficient inward momentum can latch this receiver. */
export class MomentumReceiver implements RuntimeComponent {
  readonly id: string;
  readonly resetGroup: string;
  readonly group=new THREE.Group();
  readonly body: RAPIER.RigidBody;
  private active=false;
  private pulse=false;
  private momentum=0;
  private contacts=new Set<number>();
  private settleSteps=2;
  private readonly bars: THREE.Mesh[]=[];
  private readonly lamp=new THREE.MeshBasicMaterial({color:0xffcc63});
  private disposed=false;
  constructor(readonly def: MomentumPiece,instance:LevelInstance,private readonly physics:Physics) {
    this.id=instance.id;this.resetGroup=instance.resetGroup;
    this.body=physics.createFixedCylinder(new THREE.Vector3(def.x,def.y+.6,def.z),def.radius,1.2);
    this.group.position.set(def.x,def.y,def.z);
    const base=new THREE.Mesh(new THREE.CylinderGeometry(def.radius,def.radius,1.2,16),new THREE.MeshBasicMaterial({color:0x302742}));base.position.y=.6;this.group.add(base);
    for(let i=0;i<4;i++) {
      const ring=new THREE.Mesh(new THREE.TorusGeometry(def.radius+.035,.045,5,24),this.lamp);ring.rotation.x=-Math.PI/2;ring.position.y=.2+i*.25;this.bars.push(ring);this.group.add(ring);
    }
    if(def.match && def.match!=='any'){const marker=tokenMarker(def.match,def.radius*.5);marker.position.y=1.23;this.group.add(marker)}
  }
  stateOutputs(): {active:boolean} { return {active:this.active}; }
  takePulses(): SignalPort[] { const pulse=this.pulse;this.pulse=false;return pulse?['activated']:[]; }
  fixedUpdate(_time:number,_dt:number):void {
    const bodies=this.physics.contactBodies(this.body.collider(0)),next=new Set<number>();
    if(this.settleSteps>0){this.settleSteps--;this.contacts=new Set(bodies.map(body=>body.handle));return;}
    for(const body of bodies) {
      next.add(body.handle);if(this.contacts.has(body.handle)||this.active)continue;
      if(this.def.match && this.def.match!=='any' && this.physics.token(body)!==this.def.match)continue;
      const p=body.translation(),v=this.physics.incomingVelocity(body),dx=p.x-this.def.x,dz=p.z-this.def.z,length=Math.hypot(dx,dz);
      // Vertical landings and sideways rubbing cannot masquerade as a frontal hit.
      if(length<.01 || p.y>this.def.y+1.2)continue;
      this.momentum=Math.max(0,-(v.x*dx+v.z*dz)/length)*body.mass();
      if(this.momentum>=this.def.threshold){this.active=true;this.pulse=true}
    }
    this.contacts=next;
  }
  visualUpdate(_frame:VisualFrame):void {
    const count=this.active?4:Math.floor(Math.min(1,this.momentum/this.def.threshold)*4);
    this.lamp.color.setHex(this.active?0x75ffe0:0xffcc63);
    this.bars.forEach((bar,i)=>{bar.visible=i<count || i===0;bar.scale.setScalar(this.active?1.08:1)});
  }
  receiveSignal(port:SignalPort,_value:SignalValue):void {if(port==='reset')this.reset(null)}
  capture():LogicalValue {return {active:this.active,momentum:this.momentum}}
  reset(state:LogicalValue):void {
    const s=state && typeof state==='object' && !Array.isArray(state)?state:{};
    this.active=s['active']===true;this.momentum=typeof s['momentum']==='number'&&Number.isFinite(s['momentum'])?Math.max(0,s['momentum']):0;this.pulse=false;this.contacts.clear();this.settleSteps=2;
  }
  dispose():void {if(this.disposed)return;this.disposed=true;disposeObjects(this.group);this.physics.removeBody(this.body)}
}
