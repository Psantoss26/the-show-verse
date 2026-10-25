"use client";

// src/components/today/TodayPersonDrawer.jsx
// Panel lateral de una persona en Hoy (al pulsarla en «Más activos», en la
// destacada o en el feed): todo lo suyo de la ventana elegida. Es el MISMO
// panel que las secciones de DetailsClient (SectionSheet: cristal, cabecera
// fija con pestañas y buscador, filas TitleRow), con el acento rosa de Social.
// Pulsar un título abre su ficha rápida.

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import FollowButton from "@/components/social/FollowButton";
import { useDetailModal } from "@/components/dashboard/DetailModalProvider";
import SectionSheet, { SectionSheetEmpty } from "@/components/details/sectionSheet/SectionSheet";
import { TitleRow } from "@/components/details/sectionSheet/SectionSheetRows";
import { relativeTime } from "@/lib/notifications/alerts";
import { UserAvatar } from "./TodayParts";
import { actionPhrase, displayName, profileHref, ratingTen } from "./todayUi";

const TABS = [
  { id: "all", label: "Todo", match: () => true },
  { id: "watch", label: "Vistos", match: (a) => a.kind === "watch" },
  { id: "rating", label: "Notas", match: (a) => a.kind === "rating" || a.rating != null },
  { id: "comment", label: "Reseñas", match: (a) => a.kind === "comment" },
];

// «Ha visto T6 · E6 · 9/10 · hace 2 h» y, si es una reseña, su texto.
function detailOf(action) {
  const line = [
    actionPhrase(action).replace(/^ha /, "Ha "),
    action.rating != null ? `${ratingTen(action.rating)}/10` : null,
    relativeTime(action.activityAt),
  ].filter(Boolean).join(" · ");
  if (action.kind !== "comment") return line;
  return (
    <>
      {line}
      <span className="mt-1 block text-zinc-300">
        {action.comment.spoiler ? "Reseña con spoilers" : `“${action.comment.body}”`}
      </span>
    </>
  );
}

export default function TodayPersonDrawer({ person, actions, following, viewerId, onClose }) {
  const { openDetailModal } = useDetailModal();
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");

  const own = useMemo(
    () => (person ? (actions || []).filter((a) => a.user?.id === person.id) : []),
    [actions, person],
  );
  const tabs = TABS
    .map((t) => ({ id: t.id, label: t.label, count: own.filter(t.match).length }))
    .filter((t) => t.id === "all" || t.count > 0);
  const activeTab = tabs.some((t) => t.id === tab) ? tab : "all";
  const text = query.trim().toLowerCase();
  const visible = own.filter(
    (a) => TABS.find((t) => t.id === activeTab).match(a) && (!text || (a.media?.title || "").toLowerCase().includes(text)),
  );

  const close = () => {
    setTab("all");
    setQuery("");
    onClose?.();
  };
  const href = profileHref(person);

  return (
    <SectionSheet
      open={Boolean(person)}
      onClose={close}
      accent="pink"
      title={displayName(person)}
      subtitle={[person?.username ? `@${person.username}` : null, `${own.length} ${own.length === 1 ? "historia" : "historias"}`].filter(Boolean).join(" · ")}
      leading={person ? <UserAvatar user={person} className="h-10 w-10" /> : null}
      headerAction={
        <div className="flex shrink-0 items-center gap-2">
          {person && person.id !== viewerId && person.username ? (
            <FollowButton username={person.username} initialFollowing={following} size="sm" bordered={false} />
          ) : null}
          {href ? (
            <Link
              href={href}
              onClick={close}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white"
              aria-label="Ver perfil"
              title="Ver perfil"
            >
              <ArrowUpRight className="h-5 w-5" />
            </Link>
          ) : null}
        </div>
      }
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setTab}
      search={own.length > 4 ? { value: query, onChange: setQuery, placeholder: "Buscar un título…" } : null}
    >
      {visible.length ? (
        <ul className="space-y-2">
          {visible.map((action) => (
            <li key={action.key}>
              <TitleRow
                item={{
                  id: action.media.tmdbId,
                  media_type: action.media.type,
                  title: action.media.title,
                  name: action.media.title,
                  poster_path: action.media.posterPath,
                  backdrop_path: action.media.backdropPath,
                }}
                mediaType={action.media.type}
                year={action.media.year || ""}
                voteAverage={null}
                detail={detailOf(action)}
                onNavigate={close}
                onOpenTitle={openDetailModal ? (item) => openDetailModal(item) : undefined}
              />
            </li>
          ))}
        </ul>
      ) : (
        <SectionSheetEmpty>{text ? "Ningún título coincide con la búsqueda." : "Nada en esta pestaña."}</SectionSheetEmpty>
      )}
    </SectionSheet>
  );
}
