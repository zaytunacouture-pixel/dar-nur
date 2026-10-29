#!/usr/bin/env bash
# Régénère tout le site statique depuis Supabase puis publie sur main, en un seul commit.
# Utilisé par .github/workflows/regenerate-product-pages.yml (automatique) et
# regenerate-parfums.yml (secours manuel), tous deux dans le groupe de concurrence
# « regenerate-site » : une seule exécution à la fois.
#
# Ordre fixe des générateurs (chacun lit Supabase, aucun n'écrit en base) :
#   1. fiches produit /{slug}/ + sitemap.xml (base)
#   2. blocs AUTO des pages catégories
#   3. blocs AUTO de idees-cadeaux/
#   4. collection Parfums (hub + pages marque) — APRÈS les fiches : une carte ne
#      doit jamais être publiée avant la fiche vers laquelle elle pointe ; complète
#      aussi sitemap.xml
#   5. index de recherche data/search-index.json
#
# Publication : si main a avancé pendant la génération, on ne rebase PAS des fichiers
# générés devenus obsolètes (un rebase de sitemap.xml peut entrer en conflit). On
# abandonne le commit local, on repart du dernier main et on régénère depuis la base.
# Une exécution qui ne change rien ne committe rien.
#
# Variables : EVENEMENT (github.event_name ; « schedule » = rattrapage planifié),
# PARFUMS_SUPABASE_URL / PARFUMS_SUPABASE_KEY (générateur Parfums),
# REMOTE (défaut origin), BRANCHE (défaut main), TENTATIVES (défaut 5).
set -euo pipefail

REMOTE="${REMOTE:-origin}"
BRANCHE="${BRANCHE:-main}"
TENTATIVES="${TENTATIVES:-5}"
EVENEMENT="${EVENEMENT:-manuel}"

generer() {
  node scripts/generate-product-pages.mjs
  node scripts/generate-category-pages.mjs
  node scripts/generate-gift-page.mjs
  node scripts/generate-parfums.mjs
  node scripts/generate-search-index.mjs
}

resume() {
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then echo "$1" >> "$GITHUB_STEP_SUMMARY"; fi
}

if [ "$EVENEMENT" = "schedule" ]; then
  MESSAGE="chore: régénère le site depuis Supabase (rattrapage planifié, webhook manqué) [skip ci]"
else
  MESSAGE="chore: régénère le site depuis Supabase (fiches, catégories, cadeaux, parfums, recherche) [skip ci]"
fi

for tentative in $(seq 1 "$TENTATIVES"); do
  generer

  # git add -A sans restriction de chemin : le checkout du job est toujours neuf,
  # aucun fichier étranger ne peut s'y trouver.
  git add -A
  if git diff --cached --quiet; then
    echo "::notice::Contenu identique au dernier main — aucun commit créé."
    exit 0
  fi

  if [ "$EVENEMENT" = "schedule" ]; then
    echo "::warning::Dérive rattrapée par le run planifié : le webhook Supabase → GitHub a manqué au moins un événement. Vérifier le PAT (supabase/sql/webhook_rotate_pat.sql)."
    resume "⚠️ **Dérive rattrapée par le run planifié** — le webhook Supabase → GitHub n'a pas déclenché la régénération. Vérifier le PAT GitHub stocké dans Vault (\`supabase/sql/webhook_rotate_pat.sql\`)."
  fi

  git -c user.name="github-actions[bot]" -c user.email="github-actions[bot]@users.noreply.github.com" \
    commit -q -m "$MESSAGE"
  if git push "$REMOTE" "HEAD:$BRANCHE"; then
    echo "::notice::Publié sur $BRANCHE (tentative $tentative/$TENTATIVES)."
    exit 0
  fi

  echo "::warning::Push refusé (main a avancé) — tentative $tentative/$TENTATIVES : abandon du commit local, repartir du dernier $BRANCHE et régénérer."
  git fetch -q "$REMOTE" "$BRANCHE"
  git reset -q --hard "$REMOTE/$BRANCHE"
  sleep $((tentative * 3))
done

echo "::error::Échec de la publication après $TENTATIVES tentatives (main avance plus vite que la régénération)."
exit 1
