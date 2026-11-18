-- Reglas aprendidas de correcciones cuya serie era PRESTADA (seriesFromHint: la
-- ficha o la tarjeta de la portada vista antes de reproducir). Ese texto no lo
-- dijo el reproductor y desde ahora no enseña nada (correctionTeachesRules);
-- las que ya se aprendieron así se quitan. Caso real: un «Outlander» leído de la
-- tarjeta equivocada mientras sonaba Breaking Bad dejó «Outlander = Breaking
-- Bad» con Outlander vetado, y cada Outlander se registraba como Breaking Bad.
-- Solo caen las huellas en las que NINGUNA corrección del dueño enseñaba algo.
DELETE FROM "detection_rules" r
WHERE r."owner" <> 'global'
  AND EXISTS (
    SELECT 1 FROM "detection_corrections" c
    WHERE c."user_id"::text = r."owner" AND c."platform" = r."platform"
      AND c."fingerprint" = r."fingerprint"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "detection_corrections" c
    WHERE c."user_id"::text = r."owner" AND c."platform" = r."platform"
      AND c."fingerprint" = r."fingerprint"
      AND coalesce(c."signal"->>'seriesFromHint', '') <> 'true'
  );
--> statement-breakpoint
DELETE FROM "detection_rules" r
WHERE r."owner" = 'global'
  AND NOT EXISTS (
    SELECT 1 FROM "detection_corrections" c
    WHERE c."platform" = r."platform" AND c."fingerprint" = r."fingerprint"
      AND coalesce(c."signal"->>'seriesFromHint', '') <> 'true'
  );
