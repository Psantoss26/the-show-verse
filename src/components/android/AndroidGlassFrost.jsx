"use client";

// Escarcha del cristal en la app nativa de Android (ver lib/androidGlassFrost.js).
// Fuera de la app no hace nada.

import { useEffect } from "react";

import { installAndroidGlassFrost } from "@/lib/androidGlassFrost";

export default function AndroidGlassFrost() {
  useEffect(() => installAndroidGlassFrost(), []);
  return null;
}
