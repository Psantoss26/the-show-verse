"use client";
import { useServerOnline } from "@/context/ServerStatusContext";

// Editing forms remain readable, including their saved values, while native
// controls and keyboard submissions are disabled. Navigation stays outside.
export default function OnlineOnlyForm({ children, onSubmit, ...props }) {
  const online = useServerOnline();
  return <form {...props} data-online-only="true" onSubmit={(event) => {
    if (!online) { event.preventDefault(); return; }
    onSubmit?.(event);
  }}><fieldset className="contents" disabled={!online}>{children}</fieldset></form>;
}
