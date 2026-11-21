import { useEffect, useRef } from 'react'
import * as T from 'three'

export default function Sculpture({ chapter, onFailure }: { chapter: number; onFailure: () => void }) {
  const host = useRef<HTMLDivElement>(null)
  const selected = useRef(chapter)
  useEffect(() => { selected.current = chapter }, [chapter])
  useEffect(() => {
    const node = host.current!
    let renderer: T.WebGLRenderer
    try { renderer = new T.WebGLRenderer({ antialias: true, alpha: false }) } catch { onFailure(); return }
    node.appendChild(renderer.domElement)
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
    const scene = new T.Scene()
    scene.background = new T.Color(0x14232c)
    const camera = new T.PerspectiveCamera(36, 1, .1, 100)
    scene.add(new T.HemisphereLight(0xfff4d7, 0x51697c, 2))
    const key = new T.DirectionalLight(0xffe9bd, 3.2)
    key.position.set(-3, 6, 4); scene.add(key)
    const rim = new T.DirectionalLight(0xb5e6ff, 2.3)
    rim.position.set(4, 3, -5); scene.add(rim)
    const gold = new T.MeshStandardMaterial({ color: 0xd8ad68, metalness: .65, roughness: .28 })
    const paper = new T.MeshStandardMaterial({ color: 0xe8ddc7, roughness: .6 })
    const slate = new T.MeshStandardMaterial({ color: 0x527583, metalness: .4, roughness: .3 })
    const red = new T.MeshStandardMaterial({ color: 0xc26a56 })
    const groups = Array.from({length:5}, () => {const g=new T.Group();scene.add(g);return g})
    function mesh(g:T.Object3D, geometry:T.BufferGeometry, material:T.Material,x:number,y:number,z:number) {
      const m=new T.Mesh(geometry,material);m.position.set(x,y,z);g.add(m);return m
    }
    function box(g:T.Object3D,w:number,h:number,d:number,m:T.Material,x=0,y=0,z=0) {
      return mesh(g,new T.BoxGeometry(w,h,d),m,x,y,z)
    }
    function rod(g:T.Object3D,a:T.Vector3,b:T.Vector3,r=.035) {
      const mid=a.clone().lerp(b,.5),dir=b.clone().sub(a)
      const m=mesh(g,new T.CylinderGeometry(r,r,dir.length(),12),gold,mid.x,mid.y,mid.z)
      m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),dir.normalize())
    }
    for(let layer=0;layer<4;layer++){
      const y=(layer-1.5)*.52
      box(groups[0],3.8,.065,2.4,[slate,gold,slate,paper][layer],0,y)
      for(let j=0;j<6;j++)box(groups[0],j%3?2.65:1.7,.015,.022,gold,-.23,y+.041,-.8+j*.28)
    }
    const V=(x:number,y:number,z:number)=>new T.Vector3(x,y,z)
    const hub=V(0,.95,0)
    mesh(groups[1],new T.IcosahedronGeometry(.36,1),gold,0,.95,0)
    for(let i=0;i<3;i++){
      const a=i*Math.PI*2/3,pt=V(1.7*Math.cos(a),-.45,1.7*Math.sin(a))
      rod(groups[1],hub,pt);box(groups[1],.92,.36,.72,paper,pt.x,pt.y,pt.z)
    }
    for(const g of [groups[2],groups[3]]){
      box(g,2.5,.16,1.35,slate,0,-1.3);rod(g,V(0,-1.25,0),V(0,1.45,0),.12)
      const beam=new T.Group();beam.position.y=1.25;g.add(beam)
      if(g===groups[3])beam.rotation.z=-.16
      rod(beam,V(-1.65,0,0),V(1.65,0,0),.08)
      for(const side of [-1,1]){
        const x=1.43*side
        for(const z of [-.42,.42])rod(beam,V(x,0,0),V(x,-1.03,z),.02)
        mesh(beam,new T.CylinderGeometry(.58,.33,.18,40),g===groups[3]&&side===1?red:gold,x,-1.08,0)
      }
    }
    for(const x of [-1.55,1.55])box(groups[4],.22,2.8,.4,gold,x)
    for(let j=0;j<6;j++)box(groups[4],2.95,.2,.24,j===3?red:slate,0,-1.1+j*.43)
    const motion=matchMedia('(prefers-reduced-motion: reduce)')
    let disposed=false,visible=false,frame=0,yaw=0,tilt=0,time=0,last=0
    const weights: number[]=groups.map((_,i)=>i===selected.current?1:0)
    function draw(now:number){
      if(disposed||!visible)return
      if(!motion.matches)time+=Math.min(50,now-last)/1000
      last=now
      const orbit=.48+yaw+(motion.matches?0:.21*Math.sin(time*.55))
      const scroll=motion.matches?0:Math.max(-1,Math.min(1,node.getBoundingClientRect().top/innerHeight))
      camera.position.set(7*Math.sin(orbit),3.25+tilt+scroll*.45,7*Math.cos(orbit));camera.lookAt(0,0,0)
      groups.forEach((g,i)=>{
        const target=i===selected.current?1:0
        weights[i]=motion.matches?target:T.MathUtils.lerp(weights[i],target,.13)
        const weight=weights[i];g.visible=weight>.012
        g.scale.setScalar(Math.max(weight,.001))
        g.rotation.y=(1-weight)*(i%2?1:-1)
        g.position.y=(1-weight)*.6+(motion.matches?0:.08*Math.sin(time*1.5))
        if(i===4)g.children.slice(2).forEach((bar,j)=>{bar.position.x=(1-weight)*(j%2?3:-3)})
      })
      renderer.render(scene,camera);frame=requestAnimationFrame(draw)
    }
    const resize=new ResizeObserver(()=>{const {width,height}=node.getBoundingClientRect();if(width&&height){renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix()}})
    resize.observe(node)
    const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;cancelAnimationFrame(frame);if(visible)frame=requestAnimationFrame(draw)})
    observer.observe(node)
    const point=(e:PointerEvent)=>{if(e.pointerType==='mouse'||e.buttons){const r=node.getBoundingClientRect();yaw=(e.clientX-r.left)/r.width-.5;tilt=.8*((e.clientY-r.top)/r.height-.5)}}
    const lost=(e:Event)=>{e.preventDefault();onFailure()}
    renderer.domElement.addEventListener('webglcontextlost',lost);node.addEventListener('pointermove',point)
    return ()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();resize.disconnect();node.removeEventListener('pointermove',point);renderer.domElement.removeEventListener('webglcontextlost',lost);scene.traverse(o=>{if(o instanceof T.Mesh)o.geometry.dispose()});[gold,paper,slate,red].forEach(m=>m.dispose());renderer.dispose();renderer.domElement.remove()}
  },[onFailure])
  return <div className="sculpture-canvas" ref={host} aria-hidden="true"/>
}
