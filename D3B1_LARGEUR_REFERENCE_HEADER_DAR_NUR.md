# Phase D3b-1 — Décision : largeur de référence du header (§7.1)

**Statut** : décision d'architecture validée. Document de conception, lecture seule — aucun CSS, aucun HTML, aucune valeur de largeur figée.

**Référence** : `CAHIER_CONTRAINTES_HEADER_DESKTOP_DAR_NUR.md` (D1), `STRATEGIES_LAYOUT_HEADER_DESKTOP_DAR_NUR.md` (D2), `REVUE_COMPARATIVE_HEADER_DESKTOP_DAR_NUR.md` (D2.5), `WIREFRAME_HEADER_DESKTOP_STRATEGIE_C_DAR_NUR.md` (D3a, §7 point 1).

---

## 1. Mini-audit

**Fait vérifié** (grep, pas supposition) : `1240px` n'est pas une valeur propre au header. C'est le conteneur `.wrap` partagé par tout le reste du site.
- `tahara/index.html:94` → `.wrap{max-width:1240px;margin:0 auto;padding:0 28px}` — padding identique aux 28px du `nav`.
- `index.html:279` → `.wrap{max-width:1240px;margin:0 auto}` — même valeur sur la homepage.

Le header est aujourd'hui aligné, pixel pour pixel, sur le même conteneur que le hero, les grilles produits et les sections éditoriales. C'est cette contrainte, héritée du reste du site et non conçue pour la navigation, qui plafonne le budget disponible mesuré en D1 (~1007px, déficit ~91px).

## 2. Options considérées

| Option | Avantages | Inconvénients |
|---|---|---|
| **1 — Garder `.wrap`/1240px** | Cohérence visuelle immédiate avec le reste du site, zéro nouvelle vérification de rythme | Contredit la conclusion même de D2.5 : reviendrait à nier que le contenant hérité est la cause du problème |
| **2 — Assouplir** (référence propre au header, légèrement supérieure à 1240px) | Gain d'espace sans rupture visuelle radicale | Solution de transition qui ne remet pas en cause le principe ; risque de créer un état intermédiaire ambigu (« 1240px... mais un peu plus ») sans valeur de long terme claire |
| **3 — Système de composition propre au header, indépendant de `.wrap`** | Cohérent avec la stratégie C (le header comme composant d'identité, pas une extension du contenu) ; la meilleure marge d'évolutivité ; pattern courant sur les sites premium (header et contenu avec des rythmes de composition distincts mais harmonieux) | Rupture assumée avec l'alignement actuel ; demande la vérification de non-régression la plus large des trois (déjà signalé comme risque propre à C en D2) |

## 3. Décision retenue

**Le header n'est plus contraint par le conteneur historique `.wrap` de 1240px. Il adopte son propre système de composition, défini spécifiquement pour la stratégie C.**

La largeur exacte ne constitue pas encore une décision — elle sera déterminée lors des wireframes (D3c), à partir des besoins de composition et non d'une valeur héritée. Cette formulation laisse explicitement ouvertes plusieurs possibilités, toutes compatibles avec la décision d'aujourd'hui :
- une composition sur toute la largeur utile,
- une largeur maximale différente de 1240px,
- un système asymétrique,
- un jeu de marges propre au header.

**Ce qui n'est pas décidé ici** : la disposition de la navigation dans cet espace (§7.2), la hauteur cible (§7.3 — renuméroté suite à cette décision, voir note), ni aucune valeur en pixels.

## 4. Compatibilité avec D1 / D2 / D2.5

- **D1** avait explicitement anticipé cette possibilité (« la borne 1240px pourra être revalidée lors de la Phase D2 si les variantes de layout le justifient »). Cette décision l'exerce, elle ne la contredit pas.
- **D2** définissait la stratégie C comme un header qui « cesse d'être une barre technique... devient une pièce d'identité » — un composant d'identité n'est pas tenu de partager le système de composition des sections de contenu.
- **D2.5** justifiait le choix de C par la maturité du projet, pas par un gain de quelques pixels — cette décision confirme que le raisonnement est bien architectural, pas cosmétique.

## 5. Prochaine étape

Cette décision ouvre directement la question suivante : **comment organiser ce nouvel espace ?** — objet de D3b-2 (§7.2, architecture générale : une rangée, deux rangées, hybride, ou autre).
