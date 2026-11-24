// Ver src/app/@overlay/(.)details/layout.jsx.
import Page, { generateMetadata } from "@/app/details/tv/[id]/season/[season]/page";
import { withOverlayTitle } from "@/components/navigation/withOverlayTitle";

export { generateMetadata };
// Next no aplica la metadata de un slot paralelo: el título va por el cliente.
export default withOverlayTitle(Page, generateMetadata, "Temporada");

export const revalidate = 3600;
