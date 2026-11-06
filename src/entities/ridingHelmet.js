import * as THREE from 'three';

// Photo-based Samshield 2.0 study, not a manufacturer-supplied 3D asset.
// Helmet-local +Z is forward. Only rider equipment is affected.
export function makeRidingHelmet(colour, width = 0.105, height = 0.11, depth = 0.128) {
  const root = new THREE.Group();
  root.name = 'Samshield-2-photo-study';
  root.userData.reference = 'Samshield 2.0, matte black, short peak';
  const shellMat = new THREE.MeshStandardMaterial({color: '#17191c', roughness: 0.78, metalness: 0.02});
  const panelMat = new THREE.MeshStandardMaterial({color: '#22252a', roughness: 0.57, metalness: 0.10});
  const trimMat = new THREE.MeshStandardMaterial({color: '#090b0e', roughness: 0.74});
  const metalMat = new THREE.MeshStandardMaterial({color: '#7b8188', roughness: 0.32, metalness: 0.75});
  const strapMat = new THREE.MeshStandardMaterial({color: '#141619', roughness: 0.95, side: THREE.DoubleSide});
  const add = (geometry, material, name = '') => {
    const m = new THREE.Mesh(geometry, material); m.name = name;
    m.castShadow = true; m.receiveShadow = true; root.add(m); return m;
  };
  const tube = (points, radius, material, name) => add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), points.length * 2, radius, 6, false), material, name);
  // Swept hem: just above the brow, lower at the nape, with the ear opening clear.
  const point = (t, a, lift = 0) => new THREE.Vector3((width+lift)*Math.sin(t)*Math.sin(a), (height+lift)*Math.cos(t), (depth+lift)*Math.sin(t)*Math.cos(a));
  const hem = a => 1.73 - 0.19 * Math.cos(a);
  const verts = [], indices = [], rim = [];
  const rings = 28, segments = 64;
  for (let j=0;j<=rings;j++) for (let i=0;i<=segments;i++) {
    const a=i/segments*Math.PI*2, p=point(j/rings*hem(a),a); verts.push(p.x,p.y,p.z);
    if (j===rings) rim.push(p);
    if (j<rings && i<segments) { const n=j*(segments+1)+i; indices.push(n,n+segments+1,n+1,n+1,n+segments+1,n+segments+2); }
  }
  const shellGeo = new THREE.BufferGeometry(); shellGeo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));shellGeo.setIndex(indices);shellGeo.computeVertexNormals();
  add(shellGeo,shellMat,'fitted-shell'); tube(rim,0.0018,trimMat,'rubber-rim');
  // Separate crown insert, curved onto the shell, bounded by fine satin-metal piping.
  const crown = (t,s,lift=0.0008) => {
    const x=width*0.235*s, k=Math.sqrt(1-(x/width)**2);
    return new THREE.Vector3(x,(height+lift)*Math.cos(t)*k,(depth+lift)*Math.sin(t)*k);
  };
  const pv=[], pi=[], edges=[[],[]];
  for(let j=0;j<=56;j++) for(let i=0;i<=8;i++) {
    const t=-1.89+j/56*3.22, s=-1+i/4, p=crown(t,s);pv.push(p.x,p.y,p.z);
    if(i===0)edges[0].push(p);if(i===8)edges[1].push(p);
    if(j<56&&i<8){const n=j*9+i;pi.push(n,n+9,n+1,n+1,n+9,n+10);}
  }
  const pg=new THREE.BufferGeometry();pg.setAttribute('position',new THREE.Float32BufferAttribute(pv,3));pg.setIndex(pi);pg.computeVertexNormals();
  add(pg,panelMat,'crown-insert'); for(const e of edges)tube(e,0.00085,metalMat,'crown-piping');
  // Short moulded peak: curved across the brow, thin and slightly downturned.
  const vv=[], vi=[], edge=[];
  for(let j=0;j<=6;j++)for(let i=0;i<=40;i++){
    const u=-1+i/20, r=j/6, a=Math.asin(0.92*u), t=hem(a);
    const z0=depth*Math.sin(t)*Math.cos(a)-0.002;
    const z1=z0+depth*0.39*Math.pow(Math.max(0,1-u*u),0.65);
    const p=new THREE.Vector3(width*Math.sin(t)*Math.sin(a),height*Math.cos(t)-0.001-r*0.009,z0+(z1-z0)*r);
    vv.push(p.x,p.y,p.z); if(j===6)edge.push(p);
    if(j<6&&i<40){const n=j*41+i;vi.push(n,n+41,n+1,n+1,n+41,n+42);}
  }
  const vg=new THREE.BufferGeometry();vg.setAttribute('position',new THREE.Float32BufferAttribute(vv,3));vg.setIndex(vi);vg.computeVertexNormals();
  const peakMat=shellMat.clone();peakMat.side=THREE.DoubleSide;add(vg,peakMat,'short-peak');tube(edge,0.0014,trimMat,'peak-edge');
  // Central front badge, with brand text; no claim this is an official asset.
  const badge=new THREE.Shape();badge.moveTo(-0.013,0.018);badge.lineTo(0.013,0.018);badge.lineTo(0.011,-0.008);badge.quadraticCurveTo(0,-0.025,-0.011,-0.008);badge.closePath();
  const plaque=add(new THREE.ExtrudeGeometry(badge,{depth:0.001,bevelEnabled:true,bevelSize:0.0006,bevelThickness:0.0004,bevelSegments:2}),metalMat,'brand-shield');
  plaque.position.copy(crown(1.09,0,0.002));plaque.rotation.x=-0.44;
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
  const ctx=canvas.getContext('2d');
  if(ctx){
    ctx.fillStyle='#15171b';ctx.fillRect(0,0,512,512);
    ctx.strokeStyle='#c2c5c9';ctx.lineWidth=9;ctx.beginPath();ctx.moveTo(140,65);ctx.lineTo(372,65);ctx.lineTo(354,290);ctx.quadraticCurveTo(256,400,158,290);ctx.closePath();ctx.stroke();
    ctx.fillStyle='#c2c5c9';ctx.font='italic bold 190px Georgia';ctx.textAlign='center';ctx.fillText('S',256,260);
    ctx.font='bold 48px sans-serif';ctx.fillText('SAMSHIELD',256,445);
    const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
    const label=new THREE.Mesh(new THREE.PlaneGeometry(0.020,0.030),new THREE.MeshStandardMaterial({map:tex,roughness:0.48,metalness:0.25}));
    label.name='Samshield-label';label.position.set(0,0.0005,0.0022);plaque.add(label);
  }
  // Vent grille above the badge and rear extractors follow the crown curvature.
  for(const t of [0.79,0.86,-1.56,-1.66,-1.76]){
    const pts=[];for(let i=0;i<=12;i++)pts.push(crown(t,-0.78+i/12*1.56,0.0019));
    tube(pts,0.0018,trimMat,'vent-slot');
  }
  // Broad leather Y harness around each ear, meeting under the jaw.
  const ribbon=(a,b,w=0.010)=>{
    const d=b.clone().sub(a); const m=add(new THREE.BoxGeometry(w,d.length(),0.0027),strapMat,'leather-harness');
    m.position.copy(a).add(b).multiplyScalar(0.5);d.normalize();
    const normal=Math.abs(d.x)>0.8?new THREE.Vector3(0,-1,0):new THREE.Vector3(Math.sign(m.position.x)||1,0,0);
    normal.addScaledVector(d,-normal.dot(d)).normalize();
    const across=new THREE.Vector3().crossVectors(d,normal).normalize();
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(across,d,normal));return m;
  };
  for(const side of [-1,1]){
    const jaw=new THREE.Vector3(side*width*0.50,-height*1.05,depth*0.42);
    ribbon(new THREE.Vector3(side*width*0.94,-height*0.13,depth*0.26),jaw,0.012);
    ribbon(new THREE.Vector3(side*width*0.77,-height*0.29,-depth*0.55),jaw,0.014);
    ribbon(jaw,new THREE.Vector3(side*width*0.27,-height*1.38,depth*0.68),0.010);
    const rivet=add(new THREE.SphereGeometry(0.0023,8,6),metalMat,'strap-rivet');rivet.position.copy(jaw);rivet.position.x+=side*0.002;
  }
  ribbon(new THREE.Vector3(-width*0.27,-height*1.38,depth*0.68),new THREE.Vector3(width*0.27,-height*1.38,depth*0.68),0.012);
  const buckle=add(new THREE.BoxGeometry(0.014,0.011,0.006),trimMat,'chin-buckle');buckle.position.set(width*0.30,-height*1.32,depth*0.65);
  return root;
}
