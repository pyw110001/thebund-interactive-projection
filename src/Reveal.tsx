import {type ReactNode,useEffect,useState} from 'react';

/** Keep exit content mounted until the height/opacity transition has finished. */
export function useExitValue<T>(value:T|undefined,duration=360):T|undefined {
  const [retained,setRetained]=useState(value);
  useEffect(()=>{
    if(value!==undefined){setRetained(value);return;}
    const timer=window.setTimeout(()=>setRetained(undefined),duration);
    return()=>window.clearTimeout(timer);
  },[value,duration]);
  return value??retained;
}

export function Reveal({open,children,className=''}:{open:boolean;children:ReactNode;className?:string}){
  return <div className={`reveal ${open?'is-open':''} ${className}`} inert={!open} aria-hidden={!open}>
    <div className="reveal-clip">{children}</div>
  </div>;
}
