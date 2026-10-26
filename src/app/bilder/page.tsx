import { figmaLink, leseRegister } from "@/lib/figma-ansichten/figma-ansichten";
import { BilderSeite } from "./bild";
import "../freigabe.css";

export const dynamic = "force-dynamic";

/** Figma-Bilder (SIN-1038): je Registereintrag das aktuelle PNG, geladen über /api/figma-bild. Register wird auf dem Server gelesen. */
export default function Bilder() {
  return <BilderSeite ansichten={leseRegister().map((a) => ({ ...a, link: figmaLink(a) }))} />;
}
