import { Suspense } from "react";
import PageTitle from "@/components/navigation/PageTitle";

// Fichas interceptadas (@overlay/(.)details): Next NO aplica la metadata de un
// slot paralelo, solo la del árbol `children` (la página de debajo), así que la
// pestaña seguía con el título de esa página. Aquí se resuelve el mismo
// `generateMetadata` de la ficha y se registra su título en el cliente (ver
// lib/navigation/documentTitle.js). Va en su propio Suspense para no retrasar
// la ficha: mientras llega, el título genérico `fallbackTitle`.

function titleText(title) {
  if (typeof title === "string") return title;
  return title?.absolute || title?.default || "";
}

async function ResolvedTitle({ generateMetadata, props, fallbackTitle }) {
  const metadata = await generateMetadata(props).catch(() => null);
  return <PageTitle title={titleText(metadata?.title) || fallbackTitle} />;
}

export function withOverlayTitle(Page, generateMetadata, fallbackTitle) {
  return function OverlayPageWithTitle(props) {
    return (
      <>
        <Suspense fallback={<PageTitle title={fallbackTitle} />}>
          <ResolvedTitle generateMetadata={generateMetadata} props={props} fallbackTitle={fallbackTitle} />
        </Suspense>
        <Page {...props} />
      </>
    );
  };
}
