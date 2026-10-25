// ESLint-Regel (SIN-1063): Jede exportierte Funktion braucht direkt davor einen Doku-Kommentar mit einem Satz.
const istFunktion = (knoten) =>
  knoten?.type === "FunctionDeclaration" ||
  knoten?.type === "ArrowFunctionExpression" ||
  knoten?.type === "FunctionExpression";

/** Gibt die exportierten Funktions-Knoten einer Export-Deklaration zurück. */
function funktionenIn(deklaration) {
  if (istFunktion(deklaration)) return [deklaration];
  if (deklaration?.type !== "VariableDeclaration") return [];
  return deklaration.declarations.filter((d) => istFunktion(d.init));
}

export const dokuSatz = {
  meta: {
    type: "suggestion",
    schema: [],
    messages: { fehlt: "Exportierte Funktion braucht einen Satz in einem Doku-Kommentar davor (docs/STANDARD.md)." },
  },
  create(kontext) {
    const quelle = kontext.sourceCode;
    return {
      "ExportNamedDeclaration, ExportDefaultDeclaration"(knoten) {
        if (funktionenIn(knoten.declaration).length === 0) return;
        const hatSatz = quelle
          .getCommentsBefore(knoten)
          .some((k) => k.type === "Block" && k.value.startsWith("*") && k.value.replace(/[*\s]/g, "") !== "");
        if (!hatSatz) kontext.report({ node: knoten, messageId: "fehlt" });
      },
    };
  },
};

const plugin = { rules: { "doku-satz": dokuSatz } };
export default plugin;
