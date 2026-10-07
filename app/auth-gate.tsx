"use client";
import { PwaInstall } from "./pwa-register";
import { FormEvent,useEffect,useState } from "react";
import { APP_NAME, APP_MOTTO } from "@/lib/brand";
import { authStatusClient, invalidateAuthStatus, type AuthState } from "@/lib/auth-status-client";
export default function AuthGate({children}:{children:React.ReactNode}){const [state,setState]=useState<AuthState|null>(()=>authStatusClient.peek()),[error,setError]=useState("");useEffect(()=>{
 let active=true;
 const sequence={current:0};
 const refresh=(force=false)=>{
  const current=++sequence.current;
  if(force)setState(null);
  setError("");
  void authStatusClient.load(force).then(next=>{if(active&&current===sequence.current)setState(next)}).catch(()=>{if(active&&current===sequence.current)setError("Не удалось проверить авторизацию. Обновите страницу.")});
 };
 const onVisible=()=>{if(document.visibilityState==="visible")refresh(true)};
 const onPageShow=(event:PageTransitionEvent)=>{if(event.persisted)refresh(true)};
 const onInvalidated=()=>refresh(true);
 refresh();
 document.addEventListener("visibilitychange",onVisible);
 window.addEventListener("pageshow",onPageShow);
 window.addEventListener("volt-auth-invalidated",onInvalidated);
 return()=>{active=false;document.removeEventListener("visibilitychange",onVisible);window.removeEventListener("pageshow",onPageShow);window.removeEventListener("volt-auth-invalidated",onInvalidated)};
},[]);if(!state)return <main className="auth-screen"><div className="auth-card"><span className="auth-logo ritmovis-mark" aria-hidden="true" /><p>{error||"Загрузка VOLT…"}</p></div></main>;if(state.authenticated)return <>{children}</>;const submit=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();setError("");const fd=new FormData(e.currentTarget);const body:any=Object.fromEntries(fd);if(!state.setupRequired)body.remember=fd.get("remember")==="on";const r=await fetch(state.setupRequired?"/api/auth/setup":"/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}),j=await r.json();if(!r.ok)return setError(j.error||"Ошибка");invalidateAuthStatus();location.reload()};return <main className="auth-screen"><form className="auth-card" onSubmit={submit}><span className="auth-logo ritmovis-mark" aria-hidden="true" /><p className="eyebrow">{APP_NAME}</p><p className="auth-motto">{APP_MOTTO}</p><h1>{state.setupRequired?"Задайте пароль":"С возвращением"}</h1><p>{state.setupRequired?"Первичная настройка выполняется один раз. Данные останутся на вашем сервере.":"Введите пароль для доступа к личным данным."}</p><label>Логин<input name="username" value="Atlantik" readOnly autoComplete="username"/></label><label>Пароль<input name="password" type="password" minLength={12} maxLength={128} required autoComplete={state.setupRequired?"new-password":"current-password"}/></label>{state.setupRequired&&<label>Повторите пароль<input name="confirm" type="password" minLength={12} maxLength={128} required autoComplete="new-password"/></label>}{!state.setupRequired&&<label className="auth-remember"><input name="remember" type="checkbox" defaultChecked/> Запомнить меня на этом устройстве (180 дней)</label>}{error&&<div className="auth-error">{error}</div>}<button>{state.setupRequired?"Создать защищённый профиль":"Войти"}</button>{state.setupRequired&&<small>Минимум 12 символов. Используйте уникальную парольную фразу.</small>}<PwaInstall/></form></main>}
