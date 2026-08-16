"use client";

import Link from "next/link";
import Avatar from "@/components/ui/Avatar";
import FollowButton from "./FollowButton";

// Fila de un miembro: avatar + nombre/usuario (+ bio opcional) + botón de
// seguir. Se usa en la búsqueda de miembros y en las listas seguidores/siguiendo.
export default function MemberRow({ member }) {
  if (!member?.username) return null;
  const label = member.displayName || member.username;
  return (
    <div className="flex items-center gap-3 rounded-xl bg-zinc-900/40 p-3 transition-all hover:bg-zinc-900/60">
      <Link
        href={`/u/${member.username}`}
        className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-800 text-lg font-black text-white shadow-sm"
      >
        <Avatar src={member.avatarUrl} name={label} loading="lazy" />
      </Link>

      <Link href={`/u/${member.username}`} className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-white">{label}</p>
        <p className="truncate text-xs text-zinc-500">@{member.username}</p>
        {member.bio ? (
          <p className="mt-0.5 truncate text-xs text-zinc-600">{member.bio}</p>
        ) : typeof member.followerCount === "number" ? (
          <p className="mt-0.5 text-xs text-zinc-600">
            {member.followerCount}{" "}
            {member.followerCount === 1 ? "seguidor" : "seguidores"}
          </p>
        ) : null}
      </Link>

      {!member.isSelf && (
        <FollowButton
          username={member.username}
          initialFollowing={member.isFollowing}
          size="sm"
          className="flex-shrink-0"
        />
      )}
    </div>
  );
}
