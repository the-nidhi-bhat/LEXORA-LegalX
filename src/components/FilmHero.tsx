import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
const Sculpture = lazy(() => import('./Sculpture'))
const poster = __LEGALX_MEDIA__.poster ? '/film/poster.jpg' : '/legalx-social.png'
const chapters=['Agreement','Contract IR','Justice scales','Parity mismatch','Execution gate']
export function Scene({ chapter }: {chapter:number}){
  const [failed,setFailed]=useState(false)
  const fail=useCallback(()=>setFailed(true),[])
  const mount=useRef<HTMLDivElement>(null)
  const [near,setNear]=useState(false)
  useEffect(()=>{
    const observer=new IntersectionObserver(([entry])=>{
      if(entry.isIntersecting){setNear(true);observer.disconnect()}
    },{rootMargin:'100px'})
    observer.observe(mount.current!)
    return ()=>observer.disconnect()
  },[])
  if(!near)return <div className="scene-pending" ref={mount}><img className="scene-poster" src={poster} alt={__LEGALX_MEDIA__.poster ? "Layered contract sculpture" : "LegalX"}/></div>
  return failed?<img className="scene-poster" src={poster} alt={__LEGALX_MEDIA__.poster ? "Layered contract sculpture" : "LegalX"}/>:<Suspense fallback={<img className="scene-poster" src={poster} alt="Loading the contract sculpture"/>}><Sculpture chapter={chapter} onFailure={fail}/></Suspense>
}
export function FilmHero(){
  const [interactive,setInteractive]=useState(()=>!__LEGALX_MEDIA__.loop || location.hash === '#showcase'),[chapter,setChapter]=useState(0),[paused,setPaused]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches)
  const video=useRef<HTMLVideoElement>(null)
  useEffect(()=>{
    const el=video.current;if(!el)return
    const observer=new IntersectionObserver(([entry])=>{if(entry.isIntersecting&&!paused)void el.play().catch(()=>setPaused(true));else el.pause()})
    observer.observe(el);return ()=>observer.disconnect()
  },[paused,interactive])
  return <figure id="showcase" className="film-hero"><div className="film-stage">{interactive?<Scene chapter={chapter}/>:<video ref={video} muted loop playsInline poster={poster} src="/film/living-contract.mp4" aria-label="Rotating layered agreement sculpture"/>}</div>
    <figcaption><div className="film-actions">{__LEGALX_MEDIA__.film && <a href="#product-film">▶ Watch the film</a>}{__LEGALX_MEDIA__.loop && <button onClick={()=>setInteractive(!interactive)}>{interactive?'Show film loop':'Explore in 3D'}</button>}{!interactive&&<button onClick={()=>setPaused(!paused)}>{paused?'Play loop':'Pause loop'}</button>}</div>
    {interactive&&<div className="scene-choices" aria-label="Sculpture views">{chapters.map((name,i)=><button key={name} aria-pressed={i===chapter} onClick={()=>setChapter(i)}>{name}</button>)}</div>}</figcaption>
  </figure>
}
export function ProductFilm(){
  const player=useRef<HTMLVideoElement>(null)
  const [playbackError, setPlaybackError] = useState('')
  async function replay() {
    if (!player.current) return
    setPlaybackError('')
    try {
      player.current.currentTime = 0
      await player.current.play()
    } catch {
      setPlaybackError('The film could not restart. Try the video player controls.')
    }
  }
  return <section id="product-film" className="folio-section product-film"><h2>The agreement under review.</h2>{__LEGALX_MEDIA__.film && <><video ref={player} controls playsInline onPlaying={() => setPlaybackError('')} preload="none" poster={poster} aria-label="LegalX product film"><source src="/film/legalx.mp4" type="video/mp4"/><track kind="captions" src="/film/legalx.en.vtt" srcLang="en" label="English" default/></video><button onClick={replay}>Replay film</button><p role="status">{playbackError}</p></>}
  <details><summary>How the legal terms map to this example</summary><p>The client offers payment for the developer’s work. Acceptance and consideration are part of formation. Identify who owes each obligation and which approval releases each ₹10,000 milestone. Capacity, free consent and a lawful object also matter under Indian law. <a href="https://www.indiacode.nic.in/bitstream/123456789/2187/2/A187209.pdf">Indian Contract Act, sections 2 and 10</a></p><p>Amounts and dates can be compared mechanically. Whether performance amounts to breach, what loss resulted, and which remedy follows require factual and legal review. Record governing law and the agreed dispute process for the reviewer. <a href="https://www.indiacode.nic.in/bitstream/123456789/2187/2/A187209.pdf">Indian Contract Act, sections 73–74</a></p><p>Electronic formation alone does not make an agreement unenforceable. A passing parity check confirms agreement between compared fields. Enforceability remains a separate legal question. <a href="https://www.indiacode.nic.in/bitstream/123456789/15386/1/it_amendment_act2008.pdf">Information Technology Act, section 10A</a></p></details></section>
}
