-- Pro permanente para la cuenta del creador de la app (@psantos26): sin
-- fecha de fin, así getEntitlements le da Pro y publicPlanBadge la insignia
-- Pro aunque la facturación esté apagada. Solo lo cambiaría un webhook de una
-- suscripción suya de Stripe (refreshUserPlan).
UPDATE "users" SET "plan" = 'pro', "plan_expires_at" = NULL, "updated_at" = now()
WHERE lower("username") = 'psantos26';
