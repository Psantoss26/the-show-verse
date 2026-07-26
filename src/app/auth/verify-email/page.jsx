import EmailVerificationClient from "./EmailVerificationClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Verificar correo",
};

export default async function VerifyEmailPage({ searchParams }) {
  const params = await Promise.resolve(searchParams);
  const token = typeof params?.token === "string" ? params.token : "";
  return <EmailVerificationClient token={token} />;
}
