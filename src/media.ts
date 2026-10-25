import * as THREE from 'three';

export interface MediaAsset {
  texture: THREE.Texture;
  aspect: number;
  name: string;
  video?: HTMLVideoElement;
  dispose: () => void;
}

const imageTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
const videoTypes = new Set(['video/mp4', 'video/webm']);

export async function decodeFile(file: File, signal: AbortSignal): Promise<MediaAsset> {
  const image = imageTypes.has(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name);
  const video = videoTypes.has(file.type) || /\.(mp4|webm)$/i.test(file.name);
  if (!image && !video) throw new Error('请选择 PNG、JPG、WebP 图片或 MP4、WebM 视频。');
  const url = URL.createObjectURL(file);
  let asset: MediaAsset | undefined;
  let videoElement: HTMLVideoElement | undefined;
  try {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (image) {
      const element = new Image();
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => { signal.removeEventListener('abort', abort); element.onload = null; element.onerror = null; };
        const abort = () => { cleanup(); element.src = ''; reject(new DOMException('Aborted', 'AbortError')); };
        signal.addEventListener('abort', abort, {once:true});
        element.onload = () => { cleanup(); resolve(); };
        element.onerror = () => { cleanup(); reject(new Error('图片无法解码，已保留原画面。')); };
        element.src = url;
      });
      const texture = new THREE.Texture(element); texture.needsUpdate = true;
      asset = {texture, aspect:element.naturalWidth/element.naturalHeight, name:file.name,
        dispose:() => {texture.dispose(); element.src=''; URL.revokeObjectURL(url);}};
    } else {
      const element = document.createElement('video'); videoElement = element;
      element.preload='auto'; element.muted=true; element.loop=true; element.playsInline=true;
      await new Promise<void>((resolve,reject) => {
        const cleanup = () => { signal.removeEventListener('abort',abort); element.removeEventListener('loadeddata',ready); element.removeEventListener('error',fail); clearTimeout(timer); };
        const ready = () => { if(element.videoWidth>0 && element.readyState>=2) {cleanup(); resolve();} };
        const fail = () => {cleanup();reject(new Error('浏览器无法解码此视频，请使用 H.264 MP4 或 VP8/VP9 WebM。'));};
        const abort = () => {cleanup();reject(new DOMException('Aborted','AbortError'));};
        const timer = window.setTimeout(fail,30000);
        signal.addEventListener('abort',abort,{once:true});
        element.addEventListener('loadeddata',ready);element.addEventListener('error',fail);
        element.src=url;element.load();
      });
      const texture = new THREE.VideoTexture(element);
      asset = {texture, aspect:element.videoWidth/element.videoHeight,name:file.name,video:element,
        dispose:() => {element.pause();element.removeAttribute('src');element.load();texture.dispose();URL.revokeObjectURL(url);}};
    }
    if (signal.aborted) { asset.dispose(); throw new DOMException('Aborted','AbortError'); }
    asset.texture.colorSpace=THREE.SRGBColorSpace;
    // Shader uses bottom-left UVs; browser image/video uploads use the same orientation.
    asset.texture.flipY=true;asset.texture.generateMipmaps=false;
    asset.texture.minFilter=THREE.LinearFilter;asset.texture.magFilter=THREE.LinearFilter;
    return asset;
  } catch(error) {
    if(videoElement) {videoElement.pause();videoElement.removeAttribute('src');videoElement.load();}
    URL.revokeObjectURL(url);throw error;
  }
}
