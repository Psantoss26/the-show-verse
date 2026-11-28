"use client";
import OnlineOnlyForm from "@/components/OnlineOnlyForm";
import { LIQUID_GLASS_PANEL, LIQUID_GLASS_MODAL_HEADER } from "@/lib/ui/liquidGlass";

import { useEffect, useMemo, useState, useRef } from "react";
import useActionModalMotion from "@/hooks/useActionModalMotion";
import {
  X,
  Loader2,
  Calendar,
  Pencil,
  Trash2,
  MessageSquare,
  Plus,
} from "lucide-react";
import ModalTitleIcon from "@/components/details/ModalTitleIcon";
import useModalGuard from "@/hooks/useModalGuard";
import ListToggleConfirmModal from "@/components/details/ListToggleConfirmModal";

const formatCommentDate = (value) =>
  new Date(value).toLocaleDateString("es-ES", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

// El modal tiene tres modos:
// - «compose»: no hay comentario propio (o se pidió escribir otro). El cuadro
//   de texto es el protagonista.
// - «read»: ya hay comentario. El más reciente se muestra en grande como
//   contenido principal y el cuadro de texto no aparece hasta pedirlo.
// - «edit»: el cuadro de texto ocupa el sitio del comentario que se edita.
export default function TraktCommentModal({
  open,
  onClose,
  onSubmit,
  onUpdate,
  onDelete,
  title,
  myComments = [],
}) {
  const [commentText, setCommentText] = useState("");
  const [isSpoiler, setIsSpoiler] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // States for Editing and Deleting comments
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [deletingCommentId, setDeletingCommentId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  // Con comentario propio, el usuario pidió escribir uno nuevo.
  const [composingNew, setComposingNew] = useState(false);

  const textareaRef = useRef(null);

  // Más reciente primero. Todos se muestran igual, como contenido principal.
  const sortedComments = useMemo(() => {
    const list = Array.isArray(myComments) ? [...myComments] : [];
    return list.sort(
      (a, b) => new Date(b?.created_at || 0) - new Date(a?.created_at || 0),
    );
  }, [myComments]);
  const hasComments = sortedComments.length > 0;

  // Sin comentarios propios el modal se abre escribiendo; con alguno, leyendo.
  const mode = editingCommentId
    ? "edit"
    : composingNew || !hasComments
      ? "compose"
      : "read";

  // Bloquea scroll de fondo + cierra con Escape mientras el modal está abierto.
  useModalGuard({ open, onClose, closeOnBack: true });

  // Reset fields on modal open
  useEffect(() => {
    if (!open) return;

    setCommentText("");
    setIsSpoiler(false);
    setError("");
    setEditingCommentId(null);
    setDeletingCommentId(null);
    setConfirmDeleteId(null);
    setComposingNew(false);
  }, [open]);

  // Focus textarea on desktop when the composer is the main content
  useEffect(() => {
    if (open && mode === "compose" && typeof window !== "undefined" && window.innerWidth >= 640) {
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [open, mode]);

  const actionMotion = useActionModalMotion(open);
  if (!actionMotion.present) return null;

  const resetComposer = () => {
    setCommentText("");
    setIsSpoiler(false);
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanComment = commentText.trim();
    // Única condición: que haya algo escrito. Ya no hay mínimo de palabras.
    if (!cleanComment) return;

    setSubmitting(true);
    setError("");

    try {
      if (editingCommentId) {
        if (onUpdate) {
          await onUpdate({ commentId: editingCommentId, comment: cleanComment, spoiler: isSpoiler });
        }
        setEditingCommentId(null);
      } else {
        if (onSubmit) {
          await onSubmit({ comment: cleanComment, spoiler: isSpoiler });
        }
        // Publicado: se vuelve a la lectura, con el nuevo como destacado.
        setComposingNew(false);
      }
      setCommentText("");
      setIsSpoiler(false);
    } catch (err) {
      setError(err?.message || "Error al enviar el comentario");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartEdit = (commentItem) => {
    setComposingNew(false);
    setEditingCommentId(commentItem.id);
    setCommentText(commentItem.comment || "");
    setIsSpoiler(commentItem.spoiler || false);
    setError("");
    // Focus the textarea
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);
  };

  const handleStartNew = () => {
    resetComposer();
    setComposingNew(true);
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);
  };

  // Cancelar (editar o escribir otro) devuelve a la lectura.
  const handleCancel = () => {
    setEditingCommentId(null);
    setComposingNew(false);
    resetComposer();
  };

  // La papelera abre la MISMA confirmación que quitar un título de favoritos
  // (ListToggleConfirmModal); al confirmar se cierra y la papelera muestra el
  // spinner mientras se borra.
  const handleConfirmDelete = async () => {
    const commentId = confirmDeleteId;
    setConfirmDeleteId(null);
    if (!commentId) return;
    setDeletingCommentId(commentId);
    setError("");
    try {
      if (onDelete) {
        await onDelete({ commentId });
      }
    } catch (err) {
      setError(err?.message || "Error al eliminar el comentario");
    } finally {
      setDeletingCommentId(null);
    }
  };

  const headerTitle =
    mode === "edit"
      ? "Editar comentario"
      : mode === "read"
        ? sortedComments.length > 1
          ? "Tus comentarios"
          : "Tu comentario"
        : hasComments
            ? "Nuevo comentario"
            : "Escribir comentario";

  const iconButtonBase =
    "rounded-full p-2 text-white/45 transition disabled:pointer-events-none";

  const renderActions = (comment, className = "") => (
    // MISMOS BOTONES QUE EL HISTORIAL DE VISIONADO: solo icono, redondos y en
    // gris tenue, con el color apareciendo al pasar por encima. El nombre
    // accesible va en `aria-label`.
    <div className={`flex shrink-0 items-center gap-0.5 ${className}`}>
      <button
        data-online-only="true"
        type="button"
        onClick={() => handleStartEdit(comment)}
        className={`${iconButtonBase} hover:bg-white/10 hover:text-white`}
        aria-label="Editar"
        title="Editar comentario"
      >
        <Pencil className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => setConfirmDeleteId(comment.id)}
        disabled={deletingCommentId === comment.id}
        className={`${iconButtonBase} hover:bg-red-500/15 hover:text-red-300`}
        aria-label="Eliminar"
        title="Eliminar comentario"
      >
        {deletingCommentId === comment.id ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Trash2 className="w-4 h-4" />
        )}
      </button>
    </div>
  );

  const spoilerBadge = (
    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-rose-500/20 border border-rose-500/30 text-rose-400 uppercase tracking-wider">
      Spoiler
    </span>
  );

  const composer = (
    <OnlineOnlyForm onSubmit={handleSubmit} className="flex flex-col gap-4">
      <textarea
        ref={textareaRef}
        value={commentText}
        onChange={(e) => {
          setCommentText(e.target.value);
          if (error) setError("");
        }}
        placeholder="Escribe tu comentario aquí..."
        className={`w-full rounded-2xl bg-black/30 p-3.5 sm:p-4 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none transition ${
          mode === "compose" && !hasComments
            ? "min-h-[160px] sm:min-h-[240px]"
            : "min-h-[140px] sm:min-h-[180px]"
        }`}
        disabled={submitting}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        {/* Custom Spoiler Toggle Button */}
        <button
          type="button"
          onClick={() => setIsSpoiler(!isSpoiler)}
          disabled={submitting}
          className={`flex items-center gap-2 px-3 py-1.5 sm:px-3.5 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-bold transition-all duration-300 select-none cursor-pointer ${
            isSpoiler
              ? "bg-rose-500/10 border border-rose-500/30 text-rose-400 shadow-[0_0_15px_rgba(239,68,68,0.1)]"
              : "bg-white/5 text-zinc-400 hover:bg-white/10"
          }`}
        >
          <div
            className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full transition-all duration-300 ${
              isSpoiler ? "bg-rose-500 scale-125" : "bg-zinc-500"
            }`}
          />
          <span>Contiene spoilers</span>
        </button>

        {/* Submit / Cancel buttons */}
        <div className="flex items-center justify-end flex-1 sm:flex-none gap-2 sm:gap-3">
          {/* Cancelar solo cuando hay comentarios a los que volver. */}
          {hasComments && (
            <button
              type="button"
              onClick={handleCancel}
              disabled={submitting}
              className="rounded-xl bg-white/5 hover:bg-white/10 px-3.5 py-2 sm:px-4 sm:py-2.5 text-[11px] sm:text-xs font-bold text-zinc-300 transition cursor-pointer"
            >
              Cancelar
            </button>
          )}

          <button
            type="submit"
            // Se sigue impidiendo publicar en vacío, que es lo que
            // rechaza `handleSubmit`; el mínimo de palabras ya no.
            disabled={submitting || !commentText.trim()}
            className="rounded-xl bg-orange-500 hover:bg-orange-600 disabled:bg-zinc-800 disabled:text-zinc-500 px-4 py-2 sm:px-6 sm:py-2.5 text-[11px] sm:text-xs font-bold text-white transition-all flex items-center gap-1.5 sm:gap-2 cursor-pointer disabled:cursor-not-allowed shadow-[0_0_20px_-5px_rgba(249,115,22,0.3)]"
          >
            {submitting && <Loader2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 animate-spin text-white" />}
            <span>{editingCommentId ? "Guardar" : "Publicar"}</span>
          </button>
        </div>
      </div>
    </OnlineOnlyForm>
  );

  // Cada comentario propio, como contenido principal. Son del propio
  // usuario: se muestran enteros aunque lleven spoilers (solo la etiqueta).
  const renderCommentCard = (comment) => (
    <article
      key={comment.id}
      className="rounded-3xl bg-gradient-to-br from-orange-500/[0.14] via-white/[0.05] to-white/[0.03] px-5 pt-4 pb-5 sm:px-6 sm:pt-5 sm:pb-6"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Calendar className="w-3.5 h-3.5 text-orange-300/70" />
          <span className="text-xs text-zinc-300 font-bold">
            {formatCommentDate(comment.created_at)}
          </span>
          {comment.spoiler && spoilerBadge}
        </div>
        {/* Margen negativo: el relleno del botón no mete el icono hacia
            dentro ni alarga la fila; el icono queda a ras del texto. */}
        {renderActions(comment, "-my-1.5 -mr-2")}
      </div>
      <p className="mt-2.5 whitespace-pre-wrap break-words text-base sm:text-lg leading-relaxed text-white">
        {comment.comment}
      </p>
    </article>
  );

  return (
    <div
      className={`fixed inset-0 h-[100dvh] z-[9999] flex items-center justify-center p-4${actionMotion.closing ? " pointer-events-none" : ""}`}
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        ref={actionMotion.backdropRef}
        className="absolute inset-0 bg-black/70 backdrop-blur-lg"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div ref={actionMotion.panelRef} className={`relative w-full max-w-xl flex flex-col sv-modal-max-h overflow-hidden rounded-[2rem] ${LIQUID_GLASS_PANEL}`}>
        {/* Header */}
        <div className={`flex w-full items-center justify-between px-5 py-4 sm:px-6 sm:py-6 ${LIQUID_GLASS_MODAL_HEADER} shrink-0`}>
          <div className="flex min-w-0 items-center gap-3">
            <ModalTitleIcon icon={MessageSquare} tone="orange" />
            <div className="min-w-0">
              <h3 className="text-lg sm:text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-400">
                {headerTitle}
              </h3>
              <p className="text-[10px] sm:text-xs text-zinc-500 mt-0.5 sm:mt-1 font-medium tracking-wide uppercase">
                {title || "Trakt.tv"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-full bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition shadow-sm cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="sv-modal-scroll-fade flex-1 overflow-y-auto sv-scroll">
          <div className="px-5 py-5 sm:px-6 sm:py-6 space-y-5 sm:space-y-6">
            {/* Escribiendo uno nuevo: el cuadro de texto va arriba. */}
            {mode === "compose" && composer}

            {/* Los comentarios propios, todos con el mismo diseño. El que se
                edita deja su sitio al cuadro de texto. */}
            {hasComments && (
              <div className="space-y-3 sm:space-y-4">
                {sortedComments.map((comment) =>
                  editingCommentId === comment.id ? (
                    <div key={comment.id}>{composer}</div>
                  ) : (
                    renderCommentCard(comment)
                  ),
                )}
              </div>
            )}

            {error && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium text-center">
                {error}
              </div>
            )}

            {mode === "read" && (
              <button
                data-online-only="true"
                type="button"
                onClick={handleStartNew}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white/5 px-4 py-3 text-xs sm:text-sm font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Escribir otro comentario
              </button>
            )}
          </div>
        </div>
      </div>

      <ListToggleConfirmModal
        open={Boolean(confirmDeleteId)}
        kind="comment"
        active
        itemTitle={title}
        subject="este comentario"
        onConfirm={handleConfirmDelete}
        onClose={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
