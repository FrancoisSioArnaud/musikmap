#!/bin/bash
set -euo pipefail

# === Config projet ===
PROJECT_DIR="$HOME/musikmap"
VENV_DIR="$PROJECT_DIR/venv"
MANAGE_PY="$PROJECT_DIR/manage.py"
DJANGO_SETTINGS="la_boite_a_son.settings"   # ~/musikmap/la_boite_a_son/settings.py
DEFAULT_BRANCH="main"
BRANCH="$DEFAULT_BRANCH"

usage() {
  cat <<'EOF'
Usage:
  ./deploy.sh
  ./deploy.sh --branch <branche>

Exemples:
  ./deploy.sh
  ./deploy.sh --branch main
  ./deploy.sh --branch develop
  ./deploy.sh --branch feature/discover-search
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch)
      if [[ $# -lt 2 || -z "${2:-}" || "${2:0:1}" == "-" ]]; then
        echo "Erreur: --branch attend un nom de branche." >&2
        usage >&2
        exit 2
      fi
      BRANCH="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Erreur: argument inconnu: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

# Empêche git de demander un mot de passe / ouverture d'éditeur
export GIT_TERMINAL_PROMPT=0
export GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh -oBatchMode=yes}"
export GIT_EDITOR=true

echo "=== Déploiement Musikmap ==="
echo "Branche demandée: origin/$BRANCH"

# 0) Aller dans le projet
cd "$PROJECT_DIR"

echo "[1/7] Sync Git (fetch + reset hard sur origin/$BRANCH)..."
if ! git ls-remote --exit-code --heads origin "$BRANCH" >/dev/null; then
  echo "Erreur: la branche distante origin/$BRANCH n'existe pas." >&2
  exit 1
fi

# On récupère uniquement la branche demandée et on aligne le serveur dessus.
git fetch --prune origin "refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"

# On se place exactement sur la révision distante (pas de merge possible).
git reset --hard "origin/$BRANCH"
DEPLOYED_COMMIT="$(git rev-parse --short HEAD)"
echo "Commit déployé: $DEPLOYED_COMMIT"

echo "[2/7] Build du JS..."
cd "$PROJECT_DIR/frontend"
npm run build

echo "[2.2/7] Build du CSS..."
cd "$PROJECT_DIR/frontend/assets"
npm run prod:css


echo "[3/7] Migrations & collectstatic Django..."
cd "$PROJECT_DIR"
source "$VENV_DIR/bin/activate"
export DJANGO_SETTINGS_MODULE="$DJANGO_SETTINGS"

python "$MANAGE_PY" makemigrations
python "$MANAGE_PY" migrate
python "$MANAGE_PY" collectstatic --noinput

echo "[4/7] (Optionnel) Vérification rapide des settings en cours"
python - <<'PY'
import os
from django.conf import settings
import django
django.setup()
print("DJANGO_SETTINGS_MODULE =", os.environ.get("DJANGO_SETTINGS_MODULE"))
print("DB ENGINE =", settings.DATABASES['default']['ENGINE'])
print("DB NAME   =", settings.DATABASES['default']['NAME'])
PY

echo "[5/7] Redémarrage services..."
sudo systemctl daemon-reload
sudo systemctl enable gunicorn
sudo systemctl restart gunicorn
sudo systemctl reload nginx

echo "=== Déploiement terminé avec succès ✅ ==="
echo "Branche déployée: origin/$BRANCH"
echo "Commit déployé: $DEPLOYED_COMMIT"
echo -e '\a'
