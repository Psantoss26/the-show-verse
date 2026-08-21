import { AUTH_USER_CACHE_KEY } from "@/lib/auth/authUserCache";

// EL AVATAR, YA PINTADO EN EL PRIMER FOTOGRAMA.
//
// El HTML que sirve el servidor no puede saber quién eres: las páginas se
// prerrenderizan, así que el navbar sale siempre con el hueco de "cargando" y la
// foto —o la inicial— no aparecía hasta que React hidrataba y AuthContext leía
// la caché. En una recarga eso son unas décimas en las que el avatar se ve
// vacío, justo el estado que el respaldo de la inicial debía evitar.
//
// El layout raíz lo registra con `next/script` y `beforeInteractive`, de modo
// que Next lo incluye en el HTML inicial antes de hidratar el navbar. Deja en
// :root la foto y la inicial del usuario de este dispositivo, y `.avatar-boot`
// (globals.css) las consume. Sin caché no toca nada y el hueco sigue latiendo.
//
// Se escribe en variables CSS en vez de tocar el DOM porque el elemento del
// avatar todavía no existe cuando esto corre, y porque así React puede hidratar
// después sin encontrarse nodos que él no creó.
export const AVATAR_BOOT_SCRIPT = `(function(){try{
var k=${JSON.stringify(AUTH_USER_CACHE_KEY)};
var raw=window.localStorage.getItem(k)||window.sessionStorage.getItem(k);
if(!raw)return;
var u=(JSON.parse(raw)||{}).user;
if(!u)return;
var root=document.documentElement;
var src=u.avatarUrl;
var hasImage=typeof src==="string"&&src&&!/[\\r\\n]/.test(src);
var name=String(u.displayName||u.name||u.username||"").trim();
var letter=Array.from(name)[0];
if(!hasImage&&!letter)return;
// JSON.stringify entrega la cadena entrecomillada y con los escapes que CSS
// necesita: la URL la elige el usuario y puede traer comillas.
root.style.setProperty("--avatar-initial",hasImage?'""':JSON.stringify(letter.toUpperCase()));
root.style.setProperty("--avatar-image",hasImage?"url("+JSON.stringify(src)+")":"none");
root.setAttribute("data-avatar-boot","");
}catch(e){}})();`;
