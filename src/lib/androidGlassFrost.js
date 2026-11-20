// ESCARCHA PARA TODO EL CRISTAL DE LA APP NATIVA DE ANDROID.
//
// En la app (`html[data-android-app]`) `globals.css` quita todos los
// `backdrop-filter`: el WebView volvía a difuminar en cada fotograma del scroll.
// Sin desenfoque, el tinte de cada cristal (pensado para ir SOBRE lo
// difuminado) se queda casi transparente. La escarcha lo sustituye: una sombra
// interior gris muy oscura que llena la caja, más densa cuanto más difumina en
// el navegador. Se rasteriza una vez y no cuesta al desplazar.
//
// Por qué se calcula aquí y no con selectores fijos en `globals.css`: el
// cristal sale de muchos sitios (utilidades `backdrop-blur-*` con las clases
// en varias líneas, clases propias como `.sv-topbar-glass-soft`, estilos de
// styled-jsx, estilos en línea). Una lista a mano siempre dejaba fuera alguno.
// Se leen las hojas de estilo cargadas y, por cada regla que difumina, se
// añade su escarcha con el MISMO selector y las mismas condiciones (@media,
// @supports…): si en el navegador ese elemento difumina, en la app lleva
// escarcha, y solo entonces (un `hover:` o un `desktop:` siguen igual).

export const FROST_RGB = "17 17 20";

/** Densidad del velo según el radio del desenfoque del navegador. */
export function frostAlphaForBlur(px) {
  if (!Number.isFinite(px)) return 0.5;
  if (px <= 0) return 0;
  if (px <= 6) return 0.3;
  if (px >= 24) return 0.62;
  return 0.5;
}

/** Radio en px de un valor de `backdrop-filter` o de `--tw-backdrop-blur`. */
export function blurRadiusPx(value, resolveVar = () => "") {
  if (!value) return NaN;
  let text = String(value);
  // var(--blur-lg) → 16px (variables de tema de Tailwind), varias pasadas.
  for (let i = 0; i < 4 && text.includes("var("); i += 1) {
    text = text.replace(/var\(\s*(--[\w-]+)\s*(?:,([^()]*))?\)/g, (_, name, fallback) => {
      const v = String(resolveVar(name) || "").trim();
      return v || (fallback || "").trim();
    });
  }
  const m = text.match(/blur\(\s*([\d.]+)(px|rem|em)?\s*\)/);
  if (!m) return NaN;
  const n = parseFloat(m[1]);
  return m[2] === "rem" || m[2] === "em" ? n * 16 : n;
}

const TW_SHADOWS = [
  "var(--tw-inset-shadow, 0 0 #0000)",
  "var(--tw-inset-ring-shadow, 0 0 #0000)",
  "var(--tw-ring-offset-shadow, 0 0 #0000)",
  "var(--tw-ring-shadow, 0 0 #0000)",
  "var(--tw-shadow, 0 0 #0000)",
].join(", ");

const PREFIX = "html[data-android-app] ";

/** `.a, .b::before` → `html[data-android-app] .a, html[data-android-app] .b::before`. */
export function prefixSelectorList(selectorText) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < selectorText.length; i += 1) {
    const c = selectorText[i];
    if (c === "\\") i += 1; // carácter escapado de una clase: no cuenta
    else if (c === "(" || c === "[") depth += 1;
    else if (c === ")" || c === "]") depth -= 1;
    else if (c === "," && depth === 0) {
      parts.push(selectorText.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(selectorText.slice(start));
  const out = parts
    .map((s) => s.trim())
    // Lo que ya apunta a <html> o lleva `&` (anidado) no se puede prefijar.
    // Un `\&` escapado es parte de una clase (`max-sm:[&>button]:…`), no anida.
    .filter((s) => s && !/^(html|:root)\b/.test(s) && !/(^|[^\\])&/.test(s))
    .map((s) => PREFIX + s);
  return out.join(", ");
}

/** Declaración de la escarcha para una regla que difumina. */
export function frostDeclaration(alpha, ownShadow, important = false) {
  const tail = ownShadow && ownShadow !== "none" ? ownShadow : TW_SHADOWS;
  // Un cristal forzado (`!backdrop-blur-*`) suele ir junto a un
  // `!shadow-none`: la escarcha tiene que ser igual de fuerte para verse.
  const imp = important ? " !important" : "";
  return `--sv-frost: rgb(${FROST_RGB} / ${alpha})${imp}; box-shadow: inset 0 0 0 100vmax var(--sv-frost), ${tail}${imp};`;
}

const STYLE_RULE = 1;
const MEDIA_RULE = 4;
const SUPPORTS_RULE = 12;
const LAYER_BLOCK_RULE = 18; // solo en las pruebas: Chrome da `type` 0 a las capas

const isLayerBlock = (rule) =>
  typeof CSSLayerBlockRule !== "undefined" && rule instanceof CSSLayerBlockRule;

/**
 * Recorre unas reglas CSSOM (o equivalentes) y devuelve el texto de las reglas
 * de escarcha, conservando @media/@supports. Las reglas anidadas (`&:hover`)
 * no se siguen. Las reglas que ya llevan `data-android-app` no cuentan.
 */
export function frostRulesFrom(rules, resolveVar) {
  const out = [];
  const walk = (list, wrap, layer) => {
    for (const rule of Array.from(list || [])) {
      const type = rule.type;
      if (type === STYLE_RULE && rule.style) {
        const value = rule.style.getPropertyValue("backdrop-filter")
          || rule.style.getPropertyValue("-webkit-backdrop-filter");
        if (!value || /^\s*none\b/.test(value)) continue;
        const sel = rule.selectorText || "";
        if (sel.includes("data-android-app")) continue;
        const twBlur = rule.style.getPropertyValue("--tw-backdrop-blur");
        let px = blurRadiusPx(value, resolveVar);
        if (!Number.isFinite(px)) px = blurRadiusPx(twBlur, resolveVar);
        const alpha = frostAlphaForBlur(px);
        if (!alpha) continue;
        const prefixed = prefixSelectorList(sel);
        if (!prefixed) continue;
        const own = rule.style.getPropertyValue("box-shadow");
        const important = Boolean(
          rule.style.getPropertyPriority?.("backdrop-filter")
            || rule.style.getPropertyPriority?.("-webkit-backdrop-filter")
            || rule.style.getPropertyPriority?.("--tw-backdrop-blur"),
        );
        let text = `${prefixed} { ${frostDeclaration(alpha, own, important)} }`;
        // Con !important una capa gana a lo que no la tiene (al revés que sin
        // él): la escarcha va a la MISMA capa, donde gana por especificidad.
        if (important && layer) text = `@layer ${layer} { ${text} }`;
        out.push(wrap(text));
      } else if (type === MEDIA_RULE && rule.media) {
        const cond = rule.media.mediaText;
        walk(rule.cssRules, (t) => wrap(`@media ${cond} { ${t} }`), layer);
      } else if (type === SUPPORTS_RULE) {
        const cond = rule.conditionText;
        walk(rule.cssRules, (t) => wrap(`@supports ${cond} { ${t} }`), layer);
      } else if (type === LAYER_BLOCK_RULE || isLayerBlock(rule)) {
        // Sin capa por defecto, para ganar a las utilidades.
        const name = rule.name ? (layer ? `${layer}.${rule.name}` : rule.name) : layer;
        walk(rule.cssRules, wrap, name);
      } else if (rule.cssRules && type !== STYLE_RULE) {
        walk(rule.cssRules, wrap, layer);
      }
    }
  };
  walk(rules, (t) => t, "");
  return out;
}

/**
 * Instala la escarcha en el documento: una hoja propia que se rehace cuando
 * llegan hojas nuevas (CSS de cada ruta, styled-jsx). Solo en la app nativa.
 */
export function installAndroidGlassFrost(doc = typeof document !== "undefined" ? document : null) {
  if (!doc || !doc.documentElement.hasAttribute("data-android-app")) return () => {};
  const root = doc.documentElement;
  const resolveVar = (name) => getComputedStyle(root).getPropertyValue(name);
  const own = doc.createElement("style");
  own.id = "sv-android-frost";
  own.setAttribute("data-sv-android-frost", "");
  const seen = new WeakMap();
  let scheduled = 0;

  const rebuild = () => {
    scheduled = 0;
    let changed = false;
    const all = [];
    for (const sheet of Array.from(doc.styleSheets)) {
      if (sheet.ownerNode === own) continue;
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue; // hoja de otro origen
      }
      const count = rules.length;
      const cached = seen.get(sheet);
      if (cached && cached.count === count) {
        all.push(...cached.out);
        continue;
      }
      const out = frostRulesFrom(rules, resolveVar);
      seen.set(sheet, { count, out });
      all.push(...out);
      changed = true;
    }
    const text = all.join("\n");
    if (changed || own.textContent !== text) own.textContent = text;
    if (!own.isConnected) doc.head.appendChild(own);
  };

  const schedule = () => {
    if (scheduled) return;
    scheduled = requestAnimationFrame(rebuild);
  };

  rebuild();
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      for (const n of r.addedNodes) {
        if (n === own) continue;
        if (n.nodeName === "STYLE" || n.nodeName === "LINK") {
          if (n.nodeName === "LINK") n.addEventListener?.("load", schedule, { once: true });
          schedule();
          return;
        }
      }
      if (r.type === "characterData" || (r.target?.nodeName === "STYLE" && r.target !== own)) {
        schedule();
        return;
      }
    }
  });
  observer.observe(doc.head, { childList: true, subtree: true, characterData: true });
  return () => {
    observer.disconnect();
    if (scheduled) cancelAnimationFrame(scheduled);
    own.remove();
  };
}
