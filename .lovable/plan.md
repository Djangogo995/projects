
## Vue d'ensemble

On garde **Nebula** (l'app de gestion + IA actuelle) et on ajoute :
1. Une couche **Supabase** qui remplace le `localStorage` actuel
2. Une **synchro GitHub** automatique qui crée des projets à partir de tes repos
3. Un **module d'import** multi-formats (Notion, CSV, Markdown, PDF, HTML) avec liens personnalisés

Tu héberges toi-même (Vercel + ton projet Supabase) — je ne touche pas à Lovable Cloud. Je te fournis tout le SQL et le `.env.example`.

---

## 1. Backend Supabase (setup manuel)

**Livrables** (fichiers à exécuter de ton côté) :
- `supabase/migrations/0001_init.sql` : schéma complet
- `.env.example` : variables nécessaires
- `README-SETUP.md` : étapes pour brancher Supabase + Vercel

**Schéma SQL** (tables principales) :
- `projects` — id, name, description, status, priority, category, deadline, source (`manual` | `github` | `notion` | `import`), source_id, source_url, readme, stars, forks, last_synced_at, hidden, timestamps
- `tasks` — comme aujourd'hui, lié à projects
- `notes` — comme aujourd'hui
- `messages` — comme aujourd'hui (chat IA par projet)
- `tags` — id, name, color (table de référence)
- `project_tags` — many-to-many (projects ↔ tags)
- `project_links` — id, project_id, label, url, kind (`demo` | `docs` | `repo` | `other`) — pour tes liens custom
- `sync_runs` — id, source, started_at, finished_at, status, summary (logs de synchro)

**Sécurité** : RLS activée. Comme tu m'as dit "solo, pas de login", je créerai une policy `USING (true)` pour `anon` avec un commentaire expliquant comment durcir si tu ajoutes l'auth plus tard. Grants explicites.

**Code app** :
- `src/integrations/supabase/client.ts` : client browser (anon key)
- `src/lib/repositories/*.ts` : remplace `src/lib/storage.ts` (même API publique pour minimiser le refactor des composants)
- Migration douce : si `VITE_SUPABASE_URL` absent → fallback `localStorage` (dev local sans Supabase).

---

## 2. Synchro GitHub (bouton manuel + cron quotidien)

**Connecteur GitHub** : je connecte le connecteur Lovable GitHub. Il expose `GITHUB_API_KEY` côté serveur. Pour ton déploiement Vercel, tu mettras un **PAT GitHub classique** dans `GITHUB_TOKEN` — le code gère les deux (priorité au PAT si présent).

**Logique de sync** :
1. `GET /user/repos?per_page=100` (paginé) — récupère tous tes repos
2. Filtre côté code : `repo.topics.includes("portfolio")`
3. Pour chaque repo retenu :
   - Upsert dans `projects` avec `source='github'`, `source_id=repo.id`
   - Champs : `name`, `description`, `source_url=html_url`, `stars=stargazers_count`, `forks=forks_count`
   - Récupère le README via `GET /repos/{owner}/{repo}/readme` (décodage base64) → stocké dans `readme`
   - Récupère les langages via `GET /repos/{owner}/{repo}/languages` → crée/lie les tags
   - Ajoute un `project_link` `kind='repo'` avec l'URL du repo
   - Si `repo.homepage` présent → `project_link` `kind='demo'`
4. **Projets retirés** : tout `project` avec `source='github'` qui n'est plus dans la liste filtrée → `hidden=true` (pas de delete, on garde l'historique tâches/notes)

**Endpoints** :
- `src/lib/github-sync.functions.ts` : `syncGithubProjects()` (createServerFn) — appelé par le bouton
- `src/routes/api/public/cron/github-sync.ts` : route publique pour le cron quotidien, protégée par un header `x-cron-secret` (env var `CRON_SECRET`)

**UI** :
- Sur la page dashboard : section "Sources" avec un bouton "Synchroniser GitHub" + indicateur de dernière synchro + résumé (X importés, Y mis à jour, Z masqués)
- Sur la page projet : si `source='github'`, afficher un badge GitHub, les stars/forks, et un onglet "README" qui rend le markdown

**Cron** : tu le configureras côté Vercel (`vercel.json` cron) ou côté Supabase (`pg_cron`). Je fournis les deux snippets dans le README.

---

## 3. Import multi-formats & Notion

**Dépendances à installer** : `@supabase/supabase-js`, `@notionhq/client`, `papaparse`, `gray-matter`, `pdf-parse`, `cheerio`, `react-markdown`, `remark-gfm`.

⚠️ **Note technique** : `pdf-parse` est Node-only et ne tourne pas sur Cloudflare Workers (le runtime preview Lovable). Comme tu héberges sur **Vercel Node**, ça marchera en prod. En preview Lovable, j'ajoute un message "PDF parsing disponible en production".

**UI nouvelle route** `/import` :
- Sélecteur de source : **Notion**, **CSV**, **Markdown**, **PDF**, **HTML**, **URL**
- Zone upload (drag & drop) + bouton "Analyser"
- Preview des projets détectés avant insertion (édition possible : titre, description, tags, liens)
- Bouton "Importer N projets"

**Server functions** :
- `parseNotion({ databaseId | pageId })` — utilise `@notionhq/client` avec `NOTION_TOKEN` (connecteur Notion → je le connecte aussi)
- `parseCsv({ content })` — papaparse, mapping colonnes flexible
- `parseMarkdown({ content })` — gray-matter pour frontmatter → champs structurés
- `parsePdf({ base64 })` — pdf-parse, extraction texte → IA pour structurer
- `parseHtml({ content | url })` — cheerio, extraction title/meta/h1/links

**Liens personnalisés** : sur chaque page projet, une section "Liens" permet d'ajouter/éditer des `project_links` (label libre, URL, type : démo/docs/autre).

---

## Découpage technique des fichiers

Détail technique :

```text
supabase/migrations/0001_init.sql        # schéma + RLS + grants
.env.example                              # SUPABASE_URL, SUPABASE_ANON_KEY,
                                          # GITHUB_TOKEN, NOTION_TOKEN, CRON_SECRET
README-SETUP.md                           # guide Supabase + Vercel + cron

src/integrations/supabase/client.ts       # createClient browser
src/integrations/supabase/types.ts        # types DB générés
src/lib/repositories/
  ├─ projects.ts                          # même API que storage actuel
  ├─ tasks.ts
  ├─ notes.ts
  ├─ messages.ts
  ├─ tags.ts
  └─ links.ts

src/lib/github-sync.functions.ts          # syncGithubProjects()
src/lib/github-client.server.ts           # fetch wrappers + auth resolver
src/routes/api/public/cron/github-sync.ts # cron endpoint
src/components/sync-panel.tsx             # bouton + status sync

src/lib/importers/
  ├─ notion.functions.ts
  ├─ csv.functions.ts
  ├─ markdown.functions.ts
  ├─ pdf.functions.ts
  └─ html.functions.ts
src/routes/import.tsx                     # UI import
src/components/import/
  ├─ source-picker.tsx
  ├─ preview-table.tsx
  └─ link-editor.tsx

src/components/project-readme.tsx         # rendu markdown du README GitHub
src/components/project-links-panel.tsx    # CRUD project_links
```

**Connecteurs Lovable à lier** (pour le preview) : GitHub, Notion. Les secrets correspondants (`GITHUB_API_KEY`, `NOTION_API_KEY`) seront utilisés via le gateway en preview. En prod Vercel, on bascule sur `GITHUB_TOKEN` / `NOTION_TOKEN` directs via une fonction `getGithubAuth()` / `getNotionAuth()` qui détecte lequel est dispo.

---

## Hors scope (à confirmer si tu veux les ajouter)

- Authentification multi-utilisateurs (tu as dit "solo")
- Webhooks GitHub temps réel (tu as choisi cron quotidien)
- Vue publique portfolio (tu as gardé l'app en gestion privée)
- Migration automatique des données `localStorage` existantes vers Supabase — je peux ajouter un bouton "Migrer mes données locales" si tu veux

## Confirmation

Si tu valides ce plan, je commence par : SQL + .env.example + repositories (étape 1), puis connecteur GitHub + sync (étape 2), puis imports (étape 3). Tu veux que j'inclue la migration des données localStorage existantes ?
