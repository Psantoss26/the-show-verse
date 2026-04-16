"use client";

import LoginForm from "@/components/auth/LoginForm";

export default function LoginClient({ next }) {
  return (
    <main className="min-h-[calc(100dvh-4rem)] bg-black text-white flex items-center justify-center px-4">
      <LoginForm next={next} />
    </main>
  );
}
