#!/bin/bash
set -euo pipefail

# === Config projet ===
PROJECT_DIR="$HOME/musikmap"
VENV_DIR="$PROJECT_DIR/venv"
MANAGE_PY="$PROJECT_DIR/manage.py"
DJANGO_SETTINGS="la_boite_a_son.settings"   # ~/musikmap/la_boite_a_son/settings.py

# Empêche git de demander un mot de passe / ouverture d'éditeur
export GIT_TERMINAL_PROMPT=0
export GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh -oBatchMode=yes}"
export GIT_EDITOR=true

echo "=== Déploiement Musikmap ==="

# 0) Aller dans le projet
cd "$PROJECT_DIR"

echo "[1/7] Sync Git (fetch + reset hard sur origin/main)..."
# On récupère uniquement la branche main et on s'aligne dessus
git fetch --prune origin main
# On se place exactement sur la révision distante (pas de merge possible)
git reset --hard FETCH_HEAD

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
echo -e '\a'
