import type { Piece } from '../game/LevelData.ts';
import { isMovingPiece, movingBounds } from './MovingBounds.ts';
export interface ObstacleBounds { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number; radius?: number }
/** Physical/trigger extents used by editor diagnostics; moving pieces include their sweep. */
export function obstacleBounds(p: Piece): ObstacleBounds | null {
  if (isMovingPiece(p)) return movingBounds(p);
  const box = (w: number, d: number, minY: number, maxY: number): ObstacleBounds => ({ minX:p.x-w/2,maxX:p.x+w/2,minZ:p.z-d/2,maxZ:p.z+d/2,minY,maxY });
  switch (p.kind) {
    case 'laser': return box(p.axis==='x'?p.length+.24:2*Math.abs(p.sweep)+.24,p.axis==='z'?p.length+.24:2*Math.abs(p.sweep)+.24,p.y+.38,p.y+.62);
    case 'elevator': return box(p.w,p.d,p.y0-(p.y1-p.y0+1),p.y1);
    case 'jumppad': return { minX:Math.min(p.x-1.5,p.targetX-.5),maxX:Math.max(p.x+1.5,p.targetX+.5),minZ:Math.min(p.z-1.5,p.targetZ-.5),maxZ:Math.max(p.z+1.5,p.targetZ+.5),minY:Math.min(p.y,p.targetY-.5),maxY:Math.max(p.y+.5,p.targetY)+(p.arc??3.5) };
    case 'void': return box(p.w,p.d,p.y-10,p.y-.7);
    case 'checkpoint': return {...box(2.6,2.6,p.y,p.y+2.5),radius:1.3};
    case 'goal': return box(p.w,p.d,p.y,p.y+3);
    case 'bumper': return {...box(p.radius*2,p.radius*2,p.y,p.y+1.2),radius:p.radius};
    case 'pushable': return box(p.size+.24,p.size+.24,p.y,p.y+p.size+.24);
    case 'momentum': return {...box(p.radius*2,p.radius*2,p.y,p.y+1.2),radius:p.radius};
    case 'pressure': return box(p.w,p.d,p.y,p.y+.07);
    case 'door': return box(p.w,p.d,p.y,p.y+p.h+1.4);
    case 'logic': case 'sequence': return box(2.6,1.5,p.y,p.y+.6);
    case 'switch': return {...box(3.6,3.6,p.y-.7,p.y+1.7),radius:1.8};
    default: return null;
  }
}
