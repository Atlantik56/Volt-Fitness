"use client";

import { useState } from "react";
import { exerciseVideoId } from "./exercise-videos";

export function ExerciseVideo({name,compact=false}:{name:string;compact?:boolean}) {
  const id=exerciseVideoId(name);
  const [open,setOpen]=useState(false);
  if(!id)return null;
  return <div className={`exercise-video${compact?" compact":""}`}>
    <button type="button" aria-expanded={open} onClick={event=>{event.preventDefault();event.stopPropagation();setOpen(value=>!value)}}>
      {open?"▴ Скрыть видео":"▶ Смотреть технику"}
    </button>
    {open&&<div className="exercise-video-frame"><iframe src={`https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1`} title={`Техника: ${name}`} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen/></div>}
  </div>;
}
