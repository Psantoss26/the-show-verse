"use client";

export default function LoginButton() {
  const handleLogin = async () => {
    try {
      const API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;
      if (!API_KEY) throw new Error("Falta NEXT_PUBLIC_TMDB_API_KEY");

      const res = await fetch(
        `https://api.themoviedb.org/3/authentication/token/new?api_key=${encodeURIComponent(API_KEY)}`,
        { headers: { Accept: "application/json" } },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success || !json?.request_token) {
        throw new Error(json?.status_message || "No se pudo iniciar el login");
      }

      const origin = window.location.origin;
      const redirectUrl = `${origin}/auth/callback`;
      const authenticateUrl =
        `https://www.themoviedb.org/authenticate/${json.request_token}` +
        `?redirect_to=${encodeURIComponent(redirectUrl)}`;

      window.location.href = authenticateUrl;
    } catch (e) {
      console.error("Error iniciando login TMDb", e);
      alert("No se pudo iniciar el inicio de sesión con TMDb");
    }
  };

  return (
    <button
      onClick={handleLogin}
      className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
    >
      Iniciar sesión
    </button>
  );
}
