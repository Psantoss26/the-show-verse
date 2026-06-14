"use client";

export default function LoginButton() {
  const handleLogin = async () => {
    try {
      const res = await fetch("/api/tmdb/auth/request-token", {
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.authenticate_url) {
        throw new Error(json?.error || "No se pudo iniciar el login");
      }

      window.location.href = json.authenticate_url;
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
