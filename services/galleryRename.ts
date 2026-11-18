// Logique pure du renommage d'une toile ou d'un dossier dans la galerie.

/**
 * Nom à enregistrer après saisie. Une chaîne vide (ou seuls espaces)
 * n'est pas un nouveau nom : on ne change rien.
 */
export function committedRename(input: string): string | null {
  const name = input.trim();
  return name.length > 0 ? name : null;
}
