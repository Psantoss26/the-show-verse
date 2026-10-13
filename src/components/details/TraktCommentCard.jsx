"use client";

// Tarjeta de un comentario de Trakt (o de la comunidad) en la sección
// «Comentarios» de la ficha y en su vista lateral completa
// (details/sectionSheet): mismo marcado en los dos sitios.

import Link from "next/link";
import Avatar from "@/components/ui/Avatar";
import CommentLikeButton from "@/components/community/CommentLikeButton";
import { formatDateTimeEs, stripHtml } from "@/lib/details/formatters";

export default function TraktCommentCard({
  comment: c,
  // Map usuario de Trakt (minúsculas) → usuario de aquí, para enlazar su perfil.
  profileUsernames = null,
  mediaType,
  tmdbId,
  canLike = false,
}) {
  const user = c?.user || {};
  const avatar = user?.images?.avatar?.full || user?.images?.avatar?.medium || null;
  const text = stripHtml(c?.comment?.comment ?? c?.comment ?? "");
  const created = c?.created_at ? formatDateTimeEs(c.created_at) : "";
  const likes = Number(c?.likes || 0);
  const commentUsername = String(user?.username || "").trim();
  const profileUsername = profileUsernames?.get?.(commentUsername.toLowerCase());
  const authorName = user?.name || user?.username || "Usuario";

  return (
    <div
      // DENTRO del panel de cristal: la tarjeta NO
      // lleva desenfoque propio. Al apilar un
      // backdrop-filter sobre otro se difumina lo ya
      // difuminado y la pieza se vuelve una caja gris
      // plana, justo lo contrario del efecto. Aquí
      // basta un velo translúcido: el cristal que se
      // ve es el del panel, continuo bajo todas.
      //
      // El velo TIÑE EN NEGRO, no en blanco: encima de
      // un panel ya translúcido, blanco sobre blanco se
      // sumaba y sobre un backdrop claro se comía el
      // texto. En negro la tarjeta se separa por
      // contraste, que además es lo que sostiene la
      // lectura.
      className="group relative isolate flex gap-4 overflow-hidden rounded-2xl bg-black/10 p-5 transform-gpu transition-colors duration-300 hover:bg-black/5"
    >
      {/* Avatar */}
      <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 text-lg font-black text-white shadow-lg ring-2 ring-white/10 transition group-hover:ring-white/20">
        <Avatar
          src={avatar}
          name={authorName}
          alt={user?.username}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 min-w-0 flex-1">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <div className="flex items-center gap-2">
            {profileUsername ? (
              <Link
                href={`/u/${encodeURIComponent(profileUsername)}`}
                className="font-bold text-white transition-colors hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
              >
                {authorName}
              </Link>
            ) : (
              <span className="font-bold text-white">
                {authorName}
              </span>
            )}
            {user?.vip && (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.8)]" />
                VIP
              </span>
            )}
          </div>
          <span className="text-xs text-zinc-500">
            {created}
          </span>
        </div>

        <div className="relative text-sm leading-relaxed text-zinc-300">
          {/* Icono de comillas decorativo */}
          <span className="absolute -left-3 -top-1 font-serif text-4xl text-white/5">
            “
          </span>
          <p className="whitespace-pre-line">
            {text}
          </p>
        </div>

        {/* Actions Footer */}
        <div className="mt-3 flex items-center gap-4 border-t border-white/5 pt-3">
          <CommentLikeButton
            commentId={c?.id}
            // 'tv'|'movie' (no el 'show' de Trakt): es lo
            // que espera el backend.
            mediaType={mediaType}
            tmdbId={tmdbId}
            likes={likes}
            liked={Boolean(c?.liked)}
            canLike={canLike}
          />
        </div>
      </div>
    </div>
  );
}
