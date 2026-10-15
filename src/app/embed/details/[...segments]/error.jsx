"use client";

import { useEffect } from "react";
import DetailsError from "@/app/details/error";
import { sendEmbeddedDetailsAction } from "@/lib/navigation/embeddedDetails";

export default function EmbeddedDetailsError(props) {
  useEffect(() => {
    // Streaming errors can arrive after iframe.onload; keep retry reachable.
    sendEmbeddedDetailsAction("hero-ready");
  }, []);
  return <DetailsError {...props} />;
}
