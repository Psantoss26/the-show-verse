"use client";

export default function LoginButton() {
  const handleLogin = () => {
    const next =
      typeof window === "undefined"
        ? "/"
        : `${window.location.pathname}${window.location.search}`;
    window.location.href = `/login?next=${encodeURIComponent(
      next,
    )}`;
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
