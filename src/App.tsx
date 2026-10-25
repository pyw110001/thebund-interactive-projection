import {useEffect,useRef,useState} from 'react';
import {Maximize,Minimize,Upload,ChevronRight,ChevronLeft,Pause,Play,Volume2,VolumeX,RotateCcw,LoaderCircle,Sun,PanelRightOpen,Check,TriangleAlert} from 'lucide-react';
import {HallScene,type SceneState,type SceneStats,type ViewName} from './scene';
import {decodeFile,type MediaAsset} from './media';
import {formatTime} from './projection-math';
import {Reveal,useExitValue} from './Reveal';

const initial:SceneState={night:true,deployment:1,roofHidden:false,brightness:1,fit:'contain',view:'exterior'};

export function App(){
  const host=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null),viewer=useRef<HallScene|null>(null),active=useRef<MediaAsset|undefined>(undefined),decoder=useRef<AbortController|undefined>(undefined);
  const [state,setState]=useState(initial),[loaded,setLoaded]=useState(false),[progress,setProgress]=useState(0),[fatal,setFatal]=useState('');
  const [panel,setPanel]=useState(true),[dragging,setDragging]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[filename,setFilename]=useState('');
  const [video,setVideo]=useState<HTMLVideoElement|undefined>(undefined),[playing,setPlaying]=useState(false),[muted,setMuted]=useState(true),[duration,setDuration]=useState(0),[time,setTime]=useState(0),[fullscreen,setFullscreen]=useState(false);
  const [stats,setStats]=useState<SceneStats>({fps:0,triangles:0,calls:0,modelBytes:0});
  const dragDepth=useRef(0);
  const displayVideo=useExitValue(video);
  const displayError=useExitValue(error||undefined);
  useEffect(()=>{
    let scene:HallScene|undefined;
    try{scene=new HallScene(host.current!,initial,setStats);viewer.current=scene;
      scene.load(setProgress).then(()=>{if(viewer.current===scene)setLoaded(true);}).catch(e=>{if(viewer.current===scene)setFatal(e instanceof Error?e.message:String(e));});
    }catch(e){setFatal('三维场景初始化失败，请使用支持 WebGL 2 的浏览器。');}
    return()=>{decoder.current?.abort();active.current?.dispose();scene?.dispose();viewer.current=null;};
  },[]);
  useEffect(()=>{viewer.current?.setState(state);},[state]);
  useEffect(()=>{const f=()=>setFullscreen(!!document.fullscreenElement);document.addEventListener('fullscreenchange',f);return()=>document.removeEventListener('fullscreenchange',f);},[]);
  useEffect(()=>{
    if(!video){setPlaying(false);setTime(0);setDuration(0);return;}
    const update=()=>{setTime(video.currentTime);setDuration(Number.isFinite(video.duration)?video.duration:0);setPlaying(!video.paused);setMuted(video.muted);};
    const events=['timeupdate','loadedmetadata','durationchange','play','pause','volumechange','ended'];for(const event of events)video.addEventListener(event,update);update();
    return()=>{for(const event of events)video.removeEventListener(event,update);};
  },[video]);
  // Read-only diagnostics for repeatable browser acceptance and performance checks.
  useEffect(()=>{(window as unknown as {__HALL_STATS__:unknown}).__HALL_STATS__={...stats,loaded,state,media:filename||'default',video:video?{time:video.currentTime,duration:video.duration,paused:video.paused}:null,get visual(){return viewer.current?.getVisualState();}};},[stats,loaded,state,filename,video,time,playing,duration]);

  function update(patch:Partial<SceneState>){setState(previous=>({...previous,...patch}));}
  function dayNight(night:boolean){update({night,deployment:night?1:0});}
  async function selectFile(file?:File){
    if(!file||!loaded)return;
    decoder.current?.abort();const controller=new AbortController();decoder.current=controller;setBusy(true);setError('');
    try{
      const asset=await decodeFile(file,controller.signal);
      if(controller.signal.aborted){asset.dispose();return;}
      const previous=active.current;viewer.current?.setMedia(asset);active.current=asset;setVideo(asset.video);setFilename(asset.name);setMuted(true);previous?.dispose();
      update({night:true,deployment:1});
      if(asset.video){try{await asset.video.play();}catch{setError('视频已载入，点击播放即可开始。');}}
    }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'素材读取失败，已保留原画面。');}
    finally{if(decoder.current===controller)setBusy(false);}
  }
  function reset(){decoder.current?.abort();setBusy(false);viewer.current?.setMedia();active.current?.dispose();active.current=undefined;setVideo(undefined);setFilename('');setError('');if(input.current)input.current.value='';}
  async function togglePlayback(){if(!video)return;try{if(video.paused)await video.play();else video.pause();}catch{setError('播放失败，请重新选择可解码的视频。');}}
  async function toggleFullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{setError('当前浏览器无法进入全屏模式。');}}

  return <main className={`app ${panel?'':'panel-collapsed'}`}
    onDragEnter={e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();dragDepth.current++;setDragging(true);}}}
    onDragOver={e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();}}
    onDragLeave={e=>{e.preventDefault();dragDepth.current--;if(dragDepth.current<=0)setDragging(false);}}
    onDrop={e=>{e.preventDefault();dragDepth.current=0;setDragging(false);void selectFile(e.dataTransfer.files[0]);}}>
    <header className="toolbar">
      <h1>外滩水晶厅</h1>
      <nav className="view-tabs" aria-label="场景视角">{([['exterior','外观'],['interior','室内'],['top','俯视']] as [ViewName,string][]).map(([view,title])=><button key={view} className={state.view===view?'active':''} aria-pressed={state.view===view} onClick={()=>{update({view});if(state.view===view)viewer.current?.setView(view);}} disabled={!loaded}>{title}</button>)}</nav>
      <button className="fullscreen quiet" onClick={()=>void toggleFullscreen()} aria-label={fullscreen?'退出全屏':'全屏'}>{fullscreen?<Minimize size={18}/>:<Maximize size={18}/>}<span>{fullscreen?'退出全屏':'全屏'}</span></button>
    </header>
    <section className="stage" aria-label="建筑三维预览">
      <div className="canvas-host" ref={host}/>
      <div className={`loading-state ${loaded?'is-dismissed':''}`} role="status" aria-hidden={loaded} inert={loaded}>{fatal?<><TriangleAlert size={28}/><strong>场景暂时无法打开</strong><p>{fatal}</p><button onClick={()=>location.reload()}>重新加载</button></>:<><LoaderCircle className="spin" size={28}/><strong>正在载入水晶厅</strong><div className="loading-line"><i style={{width:`${Math.round(progress*100)}%`}}/></div><span>{Math.round(progress*100)}%</span></>}</div>
      <div className="canvas-hint">拖动旋转 · 滚轮缩放<span className="touch-hint"> · 双指平移</span></div>
      <button className={`reopen-panel ${panel?'is-dismissed':''}`} onClick={()=>setPanel(true)} aria-label="展开控制面板" aria-hidden={panel} tabIndex={panel?-1:0} disabled={panel}><PanelRightOpen size={18}/><span>场景控制</span></button>
      <div className={`drop-overlay ${dragging?'is-active':''}`} aria-hidden={!dragging}><Upload size={38}/><strong>松开以展示素材</strong><span>图片或视频仅在本地浏览器中使用</span></div>
    </section>
    <aside className="panel" aria-label="场景控制面板" inert={!panel}>
      <div className="panel-body">
        <section className="panel-section scene-controls">
          <h2>场景控制</h2>
          <div className="segmented" aria-label="展示时段"><button className={!state.night?'active':''} aria-pressed={!state.night} onClick={()=>dayNight(false)} disabled={!loaded}>白天</button><button className={state.night?'active':''} aria-pressed={state.night} onClick={()=>dayNight(true)} disabled={!loaded}>夜间</button></div>
          <label className="slider-label" htmlFor="curtain">幕布展开</label>
          <div className="range-row"><input id="curtain" aria-label="幕布展开" type="range" min="0" max="100" value={Math.round(state.deployment*100)} onChange={e=>update({deployment:Number(e.target.value)/100})} style={{'--fill':`${state.deployment*100}%`} as React.CSSProperties} disabled={!loaded}/><output>{Math.round(state.deployment*100)}%</output></div>
          <label className="switch-row" htmlFor="roof"><span>隐藏屋顶</span><input id="roof" aria-label="隐藏屋顶" type="checkbox" checked={state.roofHidden} onChange={e=>update({roofHidden:e.target.checked})} disabled={!loaded}/><span className="switch" aria-hidden="true"/></label>
        </section>
        <section className="panel-section media-controls">
          <h2>展示素材</h2>
          <div className={`upload-area ${filename?'has-media':''}`}>
            <span className="asset-icon" key={busy?'busy':filename?'selected':'empty'}>{busy?<LoaderCircle size={32} className="spin"/>:filename?<Check size={32}/>:<Upload size={32} strokeWidth={1.6}/>}</span>
            <p className="upload-title" title={filename}>{busy?'正在读取素材':filename||'拖入图片或视频'}</p>
            <button className="primary upload-button" onClick={()=>input.current?.click()} disabled={!loaded||busy}>{filename?'更换文件':'选择文件'}</button>
            <span className="formats">PNG / JPG / WebP / MP4 / WebM</span>
            <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,.mp4,.webm" aria-label="选择展示素材" hidden onChange={e=>{void selectFile(e.target.files?.[0]);e.target.value='';}}/>
          </div>
          <Reveal open={!!filename} className="reset-reveal"><button className="reset quiet" onClick={reset}><RotateCcw size={13}/>恢复花海示例</button></Reveal>
          <div className="segmented fit-control" aria-label="素材适配方式"><button className={state.fit==='contain'?'active':''} aria-pressed={state.fit==='contain'} onClick={()=>update({fit:'contain'})}>完整显示</button><button className={state.fit==='cover'?'active':''} aria-pressed={state.fit==='cover'} onClick={()=>update({fit:'cover'})}>铺满裁切</button></div>
          <div className="brightness-row"><label htmlFor="brightness">亮度</label><Sun size={18}/><input id="brightness" aria-label="亮度" type="range" min="25" max="180" value={Math.round(state.brightness*100)} onChange={e=>update({brightness:Number(e.target.value)/100})} style={{'--fill':`${(state.brightness*100-25)/155*100}%`} as React.CSSProperties}/></div>
          <Reveal open={!!video} className="video-reveal">{displayVideo&&<div className="video-controls">
            <button className="play-button" aria-label={playing?'暂停视频':'播放视频'} onClick={()=>void togglePlayback()}>{playing?<Pause size={19} fill="currentColor"/>:<Play size={19} fill="currentColor"/>}</button>
            <div className="video-timeline"><input aria-label="视频进度" type="range" min="0" max={duration||1} step="0.01" value={Math.min(time,duration||1)} onChange={e=>{if(video){video.currentTime=Number(e.target.value);setTime(video.currentTime);}}} style={{'--fill':`${duration?time/duration*100:0}%`} as React.CSSProperties}/><span>{formatTime(time)} / {formatTime(duration)}</span></div>
            <button className="quiet mute-button" aria-label={muted?'开启声音':'静音'} onClick={()=>{if(video){video.muted=!video.muted;setMuted(video.muted);}}}>{muted?<VolumeX size={17}/>:<Volume2 size={17}/>}</button>
          </div>}</Reveal>
          <Reveal open={!!error} className="error-reveal"><p className="media-error" role={error?'alert':undefined}>{displayError}</p></Reveal>
        </section>
      </div>
      <button className="collapse-button" onClick={()=>setPanel(false)}><ChevronRight size={19}/><span>收起面板</span></button>
    </aside>
    <button className="mobile-panel-toggle" onClick={()=>setPanel(!panel)} aria-expanded={panel}>{panel?<ChevronRight size={18}/>:<ChevronLeft size={18}/>}场景控制</button>
  </main>;
}
