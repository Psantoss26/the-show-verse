"use client";

// Flujo de "añadir a lista" autocontenido para la baraja de recomendaciones.
//
// DetailsClient monta este mismo modal con 17 props de estado propio. Aquí ese
// estado se encapsula en un hook para no duplicar ese cableado en la página de
// recomendaciones (y sin refactorizar DetailsClient, que es enorme y no es el
// objetivo de este trabajo).
//
// Diferencia deliberada con DetailsClient: allí se calcula el mapa completo de
// pertenencia consultando el detalle de CADA lista. Aquí las cartas van pasando
// una tras otra, así que pagar esas consultas por carta no compensa: basta con
// recordar a qué listas se ha añadido la carta ACTUAL durante esta sesión.

import { useCallback, useEffect, useState } from "react";
import {
  addMovieToList,
  createUserList,
  fetchUserLists,
} from "@/lib/api/backendLists";

function getListId(list) {
  return list?.id ?? list?.listId ?? null;
}

export default function useAddToListFlow() {
  const [item, setItem] = useState(null); // carta para la que está abierto
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [busyListId, setBusyListId] = useState(null);
  const [addedListIds, setAddedListIds] = useState({});
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const open = Boolean(item);

  const loadLists = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchUserLists();
      setLists(Array.isArray(result) ? result : result?.lists || []);
    } catch (err) {
      setError(err?.message || "No se pudieron cargar tus listas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    loadLists();
  }, [open, loadLists]);

  const openFor = useCallback((nextItem) => {
    // Cada carta empieza sin marcas de pertenencia: son de la carta anterior.
    setAddedListIds({});
    setQuery("");
    setCreateOpen(false);
    setNewName("");
    setNewDesc("");
    setError("");
    setItem(nextItem);
  }, []);

  const close = useCallback(() => setItem(null), []);

  const addTo = useCallback(
    async (listId) => {
      const lid = getListId(listId) ?? listId;
      if (!lid || !item?.tmdbId || addedListIds[lid]) return;
      setBusyListId(lid);
      setError("");
      try {
        await addMovieToList({
          listId: lid,
          movieId: item.tmdbId,
          mediaType: item.mediaType === "tv" ? "tv" : "movie",
          title: item.title,
          posterPath: item.posterPath,
        });
        setAddedListIds((prev) => ({ ...prev, [lid]: true }));
      } catch (err) {
        setError(err?.message || "No se pudo añadir a la lista.");
      } finally {
        setBusyListId(null);
      }
    },
    [item, addedListIds],
  );

  const createAndAdd = useCallback(async () => {
    const name = newName.trim();
    if (!name || !item?.tmdbId) return;
    setCreating(true);
    setError("");
    try {
      const created = await createUserList({
        name,
        description: newDesc.trim(),
      });
      const lid = getListId(created) ?? getListId(created?.list);
      if (lid) {
        await addMovieToList({
          listId: lid,
          movieId: item.tmdbId,
          mediaType: item.mediaType === "tv" ? "tv" : "movie",
          title: item.title,
          posterPath: item.posterPath,
        });
        setAddedListIds((prev) => ({ ...prev, [lid]: true }));
      }
      setCreateOpen(false);
      setNewName("");
      setNewDesc("");
      await loadLists();
    } catch (err) {
      setError(err?.message || "No se pudo crear la lista.");
    } finally {
      setCreating(false);
    }
  }, [newName, newDesc, item, loadLists]);

  return {
    item,
    open,
    openFor,
    close,
    // props que espera <AddToListModal>
    modalProps: {
      open,
      onClose: close,
      lists,
      loading,
      error,
      query,
      setQuery,
      membershipMap: addedListIds,
      busyListId,
      onAddToList: addTo,
      creating,
      createOpen,
      setCreateOpen,
      newName,
      setNewName,
      newDesc,
      setNewDesc,
      onCreateList: createAndAdd,
    },
  };
}
