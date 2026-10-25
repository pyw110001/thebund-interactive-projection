import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { fitScale, type FitMode } from './projection-math';
import type { MediaAsset } from './media';

export type ViewName = 'exterior'|'interior'|'top';
export interface SceneState { night:boolean; deployment:number; roofHidden:boolean; brightness:number; fit:FitMode; view:ViewName; }
interface SceneConfig {
  building:{length:number;depth:number;facadeHeight:number};
  screen:{width:number;height:number;top:number;bottom:number;center:number[];defaultCrop:number};
  cameras:Record<ViewName,{position:number[];target:number[]}>;
}
export interface SceneStats { fps:number; triangles:number; calls:number; modelBytes:number; }
const base=import.meta.env.BASE_URL;

export class HallScene {
  renderer:THREE.WebGLRenderer;
  scene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(42,1,.1,600);
  controls:OrbitControls;
  config?:SceneConfig;
  state:SceneState;
  model?:THREE.Group;
  screen?:THREE.Mesh;
  projection?:THREE.ShaderMaterial;
  currentMedia?:MediaAsset;
  private sample?:THREE.Texture;
  private resizeObserver:ResizeObserver;
  private disposed=false;
  private frame=0;
  private sky:THREE.Mesh;
  private sun:THREE.DirectionalLight;
  private fill:THREE.DirectionalLight;
  private ambient:THREE.HemisphereLight;
  private warm:THREE.PointLight[]=[];
  private nightColors=new Map<THREE.Material,THREE.Color>();
  private transition?:{start:number;fromP:THREE.Vector3;fromT:THREE.Vector3;toP:THREE.Vector3;toT:THREE.Vector3};
  private shownDeployment=1;
  private shownRoof=1;
  private shownNight=1;
  private roofTransition?:{start:number;from:number;to:number};
  private nightTransition?:{start:number;from:number;to:number};
  private motionQuery=window.matchMedia('(prefers-reduced-motion: reduce)');
  private roofMaterials:{mesh:THREE.Mesh;material:THREE.Material;opacity:number;transparent:boolean;depthWrite:boolean;castShadow:boolean;renderOrder:number}[]=[];
  private detachedMaterials=new Set<THREE.Material>();
  private appliedNight=-1;
  private dayFog=new THREE.Color('#b9c9d9');
  private nightFog=new THREE.Color('#7485a0');
  private daySun=new THREE.Color('#fff2dd');
  private nightSun=new THREE.Color('#bdd2f4');
  private modelBytes=0;
  private onStats?:(stats:SceneStats)=>void;
  private sampleFrames=0;
  private sampleStart=performance.now();
  private environment:THREE.WebGLRenderTarget;
  private framingScale=1;

  constructor(private host:HTMLDivElement,state:SceneState,onStats?:(stats:SceneStats)=>void) {
    this.state=state;this.onStats=onStats;
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.setClearColor('#7a8ea9');this.host.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label','水晶厅三维场景');
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);
    this.controls.enableDamping=true;this.controls.dampingFactor=.075;
    this.controls.minDistance=2;this.controls.maxDistance=185;this.controls.maxPolarAngle=Math.PI*.485;
    this.camera.position.set(-37,23,70);this.controls.target.set(1,3,2);
    this.controls.addEventListener('start',()=>{this.transition=undefined;});
    const pmrem=new THREE.PMREMGenerator(this.renderer);
    const room=new RoomEnvironment();this.environment=pmrem.fromScene(room,.04);room.dispose();pmrem.dispose();
    this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.2;
    this.scene.fog=new THREE.Fog('#7485a0',115,350);
    this.sky=new THREE.Mesh(new THREE.SphereGeometry(420,32,20),new THREE.ShaderMaterial({
      side:THREE.BackSide,depthWrite:false,uniforms:{uNight:{value:1}},
      vertexShader:'varying vec3 vPosition; void main(){vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`varying vec3 vPosition;uniform float uNight;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
        float clouds(vec2 p){float v=0.;float a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.03+11.7;a*=.5;}return v;}
        void main(){float h=clamp(normalize(vPosition).y,0.,1.);vec3 night=mix(vec3(.12,.17,.26),vec3(.012,.045,.13),pow(h,.55));
        vec3 direction=normalize(vPosition);vec2 skyUv=vec2(atan(direction.z,direction.x)*3.,direction.y*13.);
        float cloud=smoothstep(.40,.67,clouds(skyUv))*smoothstep(0.,.12,h)*(1.-smoothstep(.45,.85,h));
        night=mix(night,vec3(.18,.21,.28),cloud*.38);
        vec3 day=mix(vec3(.72,.79,.84),vec3(.24,.48,.72),pow(h,.55));day=mix(day,vec3(.8,.84,.87),cloud*.45);gl_FragColor=vec4(mix(day,night,uNight),1.);
        #include <colorspace_fragment>
        }`}));this.scene.add(this.sky);
    this.ambient=new THREE.HemisphereLight('#acc8ff','#8d7b64',1.5);this.scene.add(this.ambient);
    this.sun=new THREE.DirectionalLight('#d0dfff',2.0);this.sun.position.set(-32,55,30);this.sun.castShadow=true;
    this.sun.shadow.mapSize.set(2048,2048);Object.assign(this.sun.shadow.camera,{left:-65,right:65,top:65,bottom:-65,near:1,far:180});
    this.sun.shadow.bias=-.0002;this.sun.shadow.normalBias=.025;this.scene.add(this.sun);
    this.fill=new THREE.DirectionalLight('#ffe0ba',.9);this.fill.position.set(30,18,-25);this.scene.add(this.fill);
    for(const x of [-16,-6,6,17]) {
      const light=new THREE.PointLight('#ffd5a0',65,24,2);light.position.set(x,2.8,12);this.scene.add(light);this.warm.push(light);
    }
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(this.host);this.resize();
    this.animate();
  }

  async load(onProgress:(progress:number)=>void):Promise<void> {
    const [configResponse,response]=await Promise.all([fetch(base+'assets/scene-config.json'),fetch(base+'assets/crystal-hall.glb')]);
    if(!configResponse.ok||!response.ok)throw new Error('模型文件读取失败，请检查本地服务。');
    this.config=await configResponse.json();
    const total=Number(response.headers.get('Content-Length'));
    const chunks:Uint8Array[]=[];let received=0;
    if(response.body){const reader=response.body.getReader();for(;;){const {done,value}=await reader.read();if(done)break;chunks.push(value);received+=value.length;onProgress(total?Math.min(1,received/total)*.85:.5);}}
    else {const buffer=await response.arrayBuffer();chunks.push(new Uint8Array(buffer));received=buffer.byteLength;}
    if(this.disposed)return;
    this.modelBytes=received;
    const joined=new Uint8Array(received);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.length;}
    const gltf=await new GLTFLoader().parseAsync(joined.buffer,base+'assets/');
    if(this.disposed){this.disposeModel(gltf.scene);return;}
    this.model=gltf.scene;this.scene.add(this.model);
    this.model.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;
      object.castShadow=true;object.receiveShadow=true;
      const mats=Array.isArray(object.material)?object.material:[object.material];
      for(const m of mats){
        if(m instanceof THREE.MeshStandardMaterial){
          m.envMapIntensity=.6;
          if(m.map){m.map.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());}
          if(m.name==='Stone'||m.name==='ContextStone'){m.bumpMap=m.map;m.bumpScale=.025;m.roughness=.88;}
          if(m.name==='Glass'){
            m.transparent=true;m.opacity=.095;m.depthWrite=false;m.side=THREE.DoubleSide;
            object.castShadow=false;object.renderOrder=2;
          }
          if(m.name==='FrostedGlass'){m.transparent=false;m.opacity=1;}
          if(m.name==='ArchitecturalLight')this.nightColors.set(m,m.emissive.clone());
        }
      }
    });
    this.model.getObjectByName('Roof')?.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;
      const originals=Array.isArray(object.material)?object.material:[object.material];
      const clones=originals.map(original=>{
        this.detachedMaterials.add(original);
        const material=original.clone();
        this.roofMaterials.push({mesh:object,material,opacity:material.opacity,transparent:material.transparent,depthWrite:material.depthWrite,castShadow:object.castShadow,renderOrder:object.renderOrder});
        return material;
      });
      object.material=Array.isArray(object.material)?clones:clones[0];
    });
    this.screen=this.model.getObjectByName('ProjectionScreen') as THREE.Mesh;
    if(!this.screen||!this.screen.morphTargetInfluences)throw new Error('GLB 幕面节点或收幕形变缺失。');
    const original=this.screen.material as THREE.MeshBasicMaterial;
    this.sample=original.map ?? new THREE.TextureLoader().load(base+'assets/floral-garden.png');
    // Canonical projection UVs are bottom-left, unlike the glTF material's UV convention.
    this.sample.flipY=true;this.sample.needsUpdate=true;
    this.projection=new THREE.ShaderMaterial({
      side:THREE.DoubleSide,toneMapped:false,
      uniforms:{uMap:{value:this.sample},uFit:{value:new THREE.Vector2(1,this.config!.screen.defaultCrop)},
        uBrightness:{value:1},uDeployment:{value:1},uOriginalCrop:{value:this.config!.screen.defaultCrop},
        uFlip:{value:1},uEnabled:{value:1}},
      vertexShader:`#include <common>
        #include <morphtarget_pars_vertex>
        varying vec2 vScreen;
        uniform float uOriginalCrop;
        void main(){vScreen=vec2(uv.x,.5-(uv.y-.5)/uOriginalCrop);
        #include <morphinstance_vertex>
        #include <begin_vertex>
        #include <morphtarget_vertex>
        gl_Position=projectionMatrix*modelViewMatrix*vec4(transformed,1.);}`,
      fragmentShader:`uniform sampler2D uMap;uniform vec2 uFit;uniform float uBrightness;uniform float uDeployment;
        uniform float uFlip;uniform float uEnabled;varying vec2 vScreen;
        void main(){vec2 canvas=vec2(vScreen.x,1.-uDeployment+vScreen.y*uDeployment);
        vec2 p=(canvas-.5)*uFit+.5;
        if(uFlip<.5)p.y=1.-p.y;
        vec3 c=vec3(.018,.019,.022);
        if(p.x>=0.&&p.x<=1.&&p.y>=0.&&p.y<=1.)c=texture2D(uMap,p).rgb*uBrightness;
        gl_FragColor=vec4(mix(vec3(.61,.60,.57),c,uEnabled),1.);
        #include <colorspace_fragment>
        }`,
    });
    this.screen.material=this.projection;this.screen.castShadow=false;this.screen.receiveShadow=false;
    this.shownRoof=this.state.roofHidden?0:1;this.shownNight=this.state.night?1:0;
    this.appliedNight=-1;this.applyState();this.applyRoofBlend();this.setView(this.state.view,true);onProgress(1);
  }

  setState(next:SceneState){
    const previous=this.state;this.state=next;
    const start=performance.now();
    if(next.roofHidden!==previous.roofHidden)this.roofTransition={start,from:this.shownRoof,to:next.roofHidden?0:1};
    if(next.night!==previous.night)this.nightTransition={start,from:this.shownNight,to:next.night?1:0};
    this.applyState();if(next.view!==previous.view)this.setView(next.view);
  }
  private applyState(){
    this.applyNightBlend();
    if(this.projection){this.projection.uniforms.uBrightness.value=this.state.brightness;this.projection.uniforms.uEnabled.value=this.shownNight;this.updateFit();}
  }
  private applyNightBlend(){
    const n=this.shownNight;if(n===this.appliedNight)return;this.appliedNight=n;
    (this.sky.material as THREE.ShaderMaterial).uniforms.uNight.value=n;
    this.scene.fog!.color.lerpColors(this.dayFog,this.nightFog,n);
    this.ambient.intensity=THREE.MathUtils.lerp(2,.7,n);this.sun.intensity=THREE.MathUtils.lerp(3,.65,n);
    this.sun.color.lerpColors(this.daySun,this.nightSun,n);this.fill.intensity=THREE.MathUtils.lerp(1.1,.4,n);
    this.scene.environmentIntensity=THREE.MathUtils.lerp(.45,.2,n);
    for(const light of this.warm)light.intensity=75*n;
    for(const [m,c] of this.nightColors)(m as THREE.MeshStandardMaterial).emissive.copy(c).multiplyScalar(n);
    if(this.projection)this.projection.uniforms.uEnabled.value=n;
  }
  private applyRoofBlend(){
    const alpha=this.shownRoof;
    const roof=this.model?.getObjectByName('Roof');if(roof)roof.visible=alpha>.001;
    for(const entry of this.roofMaterials){
      const fading=alpha<.999;
      const transparent=fading||entry.transparent;
      if(entry.material.transparent!==transparent){entry.material.transparent=transparent;entry.material.needsUpdate=true;}
      entry.material.opacity=entry.opacity*alpha;
      entry.material.depthWrite=fading?false:entry.depthWrite;
      entry.mesh.castShadow=entry.castShadow&&alpha>.25;
      entry.mesh.renderOrder=fading?3:entry.renderOrder;
    }
  }
  getVisualState(){return {roofOpacity:this.shownRoof,nightBlend:this.shownNight,deployment:this.shownDeployment};}
  private updateFit(){
    if(!this.projection||!this.config)return;
    const f=this.currentMedia?fitScale(this.currentMedia.aspect,this.config.screen.width/this.config.screen.height,this.state.fit):[1,this.config.screen.defaultCrop];
    this.projection.uniforms.uFit.value.set(f[0],f[1]);
  }
  setMedia(asset?:MediaAsset){
    this.currentMedia=asset;
    if(this.projection){this.projection.uniforms.uMap.value=asset?.texture??this.sample;this.projection.uniforms.uFlip.value=1;this.updateFit();}
  }
  setView(view:ViewName,immediate=false){
    const preset=this.config?.cameras[view];if(!preset)return;
    const p=new THREE.Vector3().fromArray(preset.position),t=new THREE.Vector3().fromArray(preset.target);
    this.framingScale=view==='interior'?1:Math.max(1,1.45/this.camera.aspect);
    p.sub(t).multiplyScalar(this.framingScale).add(t);
    if(immediate||this.motionQuery.matches){this.transition=undefined;this.camera.position.copy(p);this.controls.target.copy(t);this.controls.update();}
    else this.transition={start:performance.now(),fromP:this.camera.position.clone(),fromT:this.controls.target.clone(),toP:p,toT:t};
  }
  private resize(){
    const {width,height}=this.host.getBoundingClientRect();if(width<1||height<1)return;
    this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.renderer.setSize(width,height);
    const nextScale=this.state.view==='interior'?1:Math.max(1,1.45/this.camera.aspect);
    if(this.config){this.transition=undefined;this.camera.position.sub(this.controls.target).multiplyScalar(nextScale/this.framingScale).add(this.controls.target);}
    this.framingScale=nextScale;
  }
  private animate=()=>{
    if(this.disposed)return;this.frame=requestAnimationFrame(this.animate);
    const now=performance.now();
    if(this.roofTransition){
      const t=this.motionQuery.matches?1:Math.min(1,(now-this.roofTransition.start)/480);
      this.shownRoof=THREE.MathUtils.lerp(this.roofTransition.from,this.roofTransition.to,t*t*(3-2*t));
      this.applyRoofBlend();if(t===1)this.roofTransition=undefined;
    }
    if(this.nightTransition){
      const t=this.motionQuery.matches?1:Math.min(1,(now-this.nightTransition.start)/900);
      this.shownNight=THREE.MathUtils.lerp(this.nightTransition.from,this.nightTransition.to,t*t*(3-2*t));
      this.applyNightBlend();if(t===1)this.nightTransition=undefined;
    }
    if(this.transition){const t=this.motionQuery.matches?1:Math.min(1,(now-this.transition.start)/850);const eased=t*t*(3-2*t);this.camera.position.lerpVectors(this.transition.fromP,this.transition.toP,eased);this.controls.target.lerpVectors(this.transition.fromT,this.transition.toT,eased);if(t===1)this.transition=undefined;}
    this.shownDeployment=this.motionQuery.matches?this.state.deployment:THREE.MathUtils.damp(this.shownDeployment,this.state.deployment,10,Math.min(.05,(now-(this.lastFrame??now))/1000));this.lastFrame=now;
    if(Math.abs(this.shownDeployment-this.state.deployment)<.0003)this.shownDeployment=this.state.deployment;
    if(this.screen?.morphTargetInfluences){this.screen.morphTargetInfluences[0]=1-this.shownDeployment;this.screen.visible=this.shownDeployment>.001;}
    const bottomBar=this.model?.getObjectByName('CurtainBottomBar');
    if(bottomBar&&this.config)bottomBar.position.y=this.config.screen.top-this.shownDeployment*this.config.screen.height;
    if(this.projection)this.projection.uniforms.uDeployment.value=this.shownDeployment;
    this.controls.update();this.renderer.render(this.scene,this.camera);this.sampleFrames++;
    if(now-this.sampleStart>1000){this.onStats?.({fps:Math.round(this.sampleFrames*1000/(now-this.sampleStart)),triangles:this.renderer.info.render.triangles,calls:this.renderer.info.render.calls,modelBytes:this.modelBytes});this.sampleFrames=0;this.sampleStart=now;}
  };
  private lastFrame?:number;
  private disposeModel(root:THREE.Object3D){const textures=new Set<THREE.Texture>();const materials=new Set<THREE.Material>();root.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});for(const m of materials){for(const value of Object.values(m))if(value instanceof THREE.Texture)textures.add(value);m.dispose();}for(const t of textures)t.dispose();}
  dispose(){this.disposed=true;cancelAnimationFrame(this.frame);this.resizeObserver.disconnect();this.controls.dispose();if(this.model)this.disposeModel(this.model);for(const material of this.detachedMaterials)material.dispose();this.sample?.dispose();this.environment.dispose();this.sky.geometry.dispose();(this.sky.material as THREE.Material).dispose();this.renderer.dispose();this.renderer.domElement.remove();}
}
