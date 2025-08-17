# Gulp Themer Tool v2.1.2 [![pipeline status](https://gitlab-interne.dev.klee.lan.net/ki-dev-front/gulp-themer-tool/badges/master/pipeline.svg)](https://gitlab-interne.dev.klee.lan.net/ki-dev-front/gulp-themer-tool/commits/master)

# Notice d'utilisation de l'outil `GULP`

Outil permettant de compiler `CSS` à partir de fichiers `SASS` ou `LESS`

## Arborescence des fichiers de l'outil

./

├── .gitignore

├── .browserlistrc

├── .sass-lint.yml

├── gulpfile.js

├── projects.json

├── package.json

└── package-lock.json

## Pré requis
 - Avoir `nodejs` => https://nodejs.org/en/download/
 - Et l'outil de gestion de dépendances `npm` => par défaut il est livré avec `nodejs` mais il arrive que celui ci soit dans un package séparé `npm` (dépendant de l'OS)

## Installation
 1. Lancer un terminal
 2. Se placer au niveau du répertoire où se situe l'outil `GULP`
 3. Exécuter la commande `npm ci` (similaire a 'npm install' mais celle la ne modifie pas le fichier lock) pour installer les dépendances dans le répertoire `node_modules/` 

```
/example/theme/ #> npm ci
up to date in 10.95s
/example/theme/ #> 
```

## Utilisation
### Les tâches
Cet outil procède 4 tâches programmées dans le fichier `package.json` :
  - `dev:css`
	  - Permet de compiler le CSS ainsi qu'une SourceMap qui va permettre de mieux débugger notre projet
  -  `watch:css`
	  - Qui lance `dev:css` a chaque fois que l'on fait une modification des sources **(Recommandé en développement)**
  -  `normal:css`
	  - Compilation CSS sans SourceMap **(Recommandé pour le commit sur un outil de versionning)**
  - `prod:css`
	  - Compilation optimisé pour un environnement de production **(Recommandé en production)**

### Pour exécuter ces tâches on utilise `npm`:

`npm run <NOM DE LA TACHE>`

### Example:

```
PS D:\Projets\Drupal\ign\mystore\web\themes\custom> npm run dev:css

> module-themer-ki-sass@2.0.0 dev:css D:\Projets\Drupal\ign\mystore\web\themes\custom
> gulp dev

[15:56:51] Using gulpfile D:\Projets\Drupal\ign\mystore\web\themes\custom\gulpfile.js
[15:56:51] Starting 'dev'...
[15:56:57] Finished 'dev' after 6.16 s
PS D:\Projets\Drupal\ign\mystore\web\themes\custom> 
```

## Configuration
Toutes les configurations se font dans le fichier `projects.json`

````json
{
    "name": "module-themer-ki",
    "version": "2.1.1",
    "config": {
        "partageReseau": false, // Optimiser les performances sur réseau
        "lint": { // activation des services lint par preprocesseur
            "failOnError": true, // Permet l'arret du process en cas d'erreur lint
            "less": false, // non géré actuellement
            "sass": true, // Implémenté & utilisable
            "js": false // non géré actuellement
        },
        "extension": {
            "less": ".less", // Extension des fichiers de source less
            "sass": ".scss" // Extension des fichiers de source sass
        }
    },
    "projects": [
        {
            "name": "Project 1", // NOM facultatif
            "path": "./projects/project1/", // Chemin vers le root du projet
            "compiler": "less", // Compilateur a utiliser
            "lint": false, // linter disabled
            "dir": {
                "src": "less/", // Répertoire source
                "dest": "css/" // Répertoire de destination
            },
            "files": ["styles.less", "test.less"] // List des fichiers sources
        },
        {
            "name": "Project 2", // NOM facultatif
            "path": "./projects/project2/", // Chemin vers le root du projet
            "compiler": "sass", // Compilateur a utiliser
            "lint": true, // linter enabled
            "dir": {
                "src": "sass/", // Répertoire source
                "dest": "css/" // Répertoire de destination
            },
            "files": ["styles.scss", "test.scss"] // List des fichiers sources
        },
        <... Autres projets ...>
    ]
}
````
#### /!\ Attention les commentaires ne sont pas acceptés dans un fichier JSON

## Autres points
### SourceMap
Les tâches `dev:css` & `watch:css` génère des fichier `*.css.map` qui sont en faite les SourceMap. Ils font la jonction entre les fichiers généré CSS et leurs homologue source SASS ou LESS.

### Versionning
Ne pas commit les fichiers générés `.css` et leurs SourceMap `*.css.map`

En règle général, les fichiers générés ne devraient pas être commit car ils sont source de conflits.
