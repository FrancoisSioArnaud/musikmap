# Matrice de tests 1 à 110

Cette matrice reprend la liste des tests définie pour les étapes 2, 3 et 4.

Légende:
- **AUTO (implémenté)** : test ajouté dans le zip
- **MANUEL / E2E** : scénario conservé comme checklist d'exécution manuelle ou future automatisation UI
- **À AUTOMATISER FRONT** : cible naturelle pour une future stack Jest / React Testing Library ou Playwright

## Étape 2 — points / reveal / pin / réactions

1. reveal succès avec assez de points — **AUTO (implémenté)**
2. reveal refusé sans assez de points — **AUTO (implémenté)**
3. second reveal du même dépôt ne redébite pas — **AUTO (implémenté)**
4. reveal guest/non connecté refusé — **AUTO (partiel : non connecté)**
5. reveal sur dépôt introuvable — **AUTO (implémenté)**
6. reveal sur contexte invalide — **AUTO (implémenté)**
7. reveal renvoie toujours le bon `points_balance` — **AUTO (couvert par 1 et 3)**
8. pin succès avec durée valide et assez de points — **AUTO (implémenté)**
9. pin refusé si pin déjà active — **AUTO (implémenté)**
10. pin refusé sans assez de points — **AUTO (implémenté)**
11. pin refusé pour guest — **AUTO (implémenté)**
12. pin refusé si durée invalide — **AUTO (implémenté)**
13. pin refusé si durée non disponible — **AUTO (implémenté)**
14. pin débit + création atomiques — **AUTO (implémenté)**
15. GET pin retourne la pin active correcte — **AUTO (implémenté)**
16. prix pin cohérents avec `pinned_price_steps.json` / economy — **AUTO (couvert par economy + pinned GET)**
17. achat emoji gratuit — **AUTO (implémenté)**
18. achat emoji payant avec assez de points — **AUTO (implémenté)**
19. refus sans assez de points — **AUTO (implémenté)**
20. refus guest — **AUTO (implémenté)**
21. achat emoji déjà possédé — **AUTO (implémenté)**
22. emoji introuvable / inactif — **À AUTOMATISER BACK**
23. réaction succès avec emoji débloqué — **AUTO (implémenté)**
24. changer de réaction remplace la précédente — **AUTO (implémenté)**
25. suppression de réaction — **AUTO (couvert par 26)**
26. suppression de réaction idempotente — **AUTO (implémenté)**
27. réaction refusée si dépôt non révélé — **AUTO (implémenté)**
28. réaction refusée si emoji payant non débloqué — **AUTO (implémenté)**
29. contrainte DB : un seul couple `(user, deposit)` — **AUTO (couvert par 24)**
30. catalogue emoji retourne bien `current_reaction` — **AUTO (implémenté)**
31. dépôt simple crédite les bons points — **AUTO (implémenté)**
32. premier dépôt user sur box crédite le bonus attendu — **AUTO (implémenté)**
33. premier dépôt de la chanson dans la box crédite le bonus attendu — **AUTO (implémenté)**
34. dépôt ultérieur sans bonus ne crédite que le gain de base — **AUTO (implémenté)**
35. les points de dépôt viennent bien du fichier d’économie / config serveur — **AUTO (couvert par economy endpoint)**
36. la réponse de dépôt renvoie toujours `points_balance` correct — **AUTO (implémenté)**
37. coût reveal affiché vient de `economy.reveal_cost` — **À AUTOMATISER FRONT**
38. si `economy` absent, fallback visuel correct — **À AUTOMATISER FRONT**
39. dialog “pas assez de points” sur `INSUFFICIENT_POINTS` — **À AUTOMATISER FRONT**
40. après reveal réussi, UI mise à jour avec chanson révélée — **À AUTOMATISER FRONT**
41. après reveal réussi, points visibles mis à jour — **À AUTOMATISER FRONT**
42. les paliers affichés correspondent aux `price_steps` du back — **À AUTOMATISER FRONT**
43. si prix > points user, état visuel “pas assez de points” — **À AUTOMATISER FRONT**
44. après pin réussie, la pin active s’affiche — **À AUTOMATISER FRONT**
45. points UI mis à jour après pin — **À AUTOMATISER FRONT**
46. emoji payant non possédé affiche le bon bloc d’erreur / dialog — **À AUTOMATISER FRONT**
47. après réaction réussie, la réaction courante est mise à jour — **À AUTOMATISER FRONT**
48. changement de réaction met à jour le résumé — **À AUTOMATISER FRONT**
49. suppression de réaction met à jour le résumé — **À AUTOMATISER FRONT**
50. pas de faux état local si le back refuse la réaction — **À AUTOMATISER FRONT**
51. parcours complet dépôt → reveal → réaction — **MANUEL / E2E**
52. parcours achat emoji → réaction — **MANUEL / E2E**
53. parcours pin avec juste assez de points — **MANUEL / E2E**
54. profil favorite song + vérification points inchangés — **MANUEL / E2E**
55. cohérence des points entre plusieurs écrans après action — **MANUEL / E2E**

## Étape 3 — double action

56. double POST dépôt identique dans la fenêtre courte — **AUTO (implémenté)**
57. double POST dépôt hors fenêtre courte — **À AUTOMATISER BACK**
58. deux requêtes concurrentes de dépôt — **MANUEL / E2E / charge**
59. double POST favorite identique dans la fenêtre courte — **AUTO (implémenté)**
60. double POST favorite avec 2 chansons différentes — **À AUTOMATISER BACK**
61. deux reveals concurrents — **AUTO (séquentiel implémenté)**
62. deux pins concurrentes — **AUTO (séquentiel implémenté)**
63. deux achats concurrents du même emoji — **AUTO (séquentiel implémenté)**
64. deux réactions concurrentes différentes — **AUTO (séquentiel implémenté)**
65. double suppression de réaction — **AUTO (implémenté)**
66. double POST commentaire — **AUTO (implémenté)**
67. double report commentaire — **AUTO (implémenté)**
68. double suppression commentaire — **AUTO (implémenté)**
69. double création de lien — **AUTO (implémenté)**
70. bouton déposer non cliquable pendant soumission — **À AUTOMATISER FRONT**
71. bouton valider réaction non cliquable — **À AUTOMATISER FRONT**
72. suppression de réaction non spammable — **À AUTOMATISER FRONT**
73. bouton partager non spammable — **À AUTOMATISER FRONT**
74. suppression favorite non spammable — **À AUTOMATISER FRONT**
75. valider pin non spammable — **À AUTOMATISER FRONT**
76. soumission commentaire non spammable — **À AUTOMATISER FRONT**
77. double clic rapide ne lance qu’une requête visible — **À AUTOMATISER FRONT**
78. double clic très rapide sur déposer — **MANUEL / E2E**
79. double clic très rapide sur reveal — **MANUEL / E2E**
80. double clic très rapide sur acheter emoji — **MANUEL / E2E**
81. double clic très rapide sur valider réaction — **MANUEL / E2E**
82. double clic très rapide sur pin — **MANUEL / E2E**
83. double clic très rapide sur partager — **MANUEL / E2E**
84. refresh navigateur pendant dépôt — **MANUEL / E2E**
85. refresh pendant reveal — **MANUEL / E2E**
86. refresh pendant pin — **MANUEL / E2E**
87. deux onglets ouverts sur la même action — **MANUEL / E2E**

## Étape 4 — cache / localStorage / refresh réseau

88. endpoint economy renvoie toujours le bon payload — **AUTO (implémenté)**
89. GET pinned renvoie état correct selon pin active / expirée / absente — **AUTO (implémenté)**
90. GET box / GET main cohérents avec l’état courant de la box — **AUTO (implémenté)**
91. box A et box B ont 2 snapshots distincts — **À AUTOMATISER FRONT**
92. box A puis box B n’écrase plus A — **À AUTOMATISER FRONT**
93. Discover de A recharge son propre snapshot — **À AUTOMATISER FRONT**
94. migration douce depuis ancien `mm_box_content` global — **À AUTOMATISER FRONT**
95. Discover lit la clé namespacée correcte — **À AUTOMATISER FRONT**
96. si snapshot absent, comportement attendu — **À AUTOMATISER FRONT / E2E**
97. si snapshot expiré, comportement attendu — **À AUTOMATISER FRONT / E2E**
98. si snapshot corrompu, purge propre + comportement attendu — **À AUTOMATISER FRONT**
99. hydrate pin depuis le snapshot si pin active en cache — **À AUTOMATISER FRONT**
100. si pin active en cache, pas de refresh réseau inutile — **À AUTOMATISER FRONT**
101. si pin expirée localement, refresh réseau déclenché — **À AUTOMATISER FRONT**
102. après expiration locale, `priceSteps` rechargés — **À AUTOMATISER FRONT**
103. si refresh réseau échoue après expiration, état UI cohérent — **À AUTOMATISER FRONT**
104. ouverture du drawer pin avec `priceSteps` disponibles — **À AUTOMATISER FRONT**
105. ajout commentaire met à jour le snapshot local — **À AUTOMATISER FRONT**
106. suppression commentaire met à jour le snapshot local — **À AUTOMATISER FRONT**
107. refresh page après commentaire retrouve le bon état — **À AUTOMATISER FRONT / E2E**
108. reveal met à jour le snapshot — **À AUTOMATISER FRONT**
109. réaction met à jour le snapshot — **À AUTOMATISER FRONT**
110. pin met à jour le snapshot — **À AUTOMATISER FRONT**

## Commandes de lancement (backend automatisé)

```bash
python manage.py test box_management.tests users.tests
python manage.py test box_management.tests.test_points_flows
python manage.py test box_management.tests.test_double_actions
python manage.py test box_management.tests.test_contract_and_public_views users.tests.test_profile_contracts
```
