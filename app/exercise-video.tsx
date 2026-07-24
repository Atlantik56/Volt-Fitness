"use client";

import { useState } from "react";
import { exerciseVideoId } from "./exercise-videos";

export function ExerciseVideo({name,compact=false,open:openProp,onOpenChange}:{name:string;compact?:boolean;open?:boolean;onOpenChange?:(open:boolean)=>void}) {
  const id=exerciseVideoId(name);
  const [localOpen,setLocalOpen]=useState(false);
  const open=openProp??localOpen;
  const setOpen=onOpenChange??setLocalOpen;
  if(!id)return null;
  return <div className={`exercise-video${compact?" compact":""}`}>
    <button type="button" aria-expanded={open} onClick={event=>{event.preventDefault();event.stopPropagation();setOpen(!open)}}>
      {open?"▴ Скрыть видео":"▶ Смотреть технику"}
    </button>
    {open&&<div className="exercise-video-frame"><iframe src={`https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1`} title={`Техника: ${name}`} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen/></div>}
  </div>;
}
